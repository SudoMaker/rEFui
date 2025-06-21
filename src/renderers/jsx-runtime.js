import { nop } from '../utils.js'
import { wrap as wrapDev } from './jsx-dev-runtime.js'

let jsx = nop
let jsxs = nop
let Fragment = '<>'

function wrap(R) {
	jsx = function(tag, props, key) {
		if (key !== undefined && key !== null) {
			props.key = key
		}
		if (Object.hasOwn(props, 'children')) {
			const children = props.children
			if (Array.isArray(children) && !R.isNode(children)) {
				return R.c(tag, props, ...props.children)
			} else {
				return R.c(tag, props, props.children)
			}
		} else {
			return R.c(tag, props)
		}
	}

	jsxs = function(tag, props, key) {
		if (key !== undefined && key !== null) {
			props.key = key
		}
		return R.c(tag, props, ...props.children)
	}

	Fragment = R.f

	if (process.env.NODE_ENV !== 'production') {
		wrapDev(R)
	}

	return {
		jsx,
		jsxs,
		Fragment
	}
}

const _default = {
	wrap,
	get default() {
		return _default;
	},
	get jsx() {
		return jsx;
	},
	get jsxs() {
		return jsxs;
	},
	get Fragment() {
		return Fragment
	}
}

export default _default
export {
	wrap,
	jsx,
	jsxs,
	Fragment
}
