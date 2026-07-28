import assert from 'node:assert/strict'
import test from 'node:test'

import {
	Component,
	Dynamic,
	Fn,
	For,
	If,
	Render,
	createComponent,
	dispose,
	getCurrentSelf,
	render
} from 'refui/components'
import { createHTMLRenderer } from 'refui/html'
import { createRenderer } from 'refui/renderer'
import { nextTick, onDispose, signal } from 'refui/signal'

function createInstrumentedTreeRenderer({ supportsBulkClear = true } = {}) {
	const stats = {
		clearAttempts: 0,
		clearCalls: 0,
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
	if (!supportsBulkClear) delete nodeOps.clearChildren
	const R = createRenderer(nodeOps)

	return {
		R,
		root: createHost('root'),
		stats
	}
}

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
