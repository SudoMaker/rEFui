import { nop } from '../utils.js'

let jsxDEV = nop
let Fragment = '<>'

function wrap(R) {
	jsxDEV = function(tag, {children = [], ...props}, key, ...args) {
		try {
			if (key) {
				props.key = key
			}
			return R.c(tag, props, ...children)
		} catch (e) {
			throw new Error(`Error happened while rendering component ${args.join(' ')}`, { cause: e })
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
