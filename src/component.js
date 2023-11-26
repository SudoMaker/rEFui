import { collectDisposers, nextTick, read, peek, watch, untrack, onDispose, signal, isSignal } from './signal.js'
import { removeFromArr } from './utils.js'

const SymbolBuild = Symbol('build')

let currentCtx = null

const expose = (ctx) => {
	if (currentCtx) Object.assign(currentCtx.exposed, ctx)
}

const build = (component, renderer) => component[SymbolBuild](renderer)

const dispose = val => val._.dispose()

const getCurrentSelf = () => currentCtx && currentCtx.self

const Component = class Component {
	constructor(init, ...args) {
		const ctx = {
			exposed: {},
			disposers: [],
			build: null,
			dispose: null,
			self: this
		}

		const prevCtx = currentCtx
		currentCtx = ctx

		ctx.dispose = collectDisposers(ctx.disposers, () => {
			ctx.build = init(...args)
		})

		currentCtx = prevCtx

		const entries = Object.entries(ctx.exposed)

		if (entries.length) {
			Object.defineProperties(
				this,
				entries.reduce((descriptors, [key, value]) => {
					if (isSignal(value)) {
						descriptors[key] = {
							get: value.get.bind(value),
							set: value.set.bind(value),
							configurable: false
						}
					} else {
						descriptors[key] = {
							value,
							configurable: false
						}
					}

					return descriptors
				}, {})
			)
		}

		this._ = ctx
	}

	[SymbolBuild](renderer) {
		const { disposers, build } = this._
		if (!build) return
		if (typeof build !== 'function') return build

		let built = null
		const _disposers = []
		const dispose = collectDisposers(
			_disposers,
			() => {
				built = build(renderer)
			},
			() => {
				removeFromArr(disposers, dispose)
			}
		)
		disposers.push(dispose)
		return built
	}
}

const Fn = (_, handler) => {
	const disposers = []
	onDispose(() => {
		for (let i of disposers) i(true)
		disposers.length = 0
	})

	return (R) => {
		if (!handler) return

		const anchor = R.createAnchor('Fn')
		const fragment = R.createFragment()
		let currentBuilder = null
		let currentDispose = null

		const apply = () => {
			R.insertBefore(fragment, anchor)
			R.removeNode(fragment)
		}

		nextTick(() => {
			watch(() => {
				const newBuilder = handler()
				if (newBuilder === currentBuilder) return
				currentBuilder = newBuilder
				if (currentDispose) currentDispose()
				if (newBuilder) {
					let newResult = null
					const dispose = collectDisposers(
						[],
						() => {
							newResult = newBuilder(R)
							if (newResult) {
								if (!R.isNode(newResult)) newResult = R.createTextNode(newResult)
								R.appendNode(fragment, newResult)
							}
						},
						() => {
							removeFromArr(disposers, dispose)
							if (newResult) {
								nextTick(() => R.removeNode(newResult))
							}
						}
					)
					disposers.push(dispose)
					currentDispose = dispose
					nextTick(apply)
				}
			})
		})

		return anchor
	}
}

const For = ({ entries, track, indexed }, item) => {
	let currentData = []

	const kv = track && new Map()
	const ks = indexed && new Map()
	const nodeCache = new Map()
	const disposers = new Map()

	const _clear = () => {
		for (let [, dispose] of disposers) dispose(true)
		nodeCache.clear()
		disposers.clear()
		if (ks) ks.clear()
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
		if (kv) kv.clear()
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
		const anchor = R.createAnchor('For')
		const fragment = R.createFragment()

		const apply = () => {
			R.insertBefore(fragment, anchor)
			R.removeNode(fragment)
		}

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

		watch(() => {
			const data = read(entries)
			if (!data || !data.length) return clear()

			let oldData = currentData
			if (track) {
				kv.clear()
				const key = read(track)
				currentData = data.map((i) => {
					const itemKey = i[key]
					kv.set(itemKey, i)
					return itemKey
				})
			} else currentData = [...entries]

			let newData = [...currentData]

			if (oldData.length) {
				const obsoleteDataKeys = [...new Set([...currentData, ...oldData])].slice(currentData.length)

				if (obsoleteDataKeys.length === oldData.length) {
					_clear()
				} else {
					if (obsoleteDataKeys.length) {
						for (let oldItemKey of obsoleteDataKeys) {
							disposers.get(oldItemKey)()
							removeFromArr(oldData, oldItemKey)
						}
					}

					let newDataCursor = 0
					let oldDataCursor = 0

					while (oldDataCursor < oldData.length) {
						const newItemKey = newData[newDataCursor]
						const oldItemKey = oldData[oldDataCursor]

						newDataCursor += 1

						if (newItemKey !== oldItemKey) {
							const newNode = getItemNode(newItemKey)
							const oldNode = nodeCache.get(oldItemKey)
							const prevIndex = oldData.indexOf(newItemKey)
							/* eslint-disable max-depth */
							if (prevIndex > -1) {
								if (oldNode && newNode) R.swapNodes(oldNode, newNode)
								oldData[prevIndex] = oldItemKey
							} else {
								if (oldNode && newNode) R.insertBefore(newNode, oldNode)
								// eslint-disable-next-line no-continue
								continue
							}
						}

						oldDataCursor += 1
					}

					if (newDataCursor) newData = newData.slice(newDataCursor)
				}
			}

			if (newData.length) {
				for (let newItemKey of newData) {
					const node = getItemNode(newItemKey)
					if (node) R.appendNode(fragment, node)
				}
				nextTick(apply)
			}

			flushKS()
		})

		return anchor
	}
}

const If = ({ condition, else: otherwise }, handler, elseBranch) => {
	const ifNot = otherwise || elseBranch
	if (isSignal(condition))
		return Fn(null, () => {
			if (condition.value) return handler
			else return ifNot
		})

	if (typeof condition === 'function')
		return Fn(null, () => {
			if (condition()) return handler
			else return ifNot
		})

	if (condition) return handler
	return ifNot
}

const Render = ({ item }, fallback) => ({ c, render }) => c(Fn, null, () => {
	const component = read(item)
	if (component) return () => render(component)
	if (fallback) return fallback
})

const createPortal = () => {
	let currentOutlet = null
	const nodes = signal([])
	const outletView = R => R.c(For, { entries: nodes }, child => child)
	const Inlet = (_, ...children) => ({ normalizeChildren }) => {
		const normalizedChildren = normalizeChildren(children)
		nodes.peek().push(...normalizedChildren)
		nodes.trigger()
		onDispose(() => {
			const arr = nodes.peek()
			for (let i of normalizedChildren) {
				removeFromArr(arr, i)
			}
			nodes.value = [...nodes.peek()]
		})
	}
	const Outlet = (_, fallback) => {
		if (currentOutlet) dispose(currentOutlet)
		currentOutlet = getCurrentSelf()
		return ({ c }) => c(Fn, null, () => {
			if (nodes.value.length) return outletView
			if (fallback) return fallback
		})
	}

	return [Inlet, Outlet]
}

const createCache = (tpl) => {
	let dataArr = []
	const componentsArr = []
	const components = signal(componentsArr)
	let componentCache = []

	const getIndex = handler => dataArr.findIndex(handler)
	const add = (...newData) => {
		if (!newData.length) return
		for (let i of newData) {
			let component = componentCache.pop()
			if (!component) component = new tpl(i)
			componentsArr.push(component)
			component.update(i)
			dataArr.push(i)
		}
		components.trigger()
	}
	const replace = (newData) => {
		let idx = 0
		dataArr = newData.slice()
		const newDataLength = newData.length
		const componentsLength = componentsArr.length
		while (idx < newDataLength && idx < componentsLength) {
			componentsArr[idx].update(newData[idx])
			idx += 1
		}
		if (idx < newDataLength) {
			add(...newData.slice(idx))
		} else if (idx < componentsLength) {
			componentsArr.length = idx
			components.trigger()
		}
	}
	const get = idx => dataArr[idx]
	const set = (idx, data) => {
		const component = componentsArr[idx]
		if (component) {
			component.update(data)
			dataArr[idx] = data
		}
	}
	const del = (idx) => {
		const component = componentsArr[idx]
		if (component) {
			componentCache.push(component)
			componentsArr.splice(idx, 1)
			dataArr.splice(idx, 1)
			components.trigger()
		}
	}
	const clear = () => {
		componentCache = componentCache.concat(componentsArr)
		componentsArr.length = 0
		dataArr.length = 0
		components.trigger()
	}
	const size = () => componentsArr.length

	const dispose = () => {
		clear()
		for (let i of componentsArr) dispose(i)
	}

	onDispose(dispose)

	const Cached = () => (R) => {
		const cache = new WeakMap()
		return R.c(For, { entries: components }, (row) => {
			let node = cache.get(row)
			if (!node) {
				node = untrack(() => R.render(row))
				cache.set(row, node)
			}
			return node
		})
	}

	return {
		getIndex,
		add,
		replace,
		get,
		set,
		del,
		clear,
		size,
		dispose,
		Cached
	}
}

export { Component, Fn, For, If, Render, createPortal, createCache, expose, build, dispose, getCurrentSelf }
