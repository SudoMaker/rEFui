import { collectDisposers, nextTick, read, peek, watch, onDispose, signal, isSignal } from './signal.js'
import { removeFromArr } from './utils.js'

const ctxMap = new WeakMap()

let currentCtx = null

const expose = (ctx) => {
	if (currentCtx) Object.assign(currentCtx.exposed, ctx)
}

const render = (instance, renderer) => {
	const ctx = ctxMap.get(instance)
	if (!ctx) return
	const { disposers, render } = ctx
	if (!render || typeof render !== 'function') return

	let rendered = null
	const _disposers = []
	const dispose = collectDisposers(
		_disposers,
		() => {
			rendered = render(renderer)
		},
		() => {
			removeFromArr(disposers, dispose)
		}
	)
	disposers.push(dispose)
	return rendered
}

const dispose = (instance) => {
	const ctx = ctxMap.get(instance)
	if (!ctx) return
	ctx.dispose()
}

const getCurrentSelf = () => currentCtx && currentCtx.self

const Component = class Component {
	constructor(tpl, ...args) {
		const ctx = {
			exposed: {},
			disposers: [],
			render: null,
			dispose: null,
			self: this
		}

		const prevCtx = currentCtx
		currentCtx = ctx

		ctx.dispose = collectDisposers(ctx.disposers, () => {
			ctx.render = tpl(...args)
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

		ctxMap.set(this, ctx)
	}
}

const createComponent = (tpl, props, ...children) => {
	if (props === null || props === undefined) props = {}
	const { $ref, ..._props } = props
	const component = new Component(tpl, _props, ...children)
	if ($ref) $ref.value = component
	return component
}

const Fn = (_, handler) => {
	const disposers = []
	onDispose(() => {
		for (let i of disposers) i(true)
		disposers.length = 0
	})

	return (R) => {
		if (!handler) return

		const backAnchor = R.createAnchor('Fn')
		const fragment = R.createFragment()
		let currentRender = null
		let currentDispose = null

		const apply = () => {
			R.insertBefore(fragment, backAnchor)
			R.removeNode(fragment)
		}

		nextTick(() => {
			watch(() => {
				const newRender = handler()
				if (newRender === currentRender) return
				currentRender = newRender
				if (currentDispose) currentDispose()
				if (newRender) {
					let newResult = null
					const dispose = collectDisposers(
						[],
						() => {
							newResult = newRender(R)
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

		return backAnchor
	}
}

const For = ({ entries, track, indexed }, item) => {
	let currentData = []

	let kv = track && new Map()
	let ks = indexed && new Map()
	let nodeCache = new Map()
	let disposers = new Map()

	const _clear = () => {
		for (let [, dispose] of disposers) dispose(true)
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
		const backAnchor = R.createAnchor('For')
		const fragment = R.createFragment()

		const apply = () => {
			R.insertBefore(fragment, backAnchor)
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
							} else {
								let beforeAnchor = backAnchor
								if (backSet[i + 1].length) {
									beforeAnchor = getItemNode(backSet[i + 1][0])
								}

								for (let itemKey of bChunk) {
									R.insertBefore(getItemNode(itemKey), beforeAnchor)
								}
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
				nextTick(apply)
			}

			flushKS()
		})

		return backAnchor
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

const Dynamic = ({ is, ...props }, ...children) => {
	const current = signal(null)
	expose({ current })
	return ({ c }) => c(Fn, null, () => {
		const component = read(is)
		if (component) return () => c(component, { $ref: current, ...props }, ...children)
		else current.value = null
	})
}

const Render = ({ from }) => (R) => R.c(Fn, null, () => {
	const instance = read(from)
	if (instance !== null && instance !== undefined) return render(instance, R)
})

export {
	Component,
	Fn,
	For,
	If,
	Dynamic,
	Render,
	createComponent,
	expose,
	render,
	dispose,
	getCurrentSelf
}
