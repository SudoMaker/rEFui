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

import { isSignal, nextTick, peek, bind, watch } from 'refui/signal'
import { createRenderer } from 'refui/renderer'
import { nop, cachedStrKeyNoFalsy, removeFromArr } from 'refui/utils'
import { isProduction } from 'refui/constants'
import { markNode, isNode } from 'refui/reflow'

const FLAG_FRAG = Symbol(isProduction ? '' : 'F_Fragment')
const FLAG_SELF_CLOSING = Symbol(isProduction ? '' : 'F_SelfClosing')
const KEY_TAG_NAME = Symbol(isProduction ? '' : 'K_TagName')

const escapeMap = {
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#039;',
	'&': '&amp;'
}

function escapeReplacer(match) {
	return escapeMap[match]
}
function escapeHtml(unsafe) {
	return `${unsafe}`.replace(/[<>"'&]/g, escapeReplacer)
}

function makeNode(...node) {
	node.parent = null
	markNode(node)
	return node
}

function rawHTML(raw, ...exprs) {
	if (!Array.isArray(raw)) {
		raw = [raw]
	}
	raw = { raw }
	const node = makeNode()
	watch(function() {
		node[0] = String.raw(raw, ...exprs)
	})
	return node
}

const defaultRendererID = 'HTML'

function serialize(node) {
	return node.flat(Infinity).join('')
}

function createHTMLRenderer({
	rendererID = defaultRendererID,
	selfClosingTags = Object.fromEntries(
		['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'].map(
			function (i) {
				return [i, true]
			}
		)
	)
} = {}) {
	function createNode(tagName) {
		const node = makeNode(`<${tagName}`, [])
		if (selfClosingTags[tagName]) {
			node.push('/>')
			node[FLAG_SELF_CLOSING] = true
			node[KEY_TAG_NAME] = tagName
		} else {
			node.push('>', [], `</${tagName}>`)
		}
		node.nodeName = tagName
		return node
	}
	function createAnchor(anchorName, explicit) {
		if (explicit || (!isProduction && anchorName)) {
			return makeNode(`<!--${escapeHtml(anchorName)}-->`)
		}
		return makeNode()
	}
	function createTextNode(text) {
		if (isSignal(text)) {
			const node = makeNode('')
			text.connect(function () {
				const newData = peek(text) ?? ''
				node[0] = escapeHtml(String(newData))
			})
			return node
		}

		return makeNode(escapeHtml(String(text ?? '')))
	}
	function createFragment() {
		const frag = makeNode()
		frag[FLAG_FRAG] = true
		return frag
	}

	function revokeSelfClosing(parent) {
		if (parent[FLAG_SELF_CLOSING]) {
			parent.pop()
			parent.push('>', [], `</${parent[KEY_TAG_NAME]}>`)
			delete parent[FLAG_SELF_CLOSING]
			delete parent[KEY_TAG_NAME]
		}
	}

	function removeNode(node) {
		if (!node.parent) return
		removeFromArr(node.parent, node)
		node.parent = null
	}
	function appendNode(parent, ...nodes) {
		let _parent = parent
		if (!parent[FLAG_FRAG]) {
			revokeSelfClosing(parent)
			_parent = parent[3]
		}
		const nodeCount = nodes.length
		for (let i = 0; i < nodeCount; i++) {
			const node = nodes[i]
			if (node[FLAG_FRAG]) {
				const fragChildCount = node.length
				for (let j = 0; j < fragChildCount; j++) {
					node[j].parent = _parent
				}
				_parent.push(...node)
				node.length = 0
			} else {
				_parent.push(node)
				node.parent = _parent
			}
		}
	}
	function insertBefore(node, ref) {
		const parent = ref.parent
		if (!parent) {
			throw new ReferenceError('InsertBefore: Ref does not have a parent!')
		}

		const index = parent.indexOf(ref)
		if (index > -1) {
			if (node[FLAG_FRAG]) {
				const fragChildCount = node.length
				for (let i = 0; i < fragChildCount; i++) {
					node[i].parent = parent
				}
				parent.splice(index, 0, ...node)
				node.length = 0
			} else {
				parent.splice(index, 0, node)
				node.parent = parent
			}
		} else {
			throw new ReferenceError('InsertBefore: Ref not in parent!')
		}
	}

	const getPropSetter = cachedStrKeyNoFalsy(function (key) {
		const [prefix, _key] = key.split(':')
		if (_key) {
			switch (prefix) {
				case 'on': {
					return nop
				}
				case 'attr': {
					key = _key
					break
				}
				default: {
					// do nothing
				}
			}
		}

		return function (propsNode, val) {
			if (isSignal(val)) {
				const propBody = [` ${key}="`, '', '"']
				const propNode = [propBody]
				propsNode.push(propNode)
				val.connect(function () {
					const newData = peek(val)
					if (newData === undefined || newData === null) {
						propNode[0] = ''
						propBody[1] = ''
					} else if (newData === true) {
						propNode[0] = ` ${key}`
						propBody[1] = ''
					} else {
						propBody[1] = escapeHtml(newData)
						propNode[0] = propBody
					}
				})
			} else if (val === true) {
				propsNode.push(` ${key}`)
			} else if (val !== undefined && val !== null) {
				propsNode.push(` ${key}="${escapeHtml(val)}"`)
			}
		}
	})

	function setProps(node, props) {
		if (node[FLAG_FRAG]) return
		const propsNode = node[1]
		for (let key in props) {
			getPropSetter(key)(propsNode, props[key])
		}
	}

	const nodeOps = {
		isNode,
		createNode,
		createAnchor,
		createTextNode,
		createFragment,
		setProps,
		insertBefore,
		appendNode,
		removeNode,
		rawHTML,
		serialize
	}

	return createRenderer(nodeOps, rendererID)
}

export { createHTMLRenderer, defaultRendererID }
