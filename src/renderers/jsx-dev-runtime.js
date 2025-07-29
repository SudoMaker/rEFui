/* Copyright Yukino Song
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

import { isSignal } from 'refui/signal'
import { nop } from 'refui/utils'

let jsxDEV = nop
let Fragment = '<>'

function wrap(R) {
	jsxDEV = function(tag, props, key, ...args) {
		try {
			if (key !== undefined && key !== null) {
				props.key = key
			}
			if (Object.hasOwn(props, 'children')) {
				const { children } = props
				if (Array.isArray(children) && !R.isNode(children)) {
					return R.c(tag, props, ...children)
				} else {
					return R.c(tag, props, children)
				}
			} else {
				return R.c(tag, props)
			}
		} catch (e) {
			if (typeof tag === 'function') {
				tag = tag.name
			} else if (isSignal(tag)) {
				tag = (tag.name || tag.peek()?.name || null)
			}
			const [, dbgInfo] = args
			if (dbgInfo) {
				const { fileName, lineNumber, columnNumber } = dbgInfo
				console.error(`Error happened while rendering <${tag}> in (${fileName}:${lineNumber}:${columnNumber}):\n`, e)
			} else {
				console.error(`Error happened while rendering <${tag}>:\n`, e)
			}
			throw e
		}
	}

	Fragment = R.f

	return {
		jsxDEV,
		Fragment
	}
}

const _default = {
	wrap,
	get default() {
		return _default;
	},
	get jsxDEV() {
		return jsxDEV;
	},
	get Fragment() {
		return Fragment
	}
}

export default _default
export {
	wrap,
	jsxDEV,
	Fragment
}
