import { isSignal } from 'refui/signal'
import { render, createComponent } from 'refui/components'
import { removeFromArr } from 'refui/utils'
import { isProduction } from 'refui/constants'

const Fragment = '<>'

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
		return [anchorStart, ...flattenChildren(children), anchorEnd]
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
				appendNodeRaw(node, ..._expandFragment(anchorStart, children, anchorEnd, flags))
				flags.connected = false
			}
		} else {
			removeNodeRaw(node)
		}
	}

	function appendNode(parent, ...nodes) {
		if (isFragment(parent)) {
			const [, , anchorEnd] = fragmentMap.get(parent)
			for (let node of nodes) {
				insertBefore(node, anchorEnd)
			}
			return
		} else {
			for (let node of nodes) {
				removeNode(node)
				parentMap.set(node, parent)
			}
			appendNodeRaw(parent, ...flattenChildren(nodes))
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
			for (let child of expandFragment(node)) insertBeforeRaw(child, ref)
			return
		}

		return insertBeforeRaw(node, ref)
	}

	function ensureElement(el) {
		if (el === null || el === undefined || isNode(el)) return el
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
			function flatChildren(childArr) {
				for (let child of childArr) {
					if (child !== null && child !== undefined) {
						if (isNode(child)) {
							flushTextBuffer()
							normalizedChildren.push(child)
						} else if (isSignal(child)) {
							flushTextBuffer()
							normalizedChildren.push(createTextNode(child))
						} else if (Array.isArray(child)) {
							flatChildren(child)
						} else {
							mergedTextBuffer += child
						}
					}
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

			if (normalizedChildren.length) appendNode(node, ...normalizedChildren)

			return node
		}

		const instance = createComponent(tag, props, ...children)

		return ensureElement(render(instance, renderer))
	}

	function renderComponent(target, ...args) {
		const instance = createComponent(...args)
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
