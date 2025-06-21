import { nop } from '../utils.js'
import { wrap as wrapDev } from './jsx-dev-runtime'

let jsx = nop
let jsxs = nop
let Fragment = '<>'

function wrap(R) {
	jsx = function(tag, {children, ...props}, key) {
		if (key) {
			props.key = key
		}
		if (children === undefined || children === null) {
			return R.c(tag, props)
		} else {
			return R.c(tag, props, children)
		}
	}
	jsxs = function(tag, {children, ...props}, key) {
		if (key) {
			props.key = key
		}
		return R.c(tag, props, ...children)
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
