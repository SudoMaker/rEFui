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

import { signal } from 'refui/signal'
import { onDispose, dispose, getCurrentSelf, For, Fn } from 'refui/components'
import { removeFromArr } from 'refui/utils'

function dumbFn(_) {
	return _
}

function createPortal() {
	let currentOutlet = null
	const nodes = signal([])
	function outletView(R) {
		return R.c(For, { entries: nodes }, dumbFn)
	}
	function Inlet(_, ...children) {
		return function({ normalizeChildren }) {
			const normalizedChildren = normalizeChildren(children)
			nodes.peek().push(...normalizedChildren)
			nodes.trigger()
			onDispose(function() {
				const arr = nodes.peek()
				for (let i of normalizedChildren) {
					removeFromArr(arr, i)
				}
				nodes.value = [...nodes.peek()]
			})
		}
	}
	function Outlet(_, fallback) {
		if (currentOutlet) dispose(currentOutlet)
		currentOutlet = getCurrentSelf()
		return function({ c }) {
			return c(Fn, null, function() {
				if (nodes.value.length) return outletView
				return fallback
			})
		}
	}

	return [Inlet, Outlet]
}

export { createPortal }
