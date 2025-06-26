import { signal, untrack, onDispose } from '../signal.js'
import { render, expose, createComponent, For } from '../component.js'

function createCache(tpl) {
	let dataArr = []
	const componentsArr = []
	const components = signal(componentsArr)
	let componentCache = []

	function getIndex(handler) {
		return dataArr.findIndex(handler)
	}
	function add(...newData) {
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
	function replace(newData) {
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
	function get(idx) {
		return dataArr[idx]
	}
	function set(idx, data) {
		const component = componentsArr[idx]
		if (component) {
			component.update(data)
			dataArr[idx] = data
		}
	}
	function del(idx) {
		const component = componentsArr[idx]
		if (component) {
			componentCache.push(component)
			componentsArr.splice(idx, 1)
			dataArr.splice(idx, 1)
			components.trigger()
		}
	}
	function clear() {
		componentCache = componentCache.concat(componentsArr)
		componentsArr.length = 0
		dataArr.length = 0
		components.trigger()
	}
	function size() {
		return componentsArr.length
	}

	function dispose() {
		clear()
		for (let i of componentsArr) dispose(i)
	}

	onDispose(dispose)

	function Cached() {
		return function(R) {
			const cache = new WeakMap()
			expose({ cache })
			return R.c(For, { entries: components }, function({ item }) {
				let node = cache.get(item)
				if (!node) {
					node = untrack(function() {
						return render(item, R)
					})
					cache.set(item, node)
				}
				return node
			})
		}
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
