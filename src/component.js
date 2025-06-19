import { collectDisposers, tick, nextTick, read, peek, watch, onDispose, freeze, signal, isSignal } from './signal.js'
import { nop, removeFromArr, isThenable, isPrimitive } from './utils.js'

const KEY_CTX = Symbol(process.env.NODE_ENV === 'production' ? '' : 'K_Ctx')

let currentCtx = null

function _captured(capturedCtx, ...args) {
	const prevCtx = currentCtx
	currentCtx = capturedCtx

	try {
		return this(...args)
	} finally {
		currentCtx = prevCtx
	}
}

const capture = (fn) => _captured.bind(freeze(fn), currentCtx)

function _runInSnapshot(fn, ...args) {
	return fn(...args)
}
const snapshot = () => capture(_runInSnapshot)

const expose = (kvObj) => {
	if (!currentCtx || isPrimitive(kvObj)) {
		return
	}

	const entries = Object.entries(kvObj)
	if (entries.length) {
		currentCtx.hasExpose = true

		const descriptors = entries.reduce((descriptors, [key, value]) => {
			if (isSignal(value)) {
				descriptors[key] = {
					get: value.get.bind(value),
					set: value.set.bind(value),
					enumerable: true,
					configurable: true
				}
			} else {
				descriptors[key] = {
					value,
					enumerable: true,
					configurable: true
				}
			}

			return descriptors
		}, {})

		Object.defineProperties(currentCtx.self, descriptors)

		if (currentCtx.wrapper) {
			Object.defineProperties(currentCtx.wrapper, descriptors)
		}
	}
}

const render = (instance, renderer) => {
	const ctx = instance[KEY_CTX]
	if (!ctx) {
		return
	}

	const { run, render: renderComponent } = ctx
	if (!renderComponent || typeof renderComponent !== 'function') return renderComponent

	return run(renderComponent, renderer)[0]
}

const dispose = (instance) => {
	const ctx = instance[KEY_CTX]
	if (!ctx) {
		return
	}

	ctx.dispose()
}

const getCurrentSelf = () => currentCtx?.self

const Fn = ({ name = 'Fn', ctx }, handler, handleError) => {
	if (!handler) {
		return nop
	}

	const run = currentCtx?.run

	if (!run) {
		return nop
	}

	return (R) => {
		const fragment = R.createFragment(name)
		let currentRender = null
		let currentDispose = null

		watch(() => {
			const newRender = read(handler(read(ctx)))
			if (newRender === currentRender) return
			currentRender = newRender
			if (newRender) {
				const prevDispose = currentDispose
				currentDispose = run(() => {
					let newResult = null
					let errored = false
					try {
						newResult = R.ensureElement((typeof newRender === 'function') ? newRender(R) : newRender)
					} catch (err) {
						errored = true
						const errorHandler = peek(handleError)
						if (errorHandler) {
							newResult = R.ensureElement(errorHandler(err, name, ctx))
						} else {
							throw err
						}
					}

					if (!errored && prevDispose) {
						prevDispose()
					}

					if (newResult) {
						R.appendNode(fragment, newResult)
						onDispose(() => {
							nextTick(() => R.removeNode(newResult))
						})
					} else {
						if (errored) {
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

const For = ({ name = 'For', entries, track, indexed }, item) => {
	let currentData = []

	let kv = track && new Map()
	let ks = indexed && new Map()
	let nodeCache = new Map()
	let disposers = new Map()

	const _clear = () => {
		for (let [, _dispose] of disposers) _dispose(true)
		nodeCache = new Map()
		disposers = new Map()
		if (ks) ks = new Map()
	}

	const flushKS = () => {
		if (ks) {
			for (let i = 0; i < currentData.length; i++) {
				const sig = ks.get(currentData[i])
				sig.value = i
			}
		}
	}

	const getItem = itemKey => (kv ? kv.get(itemKey) : itemKey)
	const remove = (itemKey) => {
		const itemData = getItem(itemKey)
		removeFromArr(peek(entries), itemData)
		entries.trigger()
	}
	const clear = () => {
		if (!currentData.length) return
		_clear()
		if (kv) kv = new Map()
		currentData = []
		if (entries.value.length) entries.value = []
	}

	onDispose(_clear)

	expose({
		getItem,
		remove,
		clear
	})

	return (R) => {
		const fragment = R.createFragment(name)

		const getItemNode = (itemKey) => {
			let node = nodeCache.get(itemKey)
			if (!node) {
				const newDataItem = kv ? kv.get(itemKey) : itemKey
				let idxSig = ks ? ks.get(itemKey) : 0
				if (ks && !idxSig) {
					idxSig = signal(0)
					ks.set(itemKey, idxSig)
				}
				const dispose = collectDisposers(
					[],
					() => {
						node = item(newDataItem, idxSig, R)
						nodeCache.set(itemKey, node)
					},
					(batch) => {
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
		watch(() => {
			/* eslint-disable max-depth */
			const data = read(entries)
			if (!data || !data.length) return clear()

			let oldData = currentData
			if (track) {
				kv = new Map()
				const key = read(track)
				currentData = data.map((i) => {
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

const If = ({ condition, else: otherwise }, trueBranch, falseBranch) => {
	if (otherwise) {
		falseBranch = otherwise
	}
	if (isSignal(condition)) {
		return Fn({ name: 'If' }, () => {
			if (condition.value) return trueBranch
			else return falseBranch
		})
	}

	if (typeof condition === 'function') {
		return Fn({ name: 'If' }, () => {
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

function Dyn(name, catchErr, ctx, props, ...children) {
	const self = currentCtx.self

	const $ref = props.$ref ??= signal()

	let current = null
	let renderFn = null

	return Fn({ name, ctx }, () => {
		const component = read(this)
		if (current === component) {
			return renderFn
		}

		current = component
		renderFn = (R) => {
			const ret = R.c(component, props, ...children)

			const newInstance = $ref.peek()
			const newCtx = newInstance?.[KEY_CTX]
			if (newCtx) {
				if (newCtx.hasExpose) {
					const extraKeys = Object.getOwnPropertyDescriptors(newInstance)
					delete extraKeys[KEY_CTX]
					Object.defineProperties(self, extraKeys)
				}

				newCtx.wrapper = self
			}

			return ret
		}

		return renderFn
	}, catchErr)
}
const Dynamic = ({ is, ctx, ...props }, ...children) => {
	return Dyn.call(is, 'Dynamic', null, ctx, props, ...children)
}

const Async = ({ future, fallback }) => {
	const self = getCurrentSelf()
	const component = signal(fallback)
	Promise.resolve(future).then(capture((result) => {
		if (self[KEY_CTX]) {
			watch(() => {
				component.value = read(result)
			})
		}
	}))
	return Fn({ name: 'Async' }, () => {
		return component.value
	})
}

const Render = ({ from }) => (R) => R.c(Fn, { name: 'Render' }, () => {
	const instance = read(from)
	if (instance !== null && instance !== undefined) return render(instance, R)
})

class Component {
	constructor(tpl, props, ...children) {
		const ctx = {
			run: null,
			render: null,
			dispose: null,
			wrapper: null,
			hasExpose: false,
			self: this
		}

		const prevCtx = currentCtx
		currentCtx = ctx

		const disposers = []

		ctx.run = capture((fn, ...args) => {
			let result
			const cleanup = collectDisposers([], () => {
				result = fn(...args)
			}, (batch) => {
				if (!batch) {
					removeFromArr(disposers, cleanup)
				}
			})
			disposers.push(cleanup)
			return [result, cleanup]
		})

		try {
			ctx.dispose = collectDisposers(disposers, () => {
				let renderFn = tpl(props, ...children)
				if (isThenable(renderFn)) {
					renderFn = Async({future: renderFn, fallback: props && props.fallback || null})
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

const createComponent = (() => {
	const createComponentRaw = (tpl, props, ...children) => {
		props ??= {}
		if (isSignal(tpl)) {
			return new Component(Dyn.bind(tpl, 'Signal', null, null), props, ...children)
		}
		const { $ref, ..._props } = props
		const component = new Component(tpl, _props, ...children)
		if ($ref) $ref.value = component
		return component
	}

	if (import.meta.hot) {
		const KEY_HMRWRAP = Symbol.for('RE_K_HMRWRAP')
		const KEY_HMRWARPPED = Symbol('K_HMRWARPPED')

		const builtins = new WeakSet([Fn, For, If, Dynamic, Async, Render, Component])

		const updateHMR = (fn) => {
			if (typeof fn !== 'function') return fn
			const wrapped = fn.bind(null)
			wrapped[KEY_HMRWARPPED] = true
			return wrapped
		}

		const wrap = (fn) => {
			const wrapped = signal(fn, updateHMR)
			Object.defineProperty(fn, KEY_HMRWRAP, {
				value: wrapped,
				enumerable: false
			})
			wrapped.name = fn.name
			wrapped.hot = false
			return wrapped
		}

		const handleError = (err, _, {name, hot}) => {
			if (hot) {
				console.error(`Error happened when rendering <${name}>:\n`, err)
			} else {
				throw err
			}
		}

		Object.defineProperty(globalThis, KEY_HMRWRAP, {
			value: wrap
		})

		return (tpl, props, ...children) => {
			let hotLevel = 0
			if (typeof tpl === 'function' && !builtins.has(tpl)) {
				if (tpl[KEY_HMRWRAP]) {
					tpl = tpl[KEY_HMRWRAP]
					hotLevel = 2
				} else if (!tpl[KEY_HMRWARPPED]) {
					tpl = wrap(tpl)
					hotLevel = 1
				}
			}

			if (hotLevel) {
				const ret = new Component(Dyn.bind(tpl, null, handleError, tpl), props ?? {}, ...children)
				return ret
			}

			return createComponentRaw(tpl, props, ...children)
		}
	}

	return createComponentRaw
})()

export {
	capture,
	snapshot,
	expose,
	render,
	dispose,
	getCurrentSelf,
	Fn,
	For,
	If,
	Dynamic,
	Async,
	Render,
	Component,
	createComponent
}
