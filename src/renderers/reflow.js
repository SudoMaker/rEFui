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

import { Fragment } from 'refui/renderer'
import { hotEnabled } from 'refui/hmr'
import { isThenable } from 'refui/utils'

const createElement = (function() {
	if (hotEnabled) {
		const dummyRenderFn = function(props, classicChildren, R) {
			return R.c(this, props, ...classicChildren)
		}
		return function(component, props, ...classicChildren) {
			return dummyRenderFn.bind(component, props, classicChildren)
		}
	} else {
		const emptyProp = {}
		return function(component, props, ...classicChildren) {
			const { children = classicChildren, $ref, ..._props } = props || emptyProp
			if (!$ref && typeof component === 'function') {
				const renderFn = component(_props, ...children)
				return renderFn
			}

			return function(R) {
				return R.c(component, props, ...children)
			}
		}
	}
})()

const isNode = function() {
	return false
}

const R = {
	createElement,
	Fragment,
	c: createElement,
	f: Fragment,
	isNode
}

export { R }
