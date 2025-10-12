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

import { isSignal, nextTick, peek, bind } from 'refui/signal'
import { createRenderer } from 'refui/renderer'
import { nop, cachedStrKeyNoFalsy, splitFirst } from 'refui/utils'
import { isProduction } from 'refui/constants'

/*
const NODE_TYPES = {
	ELEMENT_NODE: 1,
	ATTRIBUTE_NODE: 2,
	TEXT_NODE: 3,
	CDATA_SECTION_NODE: 4,
	ENTITY_REFERENCE_NODE: 5,
	PROCESSING_INSTRUCTION_NODE: 7,
	COMMENT_NODE: 8,
	DOCUMENT_NODE: 9,
	DOCUMENT_FRAGMENT_NODE: 11
}
*/

/*
Apply order:
1. Get namespace
2. Get alias
3. Create with namespace
*/

const defaultRendererID = 'DOM'

function createDOMRenderer({
	rendererID = defaultRendererID,
	doc = document,
	namespaces = {},
	tagNamespaceMap = {},
	tagAliases = {},
	propAliases = {},
	onDirective,
	macros = {}
} = {}) {
	let eventPassiveSupported = false
	let eventOnceSupported = false

	try {
		const options = {
			passive: {
				get() {
					eventPassiveSupported = true
					return eventPassiveSupported
				}
			},
			once: {
				get() {
					eventOnceSupported = true
					return eventOnceSupported
				}
			}
		}
		const testEvent = '__refui_event_option_test__'
		doc.addEventListener(testEvent, nop, options)
		doc.removeEventListener(testEvent, nop, options)
	} catch (e) {
		// do nothing
	}

	// eslint-disable-next-line max-params
	function eventCallbackFallback(node, event, handler, options) {
		if (options.once && !eventOnceSupported) {
			const _handler = handler
			handler = function(...args) {
				_handler(...args)
				node.removeEventListener(event, handler, options)
			}
		}
		if (options.passive && !eventPassiveSupported) {
			const _handler = handler
			handler = function(...args) {
				nextTick(_handler.bind(null, ...args))
			}
		}

		return handler
	}

	function isNode(node) {
		return !!(node && node.cloneNode)
	}

	const getNodeCreator = cachedStrKeyNoFalsy(function(tagNameRaw) {
		let [nsuri, tagName] = tagNameRaw.split(':')
		if (!tagName) {
			tagName = nsuri
			nsuri = tagNamespaceMap[tagName]
		}
		tagName = tagAliases[tagName] || tagName
		if (nsuri) {
			nsuri = namespaces[nsuri] || nsuri
			return function() {
				return doc.createElementNS(nsuri, tagName)
			}
		}
		return function() {
			return doc.createElement(tagName)
		}
	})

	function createNode(tagName) {
		return getNodeCreator(tagName)()
	}
	function createAnchor(anchorName) {
		if (!isProduction && anchorName) {
			return doc.createComment(anchorName)
		}
		return doc.createTextNode('')
	}
	function createTextNode (text) {
		if (isSignal(text)) {
			const node = doc.createTextNode('')
			text.connect(function() {
				const newData = peek(text)
				if (newData === undefined) node.data = ''
				else node.data = newData
			})
			return node
		}

		return doc.createTextNode(text)
	}
	function createFragment() {
		return doc.createDocumentFragment()
	}

	function removeNode(node) {
		if (!node.parentNode) return
		node.parentNode.removeChild(node)
	}
	function appendNode(parent, ...nodes) {
		for (let node of nodes) {
			parent.insertBefore(node, null)
		}
	}
	function insertBefore(node, ref) {
		ref.parentNode.insertBefore(node, ref)
	}

	const getListenerAdder = cachedStrKeyNoFalsy(function(event) {
		const [prefix, eventName] = event.split(':')
		if (prefix === 'on') {
			return function(node, cb) {
				if (!cb) return
				if (isSignal(cb)) {
					let currentHandler = null
					cb.connect(function() {
						const newHandler = peek(cb)
						if (currentHandler) node.removeEventListener(eventName, currentHandler)
						if (newHandler) node.addEventListener(eventName, newHandler)
						currentHandler = newHandler
					})
				} else node.addEventListener(eventName, cb)
			}
		} else {
			const optionsArr = prefix.split('-')
			optionsArr.shift()
			const options = {}
			for (let option of optionsArr) if (option) options[option] = true
			return function(node, cb) {
				if (!cb) return
				if (isSignal(cb)) {
					let currentHandler = null
					cb.connect(function() {
						let newHandler = peek(cb)
						if (currentHandler) node.removeEventListener(eventName, currentHandler, options)
						if (newHandler) {
							newHandler = eventCallbackFallback(node, eventName, newHandler, options)
							node.addEventListener(eventName, newHandler, options)
						}
						currentHandler = newHandler
					})
				} else node.addEventListener(eventName, eventCallbackFallback(node, eventName, cb, options), options)
			}
		}
	})
	function addListener(node, event, cb) {
		getListenerAdder(event)(node, cb)
	}

	function setAttr(node, attr, val) {
		if (val === undefined || val === null || val === false) return

		function handler(newVal) {
			if (newVal === undefined || newVal === null || newVal === false) node.removeAttribute(attr)
			else if (newVal === true) node.setAttribute(attr, '')
			else node.setAttribute(attr, newVal)
		}

		bind(handler, val)
	}
	// eslint-disable-next-line max-params
	function setAttrNS(node, attr, val, ns) {
		if (val === undefined || val === null || val === false) return

		function handler(newVal) {
			if (newVal === undefined || newVal === null || newVal === false) node.removeAttributeNS(ns, attr)
			else if (newVal === true) node.setAttributeNS(ns, attr, '')
			else node.setAttributeNS(ns, attr, newVal)
		}

		bind(handler, val)
	}

	const getPropSetter = cachedStrKeyNoFalsy(function(prop) {
		prop = propAliases[prop] || prop
		const [prefix, key] = splitFirst(prop, ':')
		if (key) {
			switch (prefix) {
				default: {
					if (prefix === 'on' || prefix.startsWith('on-')) {
						return function(node, val) {
							return addListener(node, prop, val)
						}
					}
					if (prefix === 'm') {
						return function (node, val) {
							return macros[key](node, val)
						}
					}
					if (onDirective) {
						const setter = onDirective(prefix, key, prop)
						if (setter) {
							return setter
						}
					}
					const nsuri = namespaces[prefix] || prefix
					return function(node, val) {
						return setAttrNS(node, key, val, nsuri)
					}
				}
				case 'attr': {
					return function(node, val) {
						return setAttr(node, key, val)
					}
				}
				case 'prop': {
					prop = key
				}
			}
		} else if (prop.indexOf('-') > -1) {
			return function(node, val) {
				return setAttr(node, prop, val)
			}
		}

		return function(node, val) {
			if (val === undefined || val === null) return
			if (isSignal(val)) {
				val.connect(function() {
					node[prop] = peek(val)
				})
			} else {
				node[prop] = val
			}
		}
	})

	function setProps(node, props) {
		for (let prop in props) getPropSetter(prop)(node, props[prop])
	}

	function useMacro({name, handler}) {
		macros[name] = handler
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
		macros,
		useMacro
	}

	return createRenderer(nodeOps, rendererID)
}

export { createDOMRenderer, defaultRendererID }
