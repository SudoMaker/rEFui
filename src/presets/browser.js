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

import { nextTick, bind } from 'refui/signal'

function reverseMap(keyValsMap) {
	const reversed = {}
	for (let [key, vals] of Object.entries(keyValsMap)) {
		for (let val of vals) {
			reversed[val] = key
		}
	}
	return reversed
}

function prefix(prefix, keyArr) {
	return Object.fromEntries(keyArr.map(function(i) {
		return [i, `${prefix}${i}`]
	}))
}

export const namespaces = {
	xml: 'http://www.w3.org/XML/1998/namespace',
	html: 'http://www.w3.org/1999/xhtml',
	svg: 'http://www.w3.org/2000/svg',
	math: 'http://www.w3.org/1998/Math/MathML',
	xlink: 'http://www.w3.org/1999/xlink'
}

export const tagAliases = {}

const attributes = ['class', 'style', 'viewBox', 'd', 'tabindex', 'role', 'for']

const namespaceToTagsMap = {
	svg: [
		'animate',
		'animateMotion',
		'animateTransform',
		'circle',
		'clipPath',
		'defs',
		'desc',
		'discard',
		'ellipse',
		'feBlend',
		'feColorMatrix',
		'feComponentTransfer',
		'feComposite',
		'feConvolveMatrix',
		'feDiffuseLighting',
		'feDisplacementMap',
		'feDistantLight',
		'feDropShadow',
		'feFlood',
		'feFuncA',
		'feFuncB',
		'feFuncG',
		'feFuncR',
		'feGaussianBlur',
		'feImage',
		'feMerge',
		'feMergeNode',
		'feMorphology',
		'feOffset',
		'fePointLight',
		'feSpecularLighting',
		'feSpotLight',
		'feTile',
		'feTurbulence',
		'filter',
		'foreignObject',
		'g',
		'line',
		'linearGradient',
		'marker',
		'mask',
		'metadata',
		'mpath',
		'path',
		'pattern',
		'polygon',
		'polyline',
		'radialGradient',
		'rect',
		'set',
		'stop',
		'svg',
		'switch',
		'symbol',
		'text',
		'textPath',
		'title',
		'tspan',
		'unknown',
		'use',
		'view'
	]
}

export const tagNamespaceMap = reverseMap(namespaceToTagsMap)
export const propAliases = prefix('attr:', attributes)

export const directives = {
	style(key) {
		return function(node, val) {
			if (val === undefined || val === null) return

			const styleObj = node.style

			function handler(newVal) {
				return nextTick(function() {
					if (newVal === undefined || val === null || val === false) {
						styleObj[key] = 'unset'
					} else {
						styleObj[key] = newVal
					}
				})
			}

			bind(handler, val)
		}
	},
	class(key) {
		return function(node, val) {
			if (val === undefined || val === null) return

			const classList = node.classList

			function handler(newVal) {
				return nextTick(function() {
					if (newVal) {
						classList.add(key)
					} else {
						classList.remove(key)
					}
				})
			}

			bind(handler, val)
		}
	}
}

function onDirective(prefix, key) {
	const handler = directives[prefix]
	if (handler) return handler(key)
}

export const defaults = {
	doc: document,
	namespaces,
	tagNamespaceMap,
	tagAliases,
	propAliases,
	onDirective
}
