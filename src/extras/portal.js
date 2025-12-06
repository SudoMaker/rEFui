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

import { signal, onDispose } from 'refui/signal'
import { dispose, getCurrentSelf, For, Fn } from 'refui/components'
import { removeFromArr } from 'refui/utils'

function dummyRenderer({ item }) {
	return item
}

const outletProps = {
	name: 'Outlet'
}

function createPortal({ itemRenderer = dummyRenderer } = {}) {
	let currentOutlet = null
	const nodeArr = []
	const nodes = signal(nodeArr)
	const outletView = For({ name: null, entries: nodes }, itemRenderer)
	function Inlet(_, ...children) {
		return function({ normalizeChildren }) {
			let normalizedChildren = normalizeChildren(children)
			if (normalizedChildren.length === 1) {
				normalizedChildren = normalizedChildren[0]
			}
			nodeArr.push(normalizedChildren)
			nodes.trigger()
			onDispose(function() {
				removeFromArr(nodeArr, normalizedChildren)
				nodes.trigger()
			})
		}
	}
	function Outlet(_, fallback) {
		if (currentOutlet) dispose(currentOutlet)
		currentOutlet = getCurrentSelf()
		return Fn(outletProps, function() {
			if (nodes.value.length) return outletView
			return fallback
		})
	}

	return [Inlet, Outlet]
}

export { createPortal }
