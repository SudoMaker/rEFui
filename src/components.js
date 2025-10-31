/* Copyright Yukino Song, SudoMaker Ltd.
 *
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * 	http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { collectDisposers, nextTick, read, peek, watch, onDispose, freeze, signal, isSignal, contextValid } from 'refui/signal'
import { hotEnabled, enableHMR } from 'refui/hmr'
import { nop, removeFromArr, isThenable, isPrimitive } from 'refui/utils'
import { isProduction } from 'refui/constants'

const KEY_CTX = Symbol(isProduction ? '' : 'K_Ctx')

let currentCtx = null

function _captured({ ctx }, ...args) {
	const prevCtx = currentCtx
	currentCtx = ctx

	try {
		return this(...args)
	} finally {
		currentCtx = prevCtx
	}
}

const _invalidateCapture = function() {
	this.ctx = null
}
function capture(fn) {
	const state = { ctx: currentCtx }
	onDispose(_invalidateCapture.bind(state))
	return freeze(_captured.bind(fn, state))
}

function _runInSnapshot(fn, ...args) {
	return fn(...args)
}
function snapshot() {
	return capture(_runInSnapshot)
}

function render(instance, renderer) {
	const ctx = instance[KEY_CTX]
	if (!ctx) {
		return
	}

	const { run, render: renderComponent } = ctx
	if (!renderComponent || typeof renderComponent !== 'function') return renderComponent

	return run(renderComponent, renderer)[0]
}

function dispose(instance) {
	const ctx = instance[KEY_CTX]
	if (!ctx) {
		return
	}

	ctx.dispose()
}

function getCurrentSelf() {
	return currentCtx?.self
}

async function _lazyLoad(loader, symbol, ...args) {
	const run = snapshot()
	if (!this.cache) {
		const result = await loader()
		if ((symbol === undefined || symbol === null) && typeof result === 'function') {
			this.cache = result
		} else {
			this.cache = result[symbol ?? 'default']
		}

		if (hotEnabled) {
			const component = this.cache
			this.cache = function(...args) {
				return function(R) {
					return R.c(component, ...args)
				}
			}
		}
	}

	return run(this.cache, ...args)
}
function lazy(loader, symbol) {
	return _lazyLoad.bind({ cache: null }, loader, symbol)
}

function memo(fn) {
	let cached = null
	const captured = capture(fn)
	return function(...args) {
		if (cached) return cached
		return (cached = captured(...args))
	}
}
function useMemo(fn) {
	return function() {
		return memo(fn)
	}
}

function Fn({ name = 'Fn', ctx, catch: catchErr }, handler, handleErr) {
	if (!handler) {
		return nop
	}

	if (!catchErr) {
		catchErr = handleErr
	}

	const run = currentCtx?.run

	if (!run) {
		return nop
	}

	return function(R) {
		const fragment = R.createFragment(name)
		let currentRender = null
		let currentDispose = null

		watch(function() {
			const newHandler = read(handler)

			if (!newHandler) {
				currentDispose?.()
				currentRender = currentDispose = null
				return
			}

			const newRender = newHandler(ctx)
			if (newRender === currentRender) {
				return
			}

			currentRender = newRender
			if (newRender !== undefined && newRender !== null) {
				const prevDispose = currentDispose
				currentDispose = run(function() {
					let newResult = newRender
					let errored = false
					try {
						while (typeof newResult === 'function') {
							newResult = newResult(R)
						}
						newResult = R.ensureElement(newResult)
					} catch (err) {
						errored = true
						const errorHandler = peek(catchErr)
						if (errorHandler) {
							newResult = R.ensureElement(errorHandler(err, name, ctx))
						} else {
							throw err
						}
					}

					if (!errored && prevDispose) {
						prevDispose()
					}

					if (newResult !== undefined && newResult !== null) {
						R.appendNode(fragment, newResult)
						onDispose(nextTick.bind(null, R.removeNode.bind(null, newResult)))
					} else {
						if (errored && prevDispose) {
							onDispose(prevDispose)
						}
					}
				})[1]
			} else {
				currentDispose?.()
				currentDispose = null
			}
		})

		return fragment
	}
}

function For({ name = 'For', entries, track, indexed, expose }, itemTemplate) {
	let currentData = []

	let kv = track && new Map()
	let ks = indexed && new Map()
	let nodeCache = new Map()
	let disposers = new Map()

	function _clear() {
		for (let [, _dispose] of disposers) _dispose(true)
		nodeCache = new Map()
		disposers = new Map()
		if (ks) ks = new Map()
	}

	function flushKS() {
		if (ks) {
			for (let i = 0; i < currentData.length; i++) {
				const sig = ks.get(currentData[i])
				sig.value = i
			}
		}
	}

	onDispose(_clear)

	function clear() {
		if (!currentData.length) return
		_clear()
		if (kv) kv = new Map()
		currentData = []
		if (entries.value.length) entries.value = []
	}

	if (expose) {
		function getItem(itemKey) {
			return (kv ? kv.get(itemKey) : itemKey)
		}
		function remove(itemKey) {
			const itemData = getItem(itemKey)
			removeFromArr(peek(entries), itemData)
			entries.trigger()
		}

		expose({
			getItem,
			remove,
			clear
		})
	}

	return function(R) {
		const fragment = R.createFragment(name)

		function getItemNode(itemKey) {
			let node = nodeCache.get(itemKey)
			if (!node) {
				const item = kv ? kv.get(itemKey) : itemKey
				let idxSig = ks ? ks.get(itemKey) : 0
				if (ks && !idxSig) {
					idxSig = signal(0)
					ks.set(itemKey, idxSig)
				}
				const dispose = collectDisposers(
					[],
					function() {
						node = R.c(itemTemplate, { item, index: idxSig })
						nodeCache.set(itemKey, node)
					},
					function(batch) {
						if (!batch) {
							nodeCache.delete(itemKey)
							disposers.delete(itemKey)
							if (ks) ks.delete(itemKey)
							if (kv) kv.delete(itemKey)
						}
						if (node) R.removeNode(node)
					}
				)
				disposers.set(itemKey, dispose)
			}
			return node
		}

		// eslint-disable-next-line complexity
		watch(function() {
			/* eslint-disable max-depth */
			const data = read(entries)
			if (!data || !data.length) return clear()

			let oldData = currentData
			if (track) {
				kv = new Map()
				const key = read(track)
				currentData = data.map(function(i) {
					const itemKey = i[key]
					kv.set(itemKey, i)
					return itemKey
				})
			} else currentData = [...data]

			let newData = null

			if (oldData.length) {
				const obsoleteDataKeys = [...new Set([...currentData, ...oldData])].slice(currentData.length)

				if (obsoleteDataKeys.length === oldData.length) {
					_clear()
					newData = currentData
				} else {
					if (obsoleteDataKeys.length) {
						for (let oldItemKey of obsoleteDataKeys) {
							disposers.get(oldItemKey)()
							removeFromArr(oldData, oldItemKey)
						}
					}

					const newDataKeys = [...new Set([...oldData, ...currentData])].slice(oldData.length)
					const hasNewKeys = !!newDataKeys.length

					let newDataCursor = 0

					while (newDataCursor < currentData.length) {

						if (!oldData.length) {
							if (newDataCursor) newData = currentData.slice(newDataCursor)
							break
						}

						const frontSet = []
						const backSet = []

						let frontChunk = []
						let backChunk = []

						let prevChunk = frontChunk

						let oldDataCursor = 0
						let oldItemKey = oldData[0]

						let newItemKey = currentData[newDataCursor]

						while (oldDataCursor < oldData.length) {
							const isNewKey = hasNewKeys && newDataKeys.includes(newItemKey)
							if (isNewKey || oldItemKey === newItemKey) {
								if (prevChunk !== frontChunk) {
									backSet.push(backChunk)
									backChunk = []
									prevChunk = frontChunk
								}

								frontChunk.push(newItemKey)

								if (isNewKey) {
									R.insertBefore(getItemNode(newItemKey), getItemNode(oldItemKey))
								} else {
									oldDataCursor += 1
									oldItemKey = oldData[oldDataCursor]
								}
								newDataCursor += 1
								newItemKey = currentData[newDataCursor]
							} else {
								if (prevChunk !== backChunk) {
									frontSet.push(frontChunk)
									frontChunk = []
									prevChunk = backChunk
								}
								backChunk.push(oldItemKey)
								oldDataCursor += 1
								oldItemKey = oldData[oldDataCursor]
							}
						}

						if (prevChunk === frontChunk) {
							frontSet.push(frontChunk)
						}

						backSet.push(backChunk)
						frontSet.shift()

						for (let i = 0; i < frontSet.length; i++) {
							const fChunk = frontSet[i]
							const bChunk = backSet[i]

							if (fChunk.length <= bChunk.length) {
								const beforeAnchor = getItemNode(bChunk[0])
								backSet[i + 1] = bChunk.concat(backSet[i + 1])
								bChunk.length = 0

								for (let itemKey of fChunk) {
									R.insertBefore(getItemNode(itemKey), beforeAnchor)
								}
							} else if (backSet[i + 1].length) {
								const beforeAnchor = getItemNode(backSet[i + 1][0])
								for (let itemKey of bChunk) {
									R.insertBefore(getItemNode(itemKey), beforeAnchor)
								}
							} else {
								R.appendNode(fragment, ...bChunk.map(getItemNode))
							}
						}

						oldData = [].concat(...backSet)
					}
				}
			} else {
				newData = currentData
			}

			if (newData) {
				for (let newItemKey of newData) {
					const node = getItemNode(newItemKey)
					if (node) R.appendNode(fragment, node)
				}
			}

			flushKS()
		})

		return fragment
	}
}

function If({ condition, true: trueCondition, else: otherwise }, trueBranch, falseBranch) {
	if (otherwise) {
		falseBranch = otherwise
	}
	if (trueCondition) {
		condition = trueCondition
	}

	if (isSignal(condition)) {
		return Fn({ name: 'If' }, function() {
			if (condition.value) {
				return trueBranch
			} else {
				return falseBranch
			}
		})
	}

	if (typeof condition === 'function') {
		return Fn({ name: 'If' }, function() {
			if (condition()) {
				return trueBranch
			} else {
				return falseBranch
			}
		})
	}

	if (condition) return trueBranch
	return falseBranch
}

function _dynContainer(name, catchErr, ctx, { $ref, ...props }, ...children) {
	const self = currentCtx.self

	let syncRef = null

	if ($ref) {
		if (isSignal($ref)) {
			syncRef = function(node) {
				$ref.value = node
			}
		} else if (typeof $ref === 'function') {
			syncRef = $ref
		} else if (!isProduction) {
			throw new Error(`Invalid $ref type: ${typeof $ref}`)
		}
	}

	let oldCtx = null
	props.$ref = (newInstance) => {
		if (oldCtx) {
			oldCtx.wrapper = null
			oldCtx = null
		}

		const newCtx = newInstance?.[KEY_CTX]
		if (newCtx) {
			newCtx.wrapper = self
			oldCtx = newCtx
		}

		syncRef?.(newInstance)
	}

	let current = null
	let renderFn = null

	return Fn({ name, ctx }, () => {
		const component = read(this)
		if (current === component) {
			return renderFn
		}

		if (component === undefined || component === null) {
			return (current = renderFn = null)
		}

		current = component
		renderFn = function(R) {
			return R.c(component, props, ...children)
		}

		return renderFn
	}, catchErr)
}
function Dynamic({ is, ctx, expose, ...props }, ...children) {
	if (expose) {
		props.$ref = signal()
		expose?.({
			current: props.$ref
		})
	}
	return _dynContainer.call(is, 'Dynamic', null, ctx, props, ...children)
}

function _asyncContainer(name, fallback, catchErr, props, ...children) {
	const self = getCurrentSelf()
	const component = signal()
	let currentDispose = null

	const inputFuture = Promise.resolve(this)
	const resolvedFuture = inputFuture.then(capture(function(result) {
		if (self[KEY_CTX]) {
			currentDispose?.()
			currentDispose = watch(function() {
				component.value = read(result)
			})
		}
	}))

	if (catchErr) {
		resolvedFuture.catch(capture(function(error) {
			if (self[KEY_CTX]) {
				currentDispose?.()
				currentDispose = watch(function () {
					const handler = read(catchErr)
					if (handler) {
						if (typeof handler === 'function') {
							component.value = handler({ ...props, error }, ...children)
						} else {
							component.value = handler
						}
					}
				})
			}
		}))
	}

	if (fallback) {
		nextTick(capture(function() {
			if (self[KEY_CTX] && !component.peek()) {
				currentDispose?.()
				currentDispose = watch(function () {
					const handler = read(fallback)
					if (handler) {
						if (typeof handler === 'function') {
							component.value = handler({ ...props }, ...children)
						} else {
							component.value = handler
						}
					}
				})
			}
		}))
	}

	return Fn({ name }, function() {
		return component.value
	})
}

function Async({ future, fallback, catch: catchErr, ...props }, then, now, handleErr) {
	future = Promise.resolve(future).then(capture(function(result) {
		let lastResult = null
		let lastHandler = null
		return Fn({ name: 'Then' }, function() {
			if (!contextValid) {
				return
			}
			const handler = read(then)
			if (handler === lastHandler) {
				return lastResult
			}
			lastHandler = handler
			return (lastResult = handler?.({ ...props, result }))
		})
	}))
	return _asyncContainer.call(future, 'Async', fallback ?? now, catchErr ?? handleErr, props)
}

function Render({ from }) {
	return function(R) {
		return R.c(Fn, { name: 'Render' }, function() {
			const instance = read(from)
			if (instance !== null && instance !== undefined) return render(instance, R)
		})
	}
}

class Component {
	constructor(tpl, props, ...children) {
		const ctx = {
			run: null,
			render: null,
			dispose: null,
			wrapper: null,
			self: this
		}

		const prevCtx = currentCtx
		currentCtx = ctx

		const disposers = []

		ctx.run = capture(function(fn, ...args) {
			let result = fn
			const cleanup = collectDisposers([], function() {
				do {
					result = result(...args)
				} while (typeof result === 'function')
			}, function(batch) {
				if (!batch) {
					removeFromArr(disposers, cleanup)
				}
			})
			disposers.push(cleanup)
			return [result, cleanup]
		})

		try {
			ctx.dispose = collectDisposers(disposers, function() {
				let renderFn = tpl(props, ...children)
				if (isThenable(renderFn)) {
					const { fallback, catch: catchErr, ..._props } = props
					renderFn = _asyncContainer.call(renderFn, 'Future', fallback, catchErr, _props, ...children)
				}
				ctx.render = renderFn
			}, () => {
				Object.defineProperty(this, KEY_CTX, {
					value: null,
					enumerable: false
				})
			})
		} catch (error) {
			for (let i of disposers) i(true)
			throw error
		} finally {
			currentCtx = prevCtx
		}

		Object.defineProperty(this, KEY_CTX, {
			value: ctx,
			enumerable: false,
			configurable: true
		})
	}
}

const emptyProp = { $ref: null }
const createComponent = (function() {
	function createComponentRaw(tpl, props, ...children) {
		if (isSignal(tpl)) {
			return new Component(_dynContainer.bind(tpl, 'Signal', null, null), props ?? {}, ...children)
		}
		const { $ref, ..._props } = (props ?? emptyProp)
		const component = new Component(tpl, _props, ...children)
		if ($ref) {
			if (isSignal($ref)) {
				$ref.value = component
			} else if (typeof $ref === 'function') {
				$ref(component)
			} else if (!isProduction) {
				throw new Error(`Invalid $ref type: ${typeof $ref}`)
			}
		}
		return component
	}

	if (hotEnabled) {
		const builtins = new WeakSet([Fn, For, If, Dynamic, Async, Render, Component])
		function makeDyn(tpl, handleErr) {
			return _dynContainer.bind(tpl, null, handleErr, tpl)
		}
		return enableHMR({ builtins, makeDyn, Component, createComponentRaw })
	}

	return createComponentRaw
})()

export {
	capture,
	snapshot,
	render,
	dispose,
	getCurrentSelf,
	lazy,
	memo,
	useMemo,
	Fn,
	For,
	If,
	Dynamic,
	Async,
	Render,
	Component,
	createComponent
}
