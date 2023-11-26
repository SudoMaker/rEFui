import { Component, build } from './component.js'

const Fragment = '<>'

const createRenderer = (nodeOps) => {
	const { isNode, createNode, createTextNode, createFragment, setProps, appendNode } = nodeOps

	const normalizeChildren = (children) => {
		const normalizedChildren = []

		if (children.length) {
			for (let child of children) {
				// eslint-disable-next-line no-undefined
				if (child !== null && child !== undefined) {
					if (isNode(child)) normalizedChildren.push(child)
					else normalizedChildren.push(createTextNode(child))
				}
			}
		}

		return normalizedChildren
	}

	const createComponent = (init, props = {}, ...children) => {
		const component = new Component(init, props || {}, ...children)
		if (props.$ref) props.$ref.value = component
		return component
	}

	const createElement = (tag, props, ...children) => {
		if (typeof tag === 'string') {
			const normalizedChildren = normalizeChildren(children)
			const node = tag === Fragment ? createFragment(normalizedChildren) : createNode(tag)

			if (props) {
				setProps(node, props)
				if (props.$ref) props.$ref.value = node
			}

			if (normalizedChildren.length) appendNode(node, ...normalizedChildren)

			return node
		}

		const component = createComponent(tag, props, ...children)

		return build(component, renderer)
	}

	const render = (target, ...args) => {
		const component = createComponent(...args)
		const node = build(component, renderer)
		if (target && node) appendNode(target, node)
		return component
	}

	const renderer = {
		...nodeOps,
		normalizeChildren,
		createComponent,
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
