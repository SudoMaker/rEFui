import { isSignal } from 'refui/signal'
import { nop } from 'refui/utils'

let jsxDEV = nop
let Fragment = '<>'

function wrap(R) {
	jsxDEV = function(tag, props, key, ...args) {
		try {
			if (key !== undefined && key !== null) {
				props.key = key
			}
			if (Object.hasOwn(props, 'children')) {
				const { children } = props
				if (Array.isArray(children) && !R.isNode(children)) {
					return R.c(tag, props, ...children)
				} else {
					return R.c(tag, props, children)
				}
			} else {
				return R.c(tag, props)
			}
		} catch (e) {
			if (typeof tag === 'function') {
				tag = tag.name
			} else if (isSignal(tag)) {
				tag = (tag.name || tag.peek()?.name || null)
			}
			const [, dbgInfo] = args
			if (dbgInfo) {
				const { fileName, lineNumber, columnNumber } = dbgInfo
				console.error(`Error happened while rendering <${tag}> in (${fileName}:${lineNumber}:${columnNumber}):\n`, e)
			} else {
				console.error(`Error happened while rendering <${tag}>:\n`, e)
			}
			throw e
		}
	}

	Fragment = R.f

	return {
		jsxDEV,
		Fragment
	}
}

const _default = {
	wrap,
	get default() {
		return _default;
	},
	get jsxDEV() {
		return jsxDEV;
	},
	get Fragment() {
		return Fragment
	}
}

export default _default
export {
	wrap,
	jsxDEV,
	Fragment
}
