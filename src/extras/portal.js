import { signal, onDispose } from '../signal.js'
import { dispose, getCurrentSelf, For, Fn } from '../component.js'
import { removeFromArr } from '../utils.js'

const createPortal = () => {
	let currentOutlet = null
	const nodes = signal([])
	const outletView = R => R.c(For, { entries: nodes }, child => child)
	const Inlet = (_, ...children) => ({ normalizeChildren }) => {
		const normalizedChildren = normalizeChildren(children)
		nodes.peek().push(...normalizedChildren)
		nodes.trigger()
		onDispose(() => {
			const arr = nodes.peek()
			for (let i of normalizedChildren) {
				removeFromArr(arr, i)
			}
			nodes.value = [...nodes.peek()]
		})
	}
	const Outlet = (_, fallback) => {
		if (currentOutlet) dispose(currentOutlet)
		currentOutlet = getCurrentSelf()
		return ({ c }) => c(Fn, null, () => {
			if (nodes.value.length) return outletView
			if (fallback) return fallback
		})
	}

	return [Inlet, Outlet]
}

export { createPortal }
