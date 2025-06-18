import { collectDisposers, nextTick, read, peek, watch, onDispose, freeze, signal, isSignal } from './signal.js'
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
		Object.defineProperties(
			currentCtx.self,
			entries.reduce((descriptors, [key, value]) => {
				if (isSignal(value)) {
					descriptors[key] = {
						get: value.get.bind(value),
						set: value.set.bind(value),
						enumerable: true,
						configurable: false
					}
				} else {
					descriptors[key] = {
						value,
						enumerable: true,
						configurable: false
					}
				}

				return descriptors
			}, {})
		)
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

const Fn = ({ name = 'Fn' }, handler) => {
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
			const newRender = handler()
			if (newRender === currentRender) return
			currentRender = newRender
			if (currentDispose) currentDispose()
			if (newRender) {
				currentDispose = run(() => {
					const newResult = (typeof newRender === 'function') ? newRender(R) : newRender

					if (newResult) {
						R.appendNode(fragment, R.ensureElement(newResult))
						onDispose(() => {
							nextTick(() => R.removeNode(newResult))
						})
					}

				})[1]
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

const Dynamic = ({ is, ...props }, ...children) => {
	const current = signal(null)
	expose({ current })
	return Fn({ name: 'Dynamic' }, () => {
		const component = read(is)
		if (component) return (R) => R.c(component, { $ref: current, ...props }, ...children)
		else current.value = null
	})
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

const Component = class Component {
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

const createComponent = (tpl, props, ...children) => {
	if (props === null || props === undefined) props = {}
	const { $ref, ..._props } = props
	const component = new Component(tpl, _props, ...children)
	if ($ref) $ref.value = component
	return component
}

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
