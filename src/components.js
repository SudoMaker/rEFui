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
import { nop, emptyArr, removeFromArr, isThenable, markStatic, nullRefObject } from 'refui/utils'
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

	return renderer.ensureElement(run(renderComponent, renderer)[0])
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

async function _lazyLoad(loader, ident, ...args) {
	const run = snapshot()
	if (!this.cache) {
		this.cache = new Promise(async function(resolve, reject) {
			let result = await loader()

			if (result && !((ident === undefined || ident === null) && typeof result === 'function')) {
				result = result[ident ?? 'default']
			}

			if (!result) {
				reject(new SyntaxError('Lazy loader failed to resolve component'))
				return
			}

			if (hotEnabled) {
				const component = result
				result = function(...args) {
					return function(R) {
						return R.c(component, ...args)
					}
				}
			}

			resolve(result)
		})
	}

	return run(await this.cache, ...args)
}
function lazy(loader, ident) {
	return _lazyLoad.bind({ cache: null }, loader, ident)
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

function dummyRun(fn) {
	let result = null
	const cleanup = collectDisposers([], function() {
		result = fn()
	})
	return [result, cleanup]
}
function Fn({ name = 'Fn', ctx, catch: catchErr }, handler, handleErr) {
	if (!handler) {
		return nop
	}

	if (!catchErr) {
		catchErr = handleErr
	}

	const run = currentCtx?.run ?? dummyRun

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
					let newResult = null
					let errored = false
					try {
						newResult = R.ensureElement(newRender)
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
markStatic(Fn)

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
			const currentDataLength = currentData.length
			for (let i = 0; i < currentDataLength; i++) {
				const sig = ks.get(currentData[i])
				sig.set(i)
			}
		}
	}

	onDispose(_clear)

	function clear() {
		if (!currentData.length) return
		_clear()
		if (kv) kv = new Map()
		currentData = []
		if (isSignal(entries) && entries.peek()?.length) entries.set([])
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
				const currentDataLength = currentData.length
				const obsoleteDataKeys = [...new Set([...currentData, ...oldData])].slice(currentDataLength)

				if (obsoleteDataKeys.length === oldData.length) {
					_clear()
					newData = currentData
				} else {
					const obsoleteDataKeysLength = obsoleteDataKeys.length
					if (obsoleteDataKeysLength) {
						for (let i = 0; i < obsoleteDataKeysLength; i++) {
							disposers.get(obsoleteDataKeys[i])()
							removeFromArr(oldData, obsoleteDataKeys[i])
						}
					}

					const newDataKeys = [...new Set([...oldData, ...currentData])].slice(oldData.length)
					const hasNewKeys = !!newDataKeys.length

					let newDataCursor = 0

					while (newDataCursor < currentDataLength) {

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

						const oldDataLength = oldData.length
						while (oldDataCursor < oldDataLength) {
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

						const frontSetLength = frontSet.length
						for (let i = 0; i < frontSetLength; i++) {
							const fChunk = frontSet[i]
							const bChunk = backSet[i]

							if (fChunk.length <= bChunk.length) {
								const beforeAnchor = getItemNode(bChunk[0])
								backSet[i + 1] = bChunk.concat(backSet[i + 1])
								bChunk.length = 0

								const fChunkLength = fChunk.length
								for (let j = 0; j < fChunkLength; j++) {
									R.insertBefore(getItemNode(fChunk[j]), beforeAnchor)
								}
							} else if (backSet[i + 1].length) {
								const beforeAnchor = getItemNode(backSet[i + 1][0])

								const bChunkLength = bChunk.length
								for (let j = 0; j < bChunkLength; j++) {
									R.insertBefore(getItemNode(bChunk[j]), beforeAnchor)
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
				const newDataLength = newData.length
				for (let i = 0; i < newDataLength; i++) {
					const node = getItemNode(newData[i])
					if (node) R.appendNode(fragment, node)
				}
			}

			flushKS()
		})

		return fragment
	}
}
markStatic(For)

function If({ condition, true: trueCondition, else: otherwise }, trueBranch, falseBranch) {
	if (otherwise) {
		falseBranch = otherwise
	}
	if (trueCondition) {
		condition = trueCondition
	}

	if (isSignal(condition)) {
		condition = condition.get.bind(condition)
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
markStatic(If)

function _dynContainer(name, catchErr, ctx, props, ...children) {
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
function Dynamic({ is, current, ...props }, ...children) {
	if (current) {
		props.$ref = current
	}
	return _dynContainer.call(is, 'Dynamic', null, null, props, ...children)
}
markStatic(Dynamic)

let currentFutureList = null

// Internal, no document/.d.ts needed
// DON'T USE UNLESS YOU UNDERSTAND WHAT IT DOES
function _asyncContainer(name, fallback, catchErr, onLoad, suspensed, props, children) {
	const component = signal()
	let currentDispose = null
	let disposed = false
	let _resolve = null

	onDispose(function() {
		disposed = true
	})

	// `this` should and is guaranteed to be a Promise
	let resolvedFuture = this
	if (onLoad) {
		resolvedFuture = resolvedFuture.then(async function(val) {
			if (disposed) {
				return
			}
			await onLoad()
			return val
		})
	}

	resolvedFuture = resolvedFuture.then(capture(function(result) {
		if (disposed) {
			_resolve?.()
			return
		}
		currentDispose?.()
		currentDispose = watch(function() {
			component.set(read(result))
		})
	}))

	if (catchErr) {
		resolvedFuture = resolvedFuture.catch(capture(function(error) {
			if (disposed) {
				_resolve?.()
				return
			}
			currentDispose?.()
			currentDispose = watch(function () {
				const handler = read(catchErr)
				if (handler) {
					if (typeof handler === 'function') {
						component.set(handler({ ...props, error }, ...children))
					} else {
						component.set(handler)
					}
				}
			})
		}))
	}

	if (fallback) {
		nextTick(capture(function() {
			if (disposed || component.peek()) {
				_resolve?.()
				return
			}
			currentDispose?.()
			currentDispose = watch(function () {
				const handler = read(fallback)
				if (handler) {
					if (typeof handler === 'function') {
						component.set(function() {
							return handler({ ...props }, ...children)
						})
					} else {
						component.set(handler)
					}
				}
			})
		}))
	}

	if (!fallback && suspensed && currentFutureList) {
		const { promise, resolve, reject } = Promise.withResolvers()
		_resolve = resolve
		currentFutureList.push(promise)
		let currentFn = component.peek()
		let currentRender = null

		const _props = {
			...props,
			name: null,
			onLoad() {
				resolve()
			},
			catch(props) {
				reject(props.error)
				return catchErr?.(props)
			}
		}

		return Fn({ name: isProduction ? null : `${name}(suspensed)` }, function() {
			const renderFn = component.get()
			if (currentFn === renderFn) {
				return currentRender
			}
			currentFn = renderFn
			return (currentRender = Suspense(_props, renderFn))
		})
	}

	return Fn({ name }, component.get.bind(component))
}

function Async({ name = 'Async', future, fallback, catch: catchErr, onLoad, suspensed = true, ...props }, then, now, handleErr) {
	while (typeof future === 'function') {
		future = future()
	}
	future = (isThenable(future) ? future : Promise.resolve(future)).then(capture(function(result) {
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
	return _asyncContainer.bind(future, name, fallback ?? now, catchErr ?? handleErr, onLoad, suspensed, props, emptyArr)
}
markStatic(Async)

function Suspense({ name = 'Suspense', fallback, catch: catchErr, onLoad, ...props }, ...children) {
	if (!children.length) {
		return
	}

	return function(R) {
		const prevFutureList = currentFutureList
		currentFutureList = []

		const future = new Promise(function(resolve) {
			resolve(children.map(R.ensureElement))
		})

		const _future = currentFutureList.length ? Promise.all(currentFutureList).then(function() {
			return future
		}) : future

		const result = _asyncContainer.call(_future, name, fallback, catchErr, onLoad, false, props, children)(R)

		currentFutureList = prevFutureList
		return result
	}
}
markStatic(Suspense)

function Transition({ name = 'Transition', data, onLoad: userOnLoad, fallback, loading: userLoading, pending: userPending, catch: catchErr }, then, now, handleErr) {
	return function(R) {
		const loading = isSignal(userLoading) ? userLoading : signal(false)
		const pending = isSignal(userPending) ? userPending : signal(false)
		const currentElement = signal()
		data ??= Object.create(null)

		let currentState = null

		let disposed = false
		let currentDispose = null
		let pendingDispose = null
		let pendingElement = null

		onDispose(function() {
			disposed = true
			if (pendingDispose) {
				pendingDispose()
				pendingDispose = null
				pendingElement = null
				pending.set(false)
			}
			if (currentDispose) {
				currentDispose()
				currentDispose = null
			}
			currentState = null
		})

		function createState() {
			const leaving = signal(false)
			const entered = signal(false)
			const entering = entered.inverse()

			return {
				__proto__: null,
				loading,
				pending,
				leaving,
				entered,
				entering,
				data
			}
		}

		async function _onLoad(_pendingElement, state) {
			if (disposed) {
				return
			}

			if (userOnLoad) {
				if (currentState && currentElement.peek()) {
					currentState.leaving.set(true)
				}
				let swapped = false
				function swap() {
					if (swapped) {
						return
					}
					currentElement.set(_pendingElement)
					swapped = true
					return nextTick()
				}
				await userOnLoad(state, !!currentState, swap)
				currentState = state
				if (swapped) {
					return
				}
			}

			currentElement.set(_pendingElement)
		}

		watch(function() {
			const state = createState()

			const future = new Promise(function(resolve) {
				resolve(then(state))
			})

			let _dispose = null
			let _element = null

			if (pendingDispose) {
				pendingDispose()
				pendingDispose = null
			}

			async function onLoad() {
				if (_element !== pendingElement) {
					_dispose()
					return
				}

				loading.set(false)
				await _onLoad(pendingElement, state)

				if (_dispose !== pendingDispose) {
					_dispose()
					return
				}

				pending.set(false)

				currentDispose?.()
				currentDispose = pendingDispose
				pendingDispose = null
				pendingElement = null
			}

			pendingDispose = _dispose = collectDisposers([], function() {
				pendingElement = _element = Suspense({ name: 'TransitionContainer', onLoad, catch: catchErr ?? handleErr, state }, function() {
					return future
				})(R)
			})

			loading.set(true)
			pending.set(true)
		})

		if (fallback) {
			nextTick(capture(function() {
				if (disposed || currentElement.peek()) {
					return
				}
				currentDispose = watch(function() {
					const handler = read(fallback)
					if (handler) {
						const state = createState()
						if (typeof handler === 'function') {
							_onLoad(handler.bind(null, state), state)
						} else {
							_onLoad(handler, state)
						}
					}
				})
			}))
		}

		return Fn({ name }, currentElement.get.bind(currentElement))
	}
}
markStatic(Transition)

function Render({ from }) {
	return Fn({ name: 'Render' }, function() {
		const instance = read(from)
		if (instance !== null && instance !== undefined) return render(instance, R)
	})
}
markStatic(Render)

class Component {
	constructor(tpl, props, ...children) {
		const ctx = {
			run: null,
			render: null,
			dispose: null,
			self: this
		}

		const prevCtx = currentCtx
		currentCtx = ctx

		const disposers = []

		ctx.run = capture(function(fn, ...args) {
			let result = null
			const cleanup = collectDisposers([], function() {
				result = fn(...args)
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
					const { fallback, catch: catchErr, onLoad, suspensed = true, ..._props } = props
					renderFn = _asyncContainer.call(renderFn, 'Future', fallback, catchErr, onLoad, suspensed, _props, children)
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
markStatic(Component)

const createComponent = (function() {
	function createComponentRaw(tpl, props, ...children) {
		if (isSignal(tpl)) {
			return new Component(_dynContainer.bind(tpl, 'Dynamic(signal)', null, null), props ?? Object.create(null), ...children)
		}
		const { $ref, ..._props } = (props ?? nullRefObject)
		const component = new Component(tpl, _props, ...children)
		if ($ref) {
			if (isSignal($ref)) {
				$ref.set(component)
			} else if (typeof $ref === 'function') {
				$ref(component)
			} else if (!isProduction) {
				throw new Error(`Invalid $ref type: ${typeof $ref}`)
			}
		}
		return component
	}

	if (hotEnabled) {
		function makeDyn(tpl, handleErr) {
			return _dynContainer.bind(tpl, null, handleErr, tpl)
		}
		return enableHMR({ makeDyn, Component, createComponentRaw })
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
	Suspense,
	Transition,
	Render,
	Component,
	createComponent,
	_asyncContainer
}
