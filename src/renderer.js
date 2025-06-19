import { render, createComponent } from './component.js'
import { isSignal } from './signal.js'
import { removeFromArr } from './utils.js'

const Fragment = '<>'

const createRenderer = (nodeOps, rendererID) => {
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

	const isFragment = i => i && fragmentMap.has(i)

	const createFragment = (name) => {
		const fragment = createFragmentRaw()
		const anchorStart = createAnchor((process.env.NODE_ENV === 'production') ? '' : ((name === undefined || name === null) ? null : `<${name}>`))
		const anchorEnd = createAnchor((process.env.NODE_ENV === 'production') ? '' : ((name === undefined || name === null) ? null : `</${name}>`))
		appendNodeRaw(fragment, anchorStart, anchorEnd)
		parentMap.set(anchorStart, fragment)
		parentMap.set(anchorEnd, fragment)
		fragmentMap.set(fragment, [anchorStart, [], anchorEnd, {connected: false}])
		return fragment
	}

	const flattenChildren = (children) => children.reduce((result, i) => {
		if (isFragment(i)) result.push(...expandFragment(i))
		else result.push(i)
		return result
	}, [])

	const expandFragment = (node) => {
		const [anchorStart, children, anchorEnd, flags] = fragmentMap.get(node)
		if (flags.connected) {
			return [anchorStart, ...flattenChildren(children), anchorEnd]
		}

		flags.connected = true
		return [node]
	}

	const removeNode = (node) => {
		const parent = parentMap.get(node)

		if (!parent) return

		if (isFragment(parent)) {
			const [, children] = fragmentMap.get(parent)
			removeFromArr(children, node)
		}

		parentMap.delete(node)

		if (isFragment(node)) {
			const [, , , flags] = fragmentMap.get(node)
			if (flags.connected) {
				appendNodeRaw(node, ...expandFragment(node))
				flags.connected = false
			}
		} else {
			removeNodeRaw(node)
		}
	}

	const appendNode = (parent, ...nodes) => {
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

	const insertBefore = (node, ref) => {
		removeNode(node)

		const parent = parentMap.get(ref)
		parentMap.set(node, parent)

		if (isFragment(parent)) {
			const [, children] = fragmentMap.get(parent)
			const idx = children.indexOf(ref)
			children.splice(idx, 0, node)
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

	const ensureElement = (el) => {
		if (el === null || el === undefined || isNode(el)) return el
		return createTextNode(el)
	}

	const normalizeChildren = (children) => {
		const normalizedChildren = []

		if (children.length) {
			let mergedTextBuffer = ''
			const flushTextBuffer = () => {
				if (mergedTextBuffer) {
					normalizedChildren.push(createTextNode(mergedTextBuffer))
					mergedTextBuffer = ''
				}
			}
			for (let child of children) {
				if (child !== null && child !== undefined) {
					if (isNode(child)) {
						flushTextBuffer()
						normalizedChildren.push(child)
					} else if (isSignal(child)) {
						flushTextBuffer()
						normalizedChildren.push(createTextNode(child))
					} else {
						mergedTextBuffer += child
					}
				}
			}
			flushTextBuffer()
		}

		return normalizedChildren
	}

	const createElement = (tag, props, ...children) => {
		if (typeof tag === 'string') {
			const normalizedChildren = normalizeChildren(children)
			const node = tag === Fragment ? createFragment('') : createNode(tag)

			if (props) {
				const { $ref, ..._props } = props
				setProps(node, _props)
				if ($ref) {
					$ref.value = node
				}
			}

			if (normalizedChildren.length) appendNode(node, ...normalizedChildren)

			return node
		}

		const instance = createComponent(tag, props, ...children)

		return ensureElement(render(instance, renderer))
	}

	const renderComponent = (target, ...args) => {
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
