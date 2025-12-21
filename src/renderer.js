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

import { isSignal } from 'refui/signal'
import { render, createComponent, Async } from 'refui/components'
import { removeFromArr, isThenable, isPrimitive, isStatic, nullRefObject } from 'refui/utils'
import { isProduction } from 'refui/constants'

const Fragment = '<>'

const dummyFutureHandler = function(props) {
	return props.result
}

const createAsync = function(future) {
	return createComponent(Async, { future }, dummyFutureHandler)
}

function createRenderer(nodeOps, rendererID) {
	const {
		isNode,
		createNode,
		createTextNode,
		createAnchor,
		createFragment: createFragmentRaw,
		removeNode: removeNodeRaw,
		appendNode: appendNodeRaw,
		insertBefore: insertBeforeRaw,
		setProps,
	} = nodeOps

	const fragmentMap = new WeakMap()
	const parentMap = new WeakMap()

	function isFragment(i) {
		return i && fragmentMap.has(i)
	}

	function createFragment(name) {
		const fragment = createFragmentRaw()
		const anchorStart = createAnchor(isProduction ? '' : ((name === undefined || name === null) ? null : `<${name}>`))
		const anchorEnd = createAnchor(isProduction ? '' : ((name === undefined || name === null) ? null : `</${name}>`))
		appendNodeRaw(fragment, anchorStart, anchorEnd)
		parentMap.set(anchorStart, fragment)
		parentMap.set(anchorEnd, fragment)
		fragmentMap.set(fragment, [anchorStart, [], anchorEnd, {connected: false}])
		return fragment
	}

	function flatChildrenReducer(result, i) {
		if (isFragment(i)) result.push(...expandFragment(i))
		else result.push(i)
		return result
	}
	function flattenChildren(children) {
		return children.reduce(flatChildrenReducer, [])
	}

	function _expandFragment(anchorStart, children, anchorEnd, flags) {
		const flattened = flattenChildren(children)
		flattened.unshift(anchorStart)
		flattened.push(anchorEnd)
		return flattened
	}
	function expandFragment(node) {
		const [anchorStart, children, anchorEnd, flags] = fragmentMap.get(node)
		if (flags.connected) {
			return _expandFragment(anchorStart, children, anchorEnd, flags)
		}

		flags.connected = true
		return [node]
	}

	function removeNode(node) {
		const parent = parentMap.get(node)

		if (!parent) return

		if (isFragment(parent)) {
			const [, children] = fragmentMap.get(parent)
			removeFromArr(children, node)
		}

		parentMap.delete(node)

		if (isFragment(node)) {
			const [anchorStart, children, anchorEnd, flags] = fragmentMap.get(node)
			if (flags.connected) {
				const expanded = _expandFragment(anchorStart, children, anchorEnd, flags)
				expanded.unshift(node)
				appendNodeRaw.apply(null, expanded)
				flags.connected = false
			}
		} else {
			removeNodeRaw(node)
		}
	}

	function appendNode(parent, ...nodes) {
		const nodeCount = nodes.length
		if (isFragment(parent)) {
			const [, , anchorEnd] = fragmentMap.get(parent)
			for (let i = 0; i < nodeCount; i++) {
				insertBefore(nodes[i], anchorEnd)
			}
			return
		} else {
			for (let i = 0; i < nodeCount; i++) {
				removeNode(nodes[i])
				parentMap.set(nodes[i], parent)
			}
			const flattened = flattenChildren(nodes)
			flattened.unshift(parent)
			appendNodeRaw.apply(null, flattened)
		}
	}

	function insertBefore(node, ref) {
		removeNode(node)

		const parent = parentMap.get(ref)
		parentMap.set(node, parent)

		if (isFragment(parent)) {
			const [, children, anchorEnd] = fragmentMap.get(parent)
			if (anchorEnd === ref) {
				children.push(node)
			} else {
				const idx = children.indexOf(ref)
				children.splice(idx, 0, node)
			}
		}

		if (isFragment(ref)) {
			const [anchorStart] = fragmentMap.get(ref)
			ref = anchorStart
		}

		if (isFragment(node)) {
			const expanded = expandFragment(node)
			const expandedLength = expanded.length
			for (let i = 0; i < expandedLength; i++) {
				insertBeforeRaw(expanded[i], ref)
			}
			return
		}

		return insertBeforeRaw(node, ref)
	}

	function ensureElement(el) {
		while (typeof el === 'function') {
			el = el(renderer)
		}
		if (el === null || el === undefined || isNode(el)) return el
		if (isThenable(el)) {
			return render(createAsync(el), renderer)
		}
		if (Array.isArray(el)) {
			if (el.length > 1) {
				const fragment = createFragment('Array')
				appendNode(fragment, ...normalizeChildren(el))
				return fragment
			} else if (el.length === 1) {
				return ensureElement(el[0])
			} else {
				return null
			}
		}
		return createTextNode(el)
	}

	function normalizeChildren(children) {
		const normalizedChildren = []

		if (children.length) {
			let mergedTextBuffer = ''
			function flushTextBuffer() {
				if (mergedTextBuffer) {
					normalizedChildren.push(createTextNode(mergedTextBuffer))
					mergedTextBuffer = ''
				}
			}
			function processChild(child) {
				if (child !== null && child !== undefined) {
					if (isNode(child)) {
						flushTextBuffer()
						normalizedChildren.push(child)
					} else if (isPrimitive(child)) {
						mergedTextBuffer += String(child)
					} else if (isSignal(child)) {
						flushTextBuffer()
						normalizedChildren.push(createTextNode(child))
					} else if (typeof child === 'function') {
						let result = child
						do {
							result = result(renderer)
						} while (typeof result === 'function')
						processChild(result)
					} else if (Array.isArray(child)) {
						flatChildren(child)
					} else if (isThenable(child)) {
						flushTextBuffer()
						normalizedChildren.push(render(createAsync(child), renderer))
					} else {
						try {
							mergedTextBuffer += JSON.stringify(child)
						} catch(_) {
							// error is ignored
							mergedTextBuffer += String(child)
						}
					}
				}
			}
			function flatChildren(childArr) {
				const childArrLength = childArr.length
				for (let i = 0; i < childArrLength; i++) {
					processChild(childArr[i])
				}
			}
			flatChildren(children)
			flushTextBuffer()
		}

		return normalizedChildren
	}

	function createElement(tag, props, ...children) {
		if (typeof tag === 'string') {
			const normalizedChildren = normalizeChildren(children)
			const node = tag === Fragment ? createFragment('') : createNode(tag)

			if (props) {
				// `children` is omitted when passing to the node
				const { $ref, children, ..._props } = props
				setProps(node, _props)
				if ($ref) {
					if (isSignal($ref)) {
						$ref.value = node
					} else if (typeof $ref === 'function') {
						$ref(node)
					} else if (!isProduction) {
						throw new Error(`Invalid $ref type: ${typeof $ref}`)
					}
				}
			}

			if (normalizedChildren.length) {
				normalizedChildren.unshift(node)
				appendNode.apply(null, normalizedChildren)
			}

			return node
		} else if (isThenable(tag)) {
			return render(createAsync(tag), renderer)
		}

		if (isStatic(tag)) {
			const { $ref, ..._props } = props ?? nullRefObject
			if ($ref) {
				return ensureElement(tag(_props, ...children))
			}
		}

		return render(createComponent(tag, props, ...children), renderer)
	}

	function renderComponent(target, ...args) {
		const instance = createComponent.apply(null, args)
		const node = render(instance, renderer)
		if (target && node) appendNode(target, node)
		return instance
	}

	const renderer = {
		...nodeOps,
		nodeOps,
		id: rendererID || Symbol('rEFui renderer'),
		normalizeChildren,
		isFragment,
		expandFragment,
		createFragment,
		createElement,
		ensureElement,
		removeNode,
		appendNode,
		insertBefore,
		Fragment,
		render: renderComponent,
		text: createTextNode,
		c: createElement,
		f: Fragment
	}

	return renderer
}

export { createRenderer, Fragment }
