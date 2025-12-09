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
import { createComponent, For, render } from 'refui/components'
import { markStatic } from 'refui/utils'

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
		const arrCopy = componentsArr.slice()
		const count = arrCopy.length
		for (let i = 0; i < count; i++) dispose(arrCopy[i])
	}

	onDispose(dispose)

	function Cached({ expose }) {
		return function() {
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
