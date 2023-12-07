import { signal, untrack, onDispose } from '../signal.js'
import { build, expose, createComponent, For } from '../component.js'

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
			if (!component) component = createComponent(tpl, i)
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
		expose({ cache })
		return R.c(For, { entries: components }, (row) => {
			let node = cache.get(row)
			if (!node) {
				node = untrack(() => build(row, R))
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

export { createCache }
