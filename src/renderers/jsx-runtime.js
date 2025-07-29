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

import { wrap as wrapDev } from 'refui/jsx-dev-runtime'
import { nop } from 'refui/utils'
import { isProduction } from 'refui/constants'

let jsx = nop
let jsxs = nop
let Fragment = '<>'

function wrap(R) {
	jsx = function(tag, props, key) {
		if (key !== undefined && key !== null) {
			props.key = key
		}
		if (Object.hasOwn(props, 'children')) {
			const children = props.children
			if (Array.isArray(children) && !R.isNode(children)) {
				return R.c(tag, props, ...props.children)
			} else {
				return R.c(tag, props, props.children)
			}
		} else {
			return R.c(tag, props)
		}
	}

	jsxs = function(tag, props, key) {
		if (key !== undefined && key !== null) {
			props.key = key
		}
		return R.c(tag, props, ...props.children)
	}

	Fragment = R.f

	if (!isProduction) {
		wrapDev(R)
	}

	return {
		jsx,
		jsxs,
		Fragment
	}
}

const _default = {
	wrap,
	get default() {
		return _default;
	},
	get jsx() {
		return jsx;
	},
	get jsxs() {
		return jsxs;
	},
	get Fragment() {
		return Fragment
	}
}

export default _default
export {
	wrap,
	jsx,
	jsxs,
	Fragment
}
