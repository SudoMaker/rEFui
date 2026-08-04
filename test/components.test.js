import assert from 'node:assert/strict'
import test from 'node:test'

import {
	Component,
	Dynamic,
	Fn,
	For,
	If,
	Render,
	capture,
	createComponent,
	createContext,
	dispose,
	getCurrentSelf,
	render,
	useContext
} from 'refui/components'
import { createHTMLRenderer } from 'refui/html'
import { createRenderer } from 'refui/renderer'
import { EffectScope, nextTick, onDispose, signal, watch } from 'refui/signal'

function createInstrumentedTreeRenderer({
	rendererOwnsParents = false,
	supportsBulkClear = true
} = {}) {
	const stats = {
		clearAttempts: 0,
		clearCalls: 0,
		parentReads: 0,
		removeCalls: 0
	}

	function createHost(type, value) {
		return {
			children: [],
			fragment: type === 'fragment',
			host: true,
			parent: null,
			type,
			value
		}
	}

	function detach(node) {
		const parent = node.parent
		if (!parent) return
		const index = parent.children.indexOf(node)
		if (index > -1) parent.children.splice(index, 1)
		node.parent = null
	}

	function appendOne(parent, node) {
		if (node.fragment) {
			const children = node.children.slice()
			node.children.length = 0
			for (let i = 0; i < children.length; i++) appendOne(parent, children[i])
			return
		}
		detach(node)
		parent.children.push(node)
		node.parent = parent
	}

	function insertOne(node, reference) {
		const parent = reference.parent
		if (!parent) return
		if (node.fragment) {
			const children = node.children.slice()
			node.children.length = 0
			for (let i = 0; i < children.length; i++) insertOne(children[i], reference)
			return
		}
		detach(node)
		const index = parent.children.indexOf(reference)
		if (index > -1) {
			parent.children.splice(index, 0, node)
			node.parent = parent
		}
	}

	const nodeOps = {
		isNode(node) {
			return !!node?.host
		},
		createNode(tag) {
			return createHost('node', tag)
		},
		createTextNode(text) {
			return createHost('text', String(text ?? ''))
		},
		createAnchor(name) {
			return createHost('anchor', name)
		},
		createFragment() {
			return createHost('fragment')
		},
		removeNode(node) {
			if (!node.parent) return
			stats.removeCalls += 1
			detach(node)
		},
		appendNode(parent, ...children) {
			for (let i = 0; i < children.length; i++) appendOne(parent, children[i])
		},
		insertBefore(node, reference) {
			insertOne(node, reference)
		},
		clearChildren(parent, first, last) {
			stats.clearAttempts += 1
			const children = parent.children
			if (children[0] !== first || children[children.length - 1] !== last) {
				return false
			}
			for (let i = 0; i < children.length; i++) children[i].parent = null
			children.length = 0
			stats.clearCalls += 1
			return true
		},
		setProps() {}
	}
	if (rendererOwnsParents) {
		nodeOps.getParent = function (node) {
			stats.parentReads += 1
			return node.parent
		}
	}
	if (!supportsBulkClear) delete nodeOps.clearChildren
	const R = createRenderer(nodeOps)

	return {
		R,
		root: createHost('root'),
		stats
	}
}

test('Component instances are their own effect scopes', function () {
	const instance = createComponent(function () {
		return function () {
			return null
		}
	})

	assert.equal(instance instanceof EffectScope, true)
	dispose(instance)
})

test('freeze-backed capture restores component and user contexts', function () {
	const R = createHTMLRenderer()
	const Value = createContext('outside')
	let readLater

	function Reader() {
		const self = getCurrentSelf()
		readLater = capture(function () {
			return [getCurrentSelf(), useContext(Value)]
		})
		return function () {
			return R.c('span', null, self === getCurrentSelf() ? useContext(Value) : 'wrong self')
		}
	}

	const instance = createComponent(function () {
		return function () {
			return R.c(Value, { value: 'inside' }, function () {
				return R.c(Reader)
			})
		}
	})

	assert.equal(R.serialize(render(instance, R)), '<span>inside</span>')
	assert.equal(readLater()[0] instanceof Component, true)
	assert.equal(readLater()[1], 'inside')
	dispose(instance)
	assert.deepEqual(readLater(), [undefined, 'outside'])
})

test('custom renderers can use core-tracked or renderer-owned parentage', function () {
	for (const rendererOwnsParents of [false, true]) {
		const { R, stats } = createInstrumentedTreeRenderer({ rendererOwnsParents })
		const first = R.c('first')
		const second = R.c('second')
		const one = R.c('one')
		const two = R.c('two')
		const three = R.c('three')

		R.appendNode(first, one, two, three)
		R.insertBefore(three, one)
		assert.deepEqual(first.children, [three, one, two])

		const removeCalls = stats.removeCalls
		R.appendNode(second, one)
		assert.deepEqual(first.children, [three, two])
		assert.deepEqual(second.children, [one])
		assert.equal(stats.removeCalls - removeCalls, rendererOwnsParents ? 0 : 1)
	}
})

test('renderer-owned parentage moves ordinary fragment children without a host removal', function () {
	const { R, root, stats } = createInstrumentedTreeRenderer({
		rendererOwnsParents: true
	})
	const fragment = R.createFragment('rows')
	const one = R.c('one')
	const two = R.c('two')
	const three = R.c('three')
	const target = R.c('target')

	R.appendNode(fragment, one, two, three)
	R.appendNode(root, fragment)
	R.insertBefore(three, one)
	R.appendNode(target, one)

	assert.deepEqual(root.children.filter(function (node) {
		return node.type === 'node'
	}).map(function (node) {
		return node.value
	}), ['three', 'two'])
	assert.deepEqual(target.children, [one])
	assert.equal(stats.parentReads, 0)
	assert.equal(stats.removeCalls, 0)
})

test('For reorders fragment items from bookkeeping without host-parent reads', async function () {
	const { R, root, stats } = createInstrumentedTreeRenderer({
		rendererOwnsParents: true
	})
	const initial = [{ id: 1 }, { id: 2 }, { id: 3 }]
	const entries = signal(initial)
	const view = createComponent(
		For,
		{ entries, track: 'id' },
		function ({ item }) {
			const fragment = R.createFragment(`item-${item.id}`)
			R.appendNode(fragment, R.c(`item-${item.id}-a`), R.c(`item-${item.id}-b`))
			return fragment
		}
	)

	R.appendNode(root, render(view, R))
	stats.parentReads = 0
	entries.value = [initial[2], initial[0], initial[1]]
	await nextTick()

	assert.deepEqual(root.children.filter(function (node) {
		return node.type === 'node'
	}).map(function (node) {
		return node.value
	}), [
		'item-3-a', 'item-3-b',
		'item-1-a', 'item-1-b',
		'item-2-a', 'item-2-b'
	])
	assert.equal(root.children.length, 14)
	assert.equal(stats.parentReads, 0)
	assert.equal(stats.removeCalls, 0)
	dispose(view)
})

test('Render renders a separately-created component instance', function () {
	const R = createHTMLRenderer()
	const child = createComponent(function Child({ message }) {
		return function () {
			return R.c('span', null, message)
		}
	}, { message: 'ok' })
	const wrapper = createComponent(Render, { from: child })

	assert.equal(R.serialize(render(wrapper, R)), '<span>ok</span>')

	dispose(wrapper)
	dispose(child)
})

test('a render setup failure preserves the original error while cleaning its scope', function () {
	const R = createHTMLRenderer()
	const instance = createComponent(function Broken() {
		return function () {
			throw new Error('expected render failure')
		}
	})

	assert.throws(function () {
		render(instance, R)
	}, function (error) {
		return error.message === 'expected render failure'
	})

	dispose(instance)
})

test('static built-ins still populate component refs', function () {
	const R = createHTMLRenderer()
	const ref = signal(null)
	const node = R.c(Fn, { $ref: ref }, function () {
		return R.c('b', null, 'ok')
	})

	assert.ok(ref.peek() instanceof Component)
	assert.equal(R.serialize(node), '<b>ok</b>')

	dispose(ref.peek())
})

test('Dynamic invokes unreferenced function views in its replacement scope', async function () {
	const R = createHTMLRenderer()
	const selected = signal(First)
	const selves = []
	const disposed = []

	function First() {
		selves.push(getCurrentSelf())
		onDispose(function () {
			disposed.push('first')
		})
		return function () {
			return R.c('i', null, 'first')
		}
	}
	function Second() {
		selves.push(getCurrentSelf())
		onDispose(function () {
			disposed.push('second')
		})
		return function () {
			return R.c('b', null, 'second')
		}
	}

	const view = createComponent(function Root() {
		return Dynamic({ is: selected, $ref: null })
	})
	const node = render(view, R)
	assert.equal(R.serialize(node), '<i>first</i>')

	selected.set(Second)
	await nextTick()
	await nextTick()

	assert.equal(R.serialize(node), '<b>second</b>')
	assert.equal(selves.length, 2)
	assert.equal(selves[0], selves[1])
	assert.deepEqual(disposed, ['first'])

	dispose(view)
	assert.deepEqual(disposed, ['first', 'second'])
})

test('Dynamic keeps component construction when current requests a ref', async function () {
	const R = createHTMLRenderer()
	const selected = signal(First)
	const current = signal(null)
	const selves = []

	function First() {
		selves.push(getCurrentSelf())
		return function () {
			return R.c('i', null, 'first')
		}
	}
	function Second() {
		selves.push(getCurrentSelf())
		return function () {
			return R.c('b', null, 'second')
		}
	}

	const view = createComponent(function Root() {
		return Dynamic({ is: selected, current })
	})
	const node = render(view, R)
	const first = current.peek()

	assert.ok(first instanceof Component)
	assert.equal(selves[0], first)

	selected.set(Second)
	await nextTick()
	await nextTick()

	const second = current.peek()
	assert.equal(R.serialize(node), '<b>second</b>')
	assert.ok(second instanceof Component)
	assert.notEqual(second, first)
	assert.equal(selves[1], second)

	dispose(view)
})

test('If true and else aliases honor explicitly provided falsy values', function () {
	const R = createHTMLRenderer()

	const falseAlias = R.c(
		If,
		{ condition: true, true: false },
		function () {
			return 'yes'
		},
		function () {
			return 'no'
		}
	)
	const emptyElse = R.c(
		If,
		{ condition: false, else: '' },
		function () {
			return 'yes'
		},
		function () {
			return 'fallback'
		}
	)

	assert.equal(R.serialize(falseAlias), 'no')
	assert.equal(R.serialize(emptyElse), '')
})

test('For preserves keyed output during mixed insertions and reordering', async function () {
	const R = createHTMLRenderer()
	const entries = signal([{ id: 1 }, { id: 2 }, { id: 3 }])
	const view = createComponent(
		For,
		{ entries, track: 'id' },
		function ({ item }) {
			return R.c('i', null, item.id)
		}
	)
	const node = render(view, R)

	entries.value = [{ id: 4 }, { id: 3 }, { id: 5 }, { id: 1 }]
	await nextTick()

	assert.equal(R.serialize(node), '<i>4</i><i>3</i><i>5</i><i>1</i>')

	dispose(view)
})

test('For invokes item methods in its retained component scope', function () {
	const R = createHTMLRenderer()
	const entries = signal([{ id: 1 }, { id: 2 }])
	const selves = []
	const view = createComponent(
		For,
		{ entries, track: 'id' },
		function ({ item }) {
			selves.push(getCurrentSelf())
			return R.c('i', null, item.id)
		}
	)

	assert.equal(R.serialize(render(view, R)), '<i>1</i><i>2</i>')
	assert.deepEqual(selves, [view, view])

	dispose(view)
})

test('For bulk-disposes populated items without redundant node removals', function () {
	const { R, root, stats } = createInstrumentedTreeRenderer()
	const removeNode = R.removeNode
	let removeAttempts = 0
	let cleanupCount = 0
	R.removeNode = function (...args) {
		removeAttempts += 1
		return removeNode(...args)
	}
	const entries = signal([{ id: 1 }, { id: 2 }])
	const view = createComponent(
		For,
		{ entries, track: 'id' },
		function ({ item }) {
			onDispose(function () {
				cleanupCount += 1
			})
			return R.c('row', null, item.id)
		}
	)
	R.appendNode(root, render(view, R))

	dispose(view)

	assert.equal(cleanupCount, 2)
	assert.equal(stats.clearCalls, 1)
	assert.equal(stats.removeCalls, 0)
	assert.equal(removeAttempts, 0)
	assert.deepEqual(root.children.map(function (node) {
		return node.type
	}), ['anchor', 'anchor'])
})

test('For keeps indexed row effects owned by their detached item scopes', async function () {
	const { R, root } = createInstrumentedTreeRenderer()
	const entries = signal([{ id: 1 }, { id: 2 }])
	const indexes = []
	const seen = []
	const view = createComponent(
		For,
		{ entries, track: 'id', indexed: true },
		function ({ item, index }) {
			indexes.push(index)
			watch(function () {
				seen.push([item.id, index.value])
			})
			return R.c('row', null, item.id)
		}
	)
	R.appendNode(root, render(view, R))

	assert.equal(indexes.length, 2)
	await nextTick()
	assert.deepEqual(seen, [[1, 0], [2, 0], [2, 1]])

	entries.value = [entries.peek()[1], entries.peek()[0]]
	await nextTick()
	assert.deepEqual(seen.slice(0, 3), [[1, 0], [2, 0], [2, 1]])
	assert.deepEqual(seen.slice(3).sort(function (a, b) {
		return a[0] - b[0]
	}), [[1, 1], [2, 0]])

	dispose(view)
	assert.equal(indexes[0].connected, false)
	assert.equal(indexes[1].connected, false)

	const settledCount = seen.length
	indexes[0].value = 3
	await nextTick()
	assert.equal(seen.length, settledCount)
})

test('For bulk-clears an exclusive fragment while disposing every item', async function () {
	const { R, root, stats } = createInstrumentedTreeRenderer()
	const entries = signal([])
	let cleanupCount = 0
	const view = createComponent(
		For,
		{ entries, track: 'id' },
		function ({ item }) {
			onDispose(function () {
				cleanupCount += 1
			})
			return R.c('row', null, item.id)
		}
	)
	const fragment = render(view, R)
	R.appendNode(root, fragment)

	entries.value = [{ id: 1 }, { id: 2 }, { id: 3 }]
	await nextTick()
	assert.equal(root.children.filter(function (node) {
		return node.type === 'node' && node.value === 'row'
	}).length, 3)

	entries.value = []
	await nextTick()

	assert.equal(cleanupCount, 3)
	assert.equal(stats.clearAttempts, 1)
	assert.equal(stats.clearCalls, 1)
	assert.equal(stats.removeCalls, 0)
	assert.deepEqual(root.children.map(function (node) {
		return node.type
	}), ['anchor', 'anchor'])

	dispose(view)
})

test('HTML For can rebuild after an exclusive bulk clear', async function () {
	const R = createHTMLRenderer()
	const entries = signal([])
	let cleanupCount = 0
	const view = createComponent(
		For,
		{ entries, track: 'id' },
		function ({ item }) {
			onDispose(function () {
				cleanupCount += 1
			})
			return R.c('i', null, item.id)
		}
	)
	const fragment = render(view, R)
	const parent = R.c('div', null, fragment)

	entries.value = [{ id: 1 }, { id: 2 }]
	await nextTick()
	assert.equal(R.serialize(parent), '<div><i>1</i><i>2</i></div>')

	entries.value = []
	await nextTick()
	assert.equal(R.serialize(parent), '<div></div>')
	assert.equal(cleanupCount, 2)

	entries.value = [{ id: 3 }]
	await nextTick()
	assert.equal(R.serialize(parent), '<div><i>3</i></div>')

	dispose(view)
	assert.equal(cleanupCount, 3)
})

test('For bulk-clears initially populated items once after the scheduler tick', async function () {
	const { R, root, stats } = createInstrumentedTreeRenderer()
	const entries = signal([{ id: 1 }, { id: 2 }])
	let cleanupCount = 0
	const view = createComponent(
		For,
		{ entries, track: 'id' },
		function ({ item }) {
			onDispose(function () {
				cleanupCount += 1
			})
			return R.c('row', null, item.id)
		}
	)
	R.appendNode(root, render(view, R))

	entries.value = []
	await nextTick()

	assert.equal(cleanupCount, 2)
	assert.equal(stats.clearCalls, 1)
	assert.equal(stats.removeCalls, 0)

	dispose(view)
	assert.equal(cleanupCount, 2)
})

test('For preserves siblings when the fragment cannot be bulk-cleared', async function () {
	const { R, root, stats } = createInstrumentedTreeRenderer()
	const entries = signal([])
	let cleanupCount = 0
	const view = createComponent(
		For,
		{ entries, track: 'id' },
		function ({ item }) {
			onDispose(function () {
				cleanupCount += 1
			})
			return R.c('row', null, item.id)
		}
	)
	const fragment = render(view, R)
	const sibling = R.c('sibling')
	R.appendNode(root, fragment, sibling)

	entries.value = [{ id: 1 }, { id: 2 }, { id: 3 }]
	await nextTick()
	entries.value = []
	await nextTick()

	assert.equal(cleanupCount, 3)
	assert.equal(stats.clearAttempts, 1)
	assert.equal(stats.clearCalls, 0)
	assert.equal(stats.removeCalls, 3)
	assert.equal(sibling.parent, root)

	dispose(view)
})

test('For falls back when a custom renderer has no bulk-clear capability', async function () {
	const { R, root, stats } = createInstrumentedTreeRenderer({
		supportsBulkClear: false
	})
	const entries = signal([])
	const view = createComponent(
		For,
		{ entries, track: 'id' },
		function ({ item }) {
			return R.c('row', null, item.id)
		}
	)
	R.appendNode(root, render(view, R))

	entries.value = [{ id: 1 }, { id: 2 }]
	await nextTick()
	entries.value = []
	await nextTick()

	assert.equal(stats.clearAttempts, 0)
	assert.equal(stats.removeCalls, 2)
	assert.deepEqual(root.children.map(function (node) {
		return node.type
	}), ['anchor', 'anchor'])

	dispose(view)
})
