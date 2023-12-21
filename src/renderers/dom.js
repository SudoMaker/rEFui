import { isSignal, watch, nextTick, peek } from '../signal.js'
import { createRenderer } from '../renderer.js'
import { nop, cached } from '../utils.js'

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

const createDOMRenderer = ({
	doc = document,
	namespaces = {},
	tagNamespaceMap = {},
	tagAliases = {},
	propAliases = {}
} = {}) => {
	let eventPassiveSupported = false
	let eventOnceSupported = false

	try {
		const options = {
			passive: {
				get: () => {
					eventPassiveSupported = true
					return eventPassiveSupported
				}
			},
			once: {
				get: () => {
					eventOnceSupported = true
					return eventOnceSupported
				}
			}
		}
		const testEvent = '__refui_event_option_test__'
		doc.addEventListener(testEvent, nop, options)
		doc.removeEventListener(testEvent, nop, options)
	} catch (e) {

		/* do nothing */
	}

	// eslint-disable-next-line max-params
	const eventCallbackFallback = (node, event, handler, options) => {
		if (options.once && !eventOnceSupported) {
			const _handler = handler
			handler = (...args) => {
				_handler(...args)
				node.removeEventListener(event, handler, options)
			}
		}
		if (options.passive && !eventPassiveSupported) {
			const _handler = handler
			handler = (...args) => {
				nextTick(() => _handler(...args))
			}
		}

		return handler
	}

	const isNode = node => !!(node && node.cloneNode)

	const getNodeCreator = cached((tagNameRaw) => {
		let [nsuri, tagName] = tagNameRaw.split(':')
		if (!tagName) {
			tagName = nsuri
			nsuri = tagNamespaceMap[tagName]
		}
		tagName = tagAliases[tagName] || tagName
		if (nsuri) {
			nsuri = namespaces[nsuri] || nsuri
			return () => doc.createElementNS(nsuri, tagName)
		}
		return () => doc.createElement(tagName)
	})

	const createNode = tagName => getNodeCreator(tagName)()
	const createAnchor = (anchorName) => {
		if (process.env.NODE_ENV === 'development') return doc.createComment(anchorName || '')
		return doc.createTextNode('')
	}
	const createTextNode = (text) => {
		if (isSignal(text)) {
			const node = doc.createTextNode('')
			text.connect(() => {
				const newData = peek(text)
				if (typeof newData === 'undefined') node.data = ''
				else node.data = newData
			})
			return node
		}

		return doc.createTextNode(text)
	}
	const createFragment = (children = []) => {
		const node = doc.createDocumentFragment()
		const anchorStart = createAnchor('DOM-fragment')
		node.appendChild(anchorStart)

		node.$ = {
			anchorStart,
			children
		}

		return node
	}
	const removeNode = (node) => {
		if (node.$) {
			if (node.$.anchorStart.parentNode !== node) {
				appendNode(node, node.$.anchorStart, ...node.$.children)
			}
			return
		}
		if (node.parentNode) node.parentNode.removeChild(node)
	}
	const appendNode = (parent, ...nodes) => {
		for (let node of nodes) {
			if (node.$) removeNode(node)
			parent.insertBefore(node, null)
		}
	}
	const insertBefore = (node, ref) => {
		if (node.$) removeNode(node)
		if (ref.$) ref = ref.$.anchorStart
		ref.parentNode.insertBefore(node, ref)
	}

	const getListenerAdder = cached((event) => {
		const [prefix, eventName] = event.split(':')
		if (prefix === 'on') {
			return (node, cb) => {
				if (!cb) return
				if (isSignal(cb)) {
					let currentHandler = null
					cb.connect(() => {
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
			return (node, cb) => {
				if (!cb) return
				if (isSignal(cb)) {
					let currentHandler = null
					cb.connect(() => {
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
	const addListener = (node, event, cb) => {
		getListenerAdder(event)(node, cb)
	}

	const setAttr = (node, attr, val) => {
		if (val === undefined || val === null || val === false) return
		if (isSignal(val)) val.connect(() => {
			const newVal = peek(val)
			if (newVal === undefined || newVal === null || newVal === false) node.removeAttribute(attr)
			else if (newVal === true) node.setAttribute(attr, '')
			else node.setAttribute(attr, newVal)
		})
		else if (typeof val === 'function') watch(() => {
			const newVal = peek(val())
			if (newVal === undefined || newVal === null || newVal === false) node.removeAttribute(attr)
			else if (newVal === true) node.setAttribute(attr, '')
			else node.setAttribute(attr, newVal)
		})
		else if (val === true) node.setAttribute(attr, '')
		else node.setAttribute(attr, val)
	}
	// eslint-disable-next-line max-params
	const setAttrNS = (node, attr, val, ns) => {
		if (val === undefined || val === null || val === false) return
		if (isSignal(val)) val.connect(() => {
			const newVal = peek(val)
			if (newVal === undefined || newVal === null || newVal === false) node.removeAttributeNS(ns, attr)
			else if (newVal === true) node.setAttributeNS(ns, attr, '')
			else node.setAttributeNS(ns, attr, newVal)
		})
		else if (typeof val === 'function') watch(() => {
			const newVal = peek(val())
			if (newVal === undefined || newVal === null || newVal === false) node.removeAttributeNS(ns, attr)
			else if (newVal === true) node.setAttributeNS(ns, attr, '')
			else node.setAttributeNS(ns, attr, newVal)
		})
		else if (val === true) node.setAttributeNS(ns, attr, '')
		else node.setAttributeNS(ns, attr, val)
	}

	const getPropSetter = cached((prop) => {
		prop = propAliases[prop] || prop
		const [prefix, key] = prop.split(':')
		if (key) {
			switch (prefix) {
				default: {
					if (prefix === 'on' || prefix.startsWith('on-')) return (node, val) => addListener(node, prop, val)
					const nsuri = namespaces[prefix] || prefix
					return (node, val) => setAttrNS(node, key, val, nsuri)
				}
				case 'attr': {
					return (node, val) => setAttr(node, key, val)
				}
				case 'prop': {
					prop = key
				}
			}
		} else if (prop.indexOf('-') > -1) {
			return (node, val) => setAttr(node, prop, val)
		}

		return (node, val) => {
			if (val === undefined || val === null) return
			if (isSignal(val)) val.connect(() => (node[prop] = peek(val)))
			else node[prop] = val
		}
	})

	const setProps = (node, props) => {
		for (let prop in props) getPropSetter(prop)(node, props[prop])
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
		removeNode
	}

	return createRenderer(nodeOps)
}

export { createDOMRenderer }
