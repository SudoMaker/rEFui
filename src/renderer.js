import { Component, build } from './component.js'

const Fragment = '<>'

const createRenderer = (nodeOps) => {
	const { isNode, createNode, createTextNode, createFragment, setProps, appendNode } = nodeOps

	const normalizeChildren = (children) => {
		const normalizedChildren = []

		if (children.length) {
			let mergedTextBuffer = ''
			for (let child of children) {
				if (child !== null && child !== undefined) {
					if (isNode(child)) {
						// eslint-disable-next-line max-depth
						if (mergedTextBuffer) {
							normalizedChildren.push(createTextNode(mergedTextBuffer))
							mergedTextBuffer = ''
						}
						normalizedChildren.push(child)
					} else {
						mergedTextBuffer += child
					}
				}
			}
			if (mergedTextBuffer) {
				normalizedChildren.push(createTextNode(mergedTextBuffer))
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
