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
import { isThenable, isStatic, nullRefObject } from 'refui/utils'

const rendererFactory = function(props, component, R) {
	return R.c(component, props, ...this)
}

const createElement = (function() {
	if (hotEnabled) {
		return function(component, props, ...children) {
			if (typeof component === 'function' && isStatic(component)) {
				const { $ref, ..._props } = props ?? nullRefObject
				if (!$ref) {
					return component(_props, ...children)
				}
			}
			return rendererFactory.bind(children, props, component)
		}
	} else {
		return function(component, props, ...children) {
			const { $ref, ..._props } = props ?? nullRefObject
			if (!$ref && typeof component === 'function') {
				return component(_props, ...children)
			}

			return rendererFactory.bind(children, props, component)
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
