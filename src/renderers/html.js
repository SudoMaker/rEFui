import { isSignal, nextTick, peek, bind } from '../signal.js'
import { createRenderer } from '../renderer.js'
import { nop, cachedStrKeyNoFalsy, removeFromArr } from '../utils.js'

const FLAG_NODE = Symbol(process.env.NODE_ENV === 'production' ? '' : 'F_Node')
const FLAG_FRAG = Symbol(process.env.NODE_ENV === 'production' ? '' : 'F_Fragment')
const FLAG_SELF_CLOSING = Symbol(process.env.NODE_ENV === 'production' ? '' : 'F_SelfClosing')
const KEY_TAG_NAME = Symbol(process.env.NODE_ENV === 'production' ? '' : 'K_TagName')

const escapeMap = {
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#039;',
	'&': '&amp;'
}

const escapeHtml = (unsafe) => {
	return `${unsafe}`
		.replace(/[<>"'&]/g, (match) => escapeMap[match])
}


const makeNode = (node) => {
	node[FLAG_NODE] = true
	node.parent = null
	return node
}

const defaultRendererID = 'HTML'

const serialize = (node) => node.flat(Infinity).join('')

const createHTMLRenderer = ({
	rendererID = defaultRendererID,
	selfClosingTags = {
		hr: true,
		br: true,
		input: true,
		img: true,
	},
} = {}) => {
	const isNode = (node) => !!(node && node[FLAG_NODE])

	const createNode = (tagName) => {
		const node = makeNode([`<${tagName}`, []])
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
	const createAnchor = (anchorName) => makeNode([''])
	const createTextNode = (text) => {
		if (isSignal(text)) {
			const node = makeNode([''])
			text.connect(() => {
				const newData = peek(text)
				if (newData === undefined || newData === null) node[0] = ''
				else node[0] = escapeHtml(newData)
			})
			return node
		}

		return makeNode([escapeHtml(text)])
	}
	const createFragment = () => {
		const frag = makeNode([])
		frag[FLAG_FRAG] = true
		return frag
	}

	const revokeSelfClosing = (parent) => {
		if (parent[FLAG_SELF_CLOSING]) {
			parent.pop()
			parent.push('>', [], `</${parent[KEY_TAG_NAME]}>`)
			delete parent[FLAG_SELF_CLOSING]
			delete parent[KEY_TAG_NAME]
		}
	}

	const removeNode = (node) => {
		if (!node.parent) return
		removeFromArr(node.parent, node)
		node.parent = null
	}
	const appendNode = (parent, ...nodes) => {
		let _parent = parent
		if (!parent[FLAG_FRAG]) {
			revokeSelfClosing(parent)
			_parent = parent[3]
		}
		for (let node of nodes) {
			if (node[FLAG_FRAG]) {
				for (let _node of node) {
					_node.parent = _parent
				}
				_parent.push(...node)
				node.length = 0
			} else {
				_parent.push(node)
				node.parent = _parent
			}
		}
	}
	const insertBefore = (node, ref) => {
		const parent = ref.parent
		if (!parent) {
			throw new ReferenceError('InsertBefore: Ref does not have a parent!')
		}

		const index = parent.indexOf(ref)
		if (index > -1) {
			if (node[FLAG_FRAG]) {
				for (let _node of node) {
					_node.parent = parent
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

	const getPropSetter = cachedStrKeyNoFalsy((key) => {
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

		const propHeader = ` ${key}="`

		return (propsNode, val) => {
			if (isSignal(val)) {
				const propNode = [propHeader, '', '"']
				val.connect(() => {
					const newData = peek(val)
					if (newData === undefined || newData === null) {
						removeFromArr(propsNode, propNode)
						propNode[1] = ''
					} else {
						if (propsNode.indexOf(propNode) < 0) {
							propsNode.push(propNode)
						}
						propNode[1] = escapeHtml(newData)
					}
				})
			} else if (val !== undefined && val !== null) {
				propsNode.push(`${propHeader}${escapeHtml(val)}"`)
			}
		}
	})

	const setProps = (node, props) => {
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
		serialize,
	}

	return createRenderer(nodeOps, rendererID)
}

export { createHTMLRenderer, defaultRendererID }
