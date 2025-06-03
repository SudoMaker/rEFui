import { nop } from '../utils.js'

let jsx = nop
let jsxs = nop
let Fragment = '<>'

const wrap = (R) => {
	jsx = (tag, {children, ...props}, key) => {
		if (key) {
			props.key = key
		}
		return R.c(tag, props, children)
	}
	jsxs = (tag, {children = [], ...props}, key) => {
		if (key) {
			props.key = key
		}
		return R.c(tag, props, ...children)
	}
	Fragment = R.f

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
