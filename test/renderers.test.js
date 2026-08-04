import assert from 'node:assert/strict'
import test from 'node:test'

import { createComponent, dispose, render } from 'refui/components'
import { createHTMLRenderer } from 'refui/html'
import { createRenderer } from 'refui/renderer'
import devRuntime from 'refui/jsx-dev-runtime'
import { R as Reflow } from 'refui/reflow'
import { nextTick, signal } from 'refui/signal'

test('HTML serialization omits false boolean attributes and event directives', async function () {
	const R = createHTMLRenderer()
	const checked = signal(true)
	const view = createComponent(function Input() {
		return function () {
			return R.c('input', {
				disabled: false,
				checked,
				'on-once:click': function () {}
			})
		}
	})
	const node = render(view, R)

	assert.equal(R.serialize(node), '<input checked/>')

	checked.value = false
	await nextTick()

	assert.equal(R.serialize(node), '<input/>')
	dispose(view)
})

test('HTML fragment removal stays detached after the scheduler flushes', async function () {
	const R = createHTMLRenderer()
	const fragment = R.createFragment('test')
	R.appendNode(fragment, R.c('b', null, 'ok'))
	const parent = R.c('div', null, fragment)

	R.removeNode(fragment)
	await nextTick()

	assert.equal(R.serialize(parent), '<div></div>')
})

test('HTML fragments keep their children when moved after a batched append', function () {
	const R = createHTMLRenderer()
	const inner = R.createFragment('inner')
	R.appendNode(inner, R.c('b', null, 'one'), R.c('i', null, 'two'))
	const outer = R.createFragment('outer')
	R.appendNode(outer, R.c('u', null, 'before'), inner, R.c('em', null, 'after'))
	const firstParent = R.c('div', null, outer)
	const secondParent = R.c('section')

	assert.equal(
		R.serialize(firstParent),
		'<div><u>before</u><b>one</b><i>two</i><em>after</em></div>'
	)

	R.appendNode(secondParent, inner)

	assert.equal(R.serialize(firstParent), '<div><u>before</u><em>after</em></div>')
	assert.equal(R.serialize(secondParent), '<section><b>one</b><i>two</i></section>')
})

test('HTML host operations reparent ordinary nodes', function () {
	const R = createHTMLRenderer()
	const one = R.c('b', null, 'one')
	const two = R.c('i', null, 'two')
	const three = R.c('u', null, 'three')
	const first = R.c('div', null, one, two, three)
	const second = R.c('section')

	R.insertBefore(three, one)
	R.appendNode(second, one)

	assert.equal(R.serialize(first), '<div><u>three</u><i>two</i></div>')
	assert.equal(R.serialize(second), '<section><b>one</b></section>')
})

test('HTML fragments inserted before ordinary nodes retain their semantic parent', function () {
	const R = createHTMLRenderer()
	const fragment = R.createFragment('fragment')
	R.appendNode(fragment, R.c('b', null, 'fragment child'))
	const sibling = R.c('i', null, 'sibling')
	const parent = R.c('div', null, sibling)
	const siblingParent = R.c('section')

	R.insertBefore(fragment, sibling)
	R.appendNode(siblingParent, sibling)

	assert.equal(R.clearFragment(fragment), true)
	assert.equal(R.serialize(parent), '<div></div>')
	assert.equal(R.serialize(siblingParent), '<section><i>sibling</i></section>')
})

test('element renderer metadata is not forwarded as host props', function () {
	const HTML = createHTMLRenderer()
	let receivedProps
	const R = createRenderer({
		...HTML.nodeOps,
		setProps(node, props) {
			receivedProps = props
			HTML.nodeOps.setProps(node, props)
		}
	})
	const ordinaryProps = { id: 'ordinary' }
	R.c('span', ordinaryProps)
	assert.equal(receivedProps, ordinaryProps)
	const inheritedProps = Object.assign(Object.create({ title: 'inherited' }), { id: 'own' })
	R.c('span', inheritedProps)
	assert.notEqual(receivedProps, inheritedProps)
	assert.deepEqual(receivedProps, { id: 'own' })

	let referenced
	const metadataProps = {
		$ref(value) {
			referenced = value
		},
		children: 'metadata only',
		id: 'view'
	}
	const node = R.c('div', metadataProps, 'body')

	assert.notEqual(receivedProps, metadataProps)
	assert.deepEqual(receivedProps, { id: 'view' })
	assert.equal(referenced, node)
	assert.equal(R.serialize(node), '<div id="view">body</div>')
})

test('bulk-cleared fragment descendants are reused without detached host removals', function () {
	const HTML = createHTMLRenderer()
	let detachedRemoveAttempts = 0
	const R = createRenderer({
		...HTML.nodeOps,
		removeNode(node) {
			if (!node.parent) detachedRemoveAttempts += 1
			HTML.nodeOps.removeNode(node)
		}
	})
	const fragment = R.createFragment('outer')
	const nestedFragment = R.createFragment('inner')
	const directChild = R.c('b', null, 'direct')
	const nestedChild = R.c('i', null, 'nested')
	const staleReference = R.c('u', null, 'stale')
	R.appendNode(nestedFragment, nestedChild)
	R.appendNode(fragment, directChild, nestedFragment, staleReference)
	const oldParent = R.c('div', null, fragment)

	assert.equal(R.clearFragment(fragment), true)

	const newParent = R.c('section')
	R.appendNode(newParent, directChild, nestedChild)
	const inserted = R.c('em', null, 'inserted')
	R.insertBefore(inserted, staleReference)
	R.appendNode(newParent, inserted)

	assert.equal(R.serialize(oldParent), '<div></div>')
	assert.equal(
		R.serialize(newParent),
		'<section><b>direct</b><i>nested</i><em>inserted</em></section>'
	)
	assert.equal(detachedRemoveAttempts, 0)
})

test('single empty-string children remain omitted during normalization', function () {
	const R = createHTMLRenderer()

	assert.deepEqual(R.normalizeChildren(['']), [])
})

test('the development JSX runtime uses the renderer supplied to wrap', function () {
	const calls = []
	const renderer = {
		c(...args) {
			calls.push(args)
			return 'custom node'
		},
		f: 'custom fragment',
		isNode() {
			return false
		}
	}
	const wrapped = devRuntime.wrap(renderer)

	assert.equal(wrapped.jsxDEV('x', { children: 'y' }), 'custom node')
	assert.deepEqual(calls, [['x', { children: 'y' }, 'y']])
	assert.equal(wrapped.Fragment, 'custom fragment')
})

test('Reflow accepts async components without props', function () {
	assert.doesNotThrow(function () {
		Reflow.c(async function AsyncComponent() {
			return function () {
				return 'ok'
			}
		}, null)
	})
})

test('Reflow forwards ordinary props to an async fallback', async function () {
	const R = createHTMLRenderer()
	let resolve
	const abstract = Reflow.c(
		function AsyncComponent() {
			return new Promise(function (done) {
				resolve = done
			})
		},
		{
			label: 'loading',
			fallback: function ({ label }) {
				return function () {
					return R.c('i', null, label)
				}
			}
		}
	)
	const view = createComponent(function View() {
		return abstract
	})
	const node = render(view, R)

	await nextTick()
	assert.equal(R.serialize(node), '<i>loading</i>')

	resolve(function () {
		return R.c('b', null, 'done')
	})
	await nextTick()
	dispose(view)
})
