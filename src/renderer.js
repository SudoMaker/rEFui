import { isSignal } from './signal.js'
import { build } from './component.js'

const Fragment = '<>'

const createRenderer = (nodeOps) => {
	const { isNode, createNode, createTextNode, createFragment, setProps, appendNode } = nodeOps

	const normalizeChildren = (children) => {
		const normalizedChildren = []

		if (children.length) {
			for (let child of children) {
				if (typeof child !== 'undefined') {
					if (isNode(child)) normalizedChildren.push(child)
					else normalizedChildren.push(createTextNode(child))
				}
			}
		}

		return normalizedChildren
	}

	const createElement = (tagName, props, ...children) => {
		if (typeof tagName === 'string') {
			const normalizedChildren = normalizeChildren(children)
			const node = tagName === Fragment ? createFragment(normalizedChildren) : createNode(tagName)

			if (props) {
				setProps(node, props)
				if (props.$ref && isSignal(props.$ref)) props.$ref.value = node
			}

			if (normalizedChildren.length) appendNode(node, ...normalizedChildren)

			return node
		}

		const component = new tagName(props || {}, ...children)

		if (props && isSignal(props.$ref)) props.$ref.value = component

		return build(component, renderer)
	}

	const render = (component, target) => {
		const node = build(component, renderer)
		if (node && target) appendNode(target, node)
		return node
	}

	const renderer = {
		...nodeOps,
		normalizeChildren,
		createElement,
		Fragment,
		render,
		text: createTextNode,
		c: createElement,
		f: Fragment
	}

	return renderer
}

export { createRenderer, Fragment }
