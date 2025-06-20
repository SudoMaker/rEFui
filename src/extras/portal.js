import { signal, onDispose } from '../signal.js'
import { dispose, getCurrentSelf, For, Fn } from '../component.js'
import { removeFromArr } from '../utils.js'

function dumbFn(_) {
	return _
}

function createPortal() {
	let currentOutlet = null
	const nodes = signal([])
	function outletView(R) {
		return R.c(For, { entries: nodes }, dumbFn)
	}
	function Inlet(_, ...children) {
		return function({ normalizeChildren }) {
			const normalizedChildren = normalizeChildren(children)
			nodes.peek().push(...normalizedChildren)
			nodes.trigger()
			onDispose(function() {
				const arr = nodes.peek()
				for (let i of normalizedChildren) {
					removeFromArr(arr, i)
				}
				nodes.value = [...nodes.peek()]
			})
		}
	}
	function Outlet(_, fallback) {
		if (currentOutlet) dispose(currentOutlet)
		currentOutlet = getCurrentSelf()
		return function({ c }) {
			return c(Fn, null, function() {
				if (nodes.value.length) return outletView
				return fallback
			})
		}
	}

	return [Inlet, Outlet]
}

export { createPortal }
