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

import { signal, untrack, onDispose } from 'refui/signal'
import { createComponent, dispose as disposeComponent, Fn, For, render } from 'refui/components'
import { markStatic } from 'refui/utils'

function createCache(tpl) {
	let dataArr = []
	const componentsArr = []
	const components = signal(componentsArr)
	const componentUpdates = new WeakMap()
	let componentCache = []
	let disposed = false

	function createCacheComponent(data) {
		const currentData = signal(data)
		const component = createComponent(function CacheEntry() {
			return Fn({ name: 'CacheEntry' }, function () {
				const props = currentData.get()
				return function (R) {
					return R.c(tpl, props)
				}
			})
		})
		componentUpdates.set(component, currentData.set.bind(currentData))
		return component
	}

	function updateComponent(component, data) {
		componentUpdates.get(component)(data)
	}

	function acquire(data) {
		const component = componentCache.pop()
		if (component) {
			updateComponent(component, data)
			return component
		}
		return createCacheComponent(data)
	}

	function getIndex(handler) {
		return dataArr.findIndex(handler)
	}
	function add(...newData) {
		if (disposed || !newData.length) return
		for (let i of newData) {
			componentsArr.push(acquire(i))
			dataArr.push(i)
		}
		components.trigger()
	}
	function replace(newData) {
		if (disposed) return
		let idx = 0
		const newDataLength = newData.length
		const componentsLength = componentsArr.length
		while (idx < newDataLength && idx < componentsLength) {
			updateComponent(componentsArr[idx], newData[idx])
			idx += 1
		}
		if (idx < newDataLength) {
			while (idx < newDataLength) {
				componentsArr.push(acquire(newData[idx]))
				idx += 1
			}
			components.trigger()
		} else if (idx < componentsLength) {
			componentCache.push(...componentsArr.splice(idx))
			components.trigger()
		}
		dataArr = newData.slice()
	}
	function get(idx) {
		return dataArr[idx]
	}
	function set(idx, data) {
		if (disposed) return
		const component = componentsArr[idx]
		if (component) {
			updateComponent(component, data)
			dataArr[idx] = data
		}
	}
	function del(idx) {
		if (disposed) return
		const component = componentsArr[idx]
		if (component) {
			componentCache.push(component)
			componentsArr.splice(idx, 1)
			dataArr.splice(idx, 1)
			components.trigger()
		}
	}
	function clear() {
		if (disposed) return
		if (!componentsArr.length) {
			dataArr.length = 0
			return
		}
		componentCache = componentCache.concat(componentsArr)
		componentsArr.length = 0
		dataArr.length = 0
		components.trigger()
	}
	function size() {
		return componentsArr.length
	}

	function dispose() {
		if (disposed) return
		disposed = true
		const arrCopy = componentCache.concat(componentsArr)
		componentCache = []
		componentsArr.length = 0
		dataArr.length = 0
		components.trigger()
		const count = arrCopy.length
		for (let i = 0; i < count; i++) disposeComponent(arrCopy[i])
	}

	onDispose(dispose)

	function Cached({ expose }) {
		return function(R) {
			const cache = new WeakMap()
			expose?.({ cache })
			return For({ name: 'Cached', entries: components }, function({ item }) {
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

	markStatic(Cached)

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
