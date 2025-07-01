import { signal } from 'refui/signal'
import { onDispose, dispose, getCurrentSelf, For, Fn } from 'refui/components'
import { removeFromArr } from 'refui/utils'

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
