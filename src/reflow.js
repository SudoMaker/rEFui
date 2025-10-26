import { Fragment } from 'refui/renderer'
import { hotEnabled } from 'refui/hmr'
import { isThenable } from 'refui/utils'

const createElement = (function() {
	if (hotEnabled) {
		const dummyRenderFn = function(props, classicChildren, R) {
			return R.c(this, props, ...classicChildren)
		}
		return function(component, props, ...classicChildren) {
			return dummyRenderFn.bind(component, props, classicChildren)
		}
	} else {
		const emptyProp = {}
		const dummyRenderFn = function(R) {
			return R.c(this)
		}
		const dummyComponent = function() {
			return this
		}
		const makeDummy = function(future) {
			return dummyRenderFn.bind(dummyComponent.bind(future))
		}

		return function(component, props, ...classicChildren) {
			const { children = classicChildren, ..._props } = props || emptyProp
			if (typeof component === 'function') {
				const renderFn = component(_props, ...children)
				if (isThenable(renderFn)) {
					return makeDummy(renderFn)
				}
				return renderFn
			}

			return function(R) {
				return R.c(component, null, ...children)
			}
		}
	}
})()

const R = {
	createElement,
	Fragment,
	c: createElement,
	f: Fragment
}

export { R }
