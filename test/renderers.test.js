import assert from 'node:assert/strict'
import test from 'node:test'

import { Async, createComponent, dispose, render } from 'refui/components'
import { createDOMRenderer } from 'refui/dom'
import { createHTMLRenderer } from 'refui/html'
import { createRenderer } from 'refui/renderer'
import devRuntime from 'refui/jsx-dev-runtime'
import runtime from 'refui/jsx-runtime'
import { R as Reflow, isNode as isReflowNode, markNode } from 'refui/reflow'
import { nextTick, signal, watch } from 'refui/signal'

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

test('Async stays inert when its future resolves after owner disposal', async function () {
	const R = createHTMLRenderer()
	let resolve
	let renderCount = 0
	const future = new Promise(function (done) {
		resolve = done
	})
	const view = createComponent(function View() {
		return function () {
			return R.c(Async, { future }, function ({ result }) {
				renderCount += 1
				return R.c('b', null, result)
			})
		}
	})

	render(view, R)
	dispose(view)
	resolve('done')
	await nextTick()
	await nextTick()

	assert.equal(renderCount, 0)
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

test('HTML renderer escapes text, comments, attributes, and supports raw HTML and self-closing expansion', async function () {
	const R = createHTMLRenderer()
	const text = signal('<unsafe & text>')
	const title = signal('"quoted"')
	const rawValue = signal('<b>raw</b>')
	let anchor
	const node = R.c('div', { title },
		text,
		R.nodeOps.rawHTML`<section>${rawValue}</section>`,
		R.c('input', null, 'child')
	)
	anchor = R.nodeOps.createAnchor('<debug>', true)
	R.appendNode(node, anchor)
	assert.equal(
		R.serialize(node),
		'<div title="&quot;quoted&quot;">&lt;unsafe &amp; text&gt;<section><b>raw</b></section><input>child</input><![[debug]]></div>'
	)

	text.value = 'updated'
	title.value = false
	rawValue.value = '<i>next</i>'
	await nextTick()
	assert.equal(
		R.serialize(node),
		'<div>updated<section><i>next</i></section><input>child</input><![[debug]]></div>'
	)
	assert.doesNotThrow(function () {
		R.nodeOps.insertBefore(R.c('b'), R.c('i'))
	})
})

test('renderer normalizes primitives, nested arrays, objects, functions, signals, and promises', async function () {
	const R = createHTMLRenderer()
	const value = signal('signal')
	const circular = {}
	circular.self = circular
	const children = R.normalizeChildren([
		'a', 1, true,
		null, undefined,
		['b', function () { return function () { return 'c' } }],
		{ key: 'value' }, circular,
		value,
		Promise.resolve('later')
	])
	const node = R.c('div', null, children)
	assert.match(
		R.serialize(node),
		/^<div>a1truebc\{&quot;key&quot;:&quot;value&quot;\}\[object Object\]signal/
	)
	await nextTick()
	await nextTick()
	assert.match(R.serialize(node), /later<\/div>$/)
	value.value = 'changed'
	await nextTick()
	assert.match(R.serialize(node), /changedlater<\/div>$/)

	assert.equal(R.ensureElement([]), null)
	assert.equal(R.serialize(R.ensureElement(['one'])), 'one')
	assert.equal(R.serialize(R.ensureElement(['one', 'two'])), 'onetwo')
})

test('renderer handles host, component, promise, static ref, and render target creation paths', async function () {
	const R = createHTMLRenderer()
	let hostRef
	const host = R.c('b', { $ref(value) { hostRef = value }, children: 'metadata' }, 'body')
	assert.equal(hostRef, host)
	assert.equal(R.serialize(host), '<b>body</b>')

	function View({ label }) {
		return function () {
			return R.c('i', null, label)
		}
	}
	const componentRef = signal(null)
	const componentNode = R.c(View, { $ref: componentRef, label: 'component' })
	assert.equal(R.serialize(componentNode), '<i>component</i>')
	assert.ok(componentRef.peek())

	const promiseNode = R.c(Promise.resolve(function () {
		return R.c('u', null, 'promise')
	}))
	await nextTick()
	await nextTick()
	assert.equal(R.serialize(promiseNode), '<u>promise</u>')

	const target = R.c('div')
	const instance = R.render(target, View, { label: 'target' })
	assert.equal(R.serialize(target), '<div><i>target</i></div>')
	dispose(instance)
	dispose(componentRef.peek())
})

test('production JSX runtime handles keyed, singular, plural, absent children, and fragment wrapping', function () {
	const calls = []
	const renderer = {
		c(...args) {
			calls.push(args)
			return 'node'
		},
		f: 'fragment',
		isNode(value) {
			return value === calls
		}
	}
	const wrapped = runtime.wrap(renderer)
	assert.equal(wrapped.Fragment, 'fragment')
	assert.equal(wrapped.jsx('one', { children: 'child' }, 'key'), 'node')
	assert.equal(wrapped.jsx('many', { children: ['a', 'b'] }), 'node')
	assert.equal(wrapped.jsx('node-array', { children: calls }), 'node')
	assert.equal(wrapped.jsx('none', {}), 'node')
	assert.equal(wrapped.jsxs('plural', { children: ['x', 'y'] }, 0), 'node')
	assert.deepEqual(calls, [
		['one', { children: 'child', key: 'key' }, 'child'],
		['many', { children: ['a', 'b'] }, 'a', 'b'],
		['node-array', { children: calls }, calls],
		['none', {}],
		['plural', { children: ['x', 'y'], key: 0 }, 'x', 'y']
	])
	assert.equal(runtime.default, runtime)
	assert.equal(runtime.Fragment, 'fragment')
})

test('development JSX runtime logs source information and rethrows renderer failures', function () {
	const originalError = console.error
	const errors = []
	const expected = new Error('expected renderer failure')
	const renderer = {
		c() {
			throw expected
		},
		f: 'fragment',
		isNode() {
			return false
		}
	}
	const wrapped = devRuntime.wrap(renderer)
	console.error = function (...args) {
		errors.push(args)
	}
	try {
		assert.throws(function () {
			wrapped.jsxDEV(function Broken() {}, {}, null, false, {
				columnNumber: 3,
				fileName: 'view.jsx',
				lineNumber: 2
			})
		}, expected)
	} finally {
		console.error = originalError
	}
	assert.match(errors[0][0], /<Broken>.*view\.jsx:2:3/s)
	assert.equal(devRuntime.default, devRuntime)
})

function createRecordingDocument({ supportsOptions = true } = {}) {
	class RecordingNode {
		constructor(type, name, value = '') {
			this.attributes = new Map()
			this.childNodes = []
			this.data = value
			this.listeners = new Map()
			this.name = name
			this.nodeType = type
			this.parentNode = null
		}
		cloneNode() {
			return new RecordingNode(this.nodeType, this.name, this.data)
		}
		get firstChild() {
			return this.childNodes[0] || null
		}
		get lastChild() {
			return this.childNodes[this.childNodes.length - 1] || null
		}
		set textContent(value) {
			this.childNodes.length = 0
			this.data = String(value)
		}
		insertBefore(node, reference) {
			node.parentNode?.removeChild(node)
			const index = reference === null ? this.childNodes.length : this.childNodes.indexOf(reference)
			this.childNodes.splice(index, 0, node)
			node.parentNode = this
			return node
		}
		removeChild(node) {
			const index = this.childNodes.indexOf(node)
			if (index > -1) this.childNodes.splice(index, 1)
			node.parentNode = null
		}
		setAttribute(name, value) {
			this.attributes.set(name, String(value))
		}
		removeAttribute(name) {
			this.attributes.delete(name)
		}
		setAttributeNS(namespace, name, value) {
			this.attributes.set(`${namespace}:${name}`, String(value))
		}
		removeAttributeNS(namespace, name) {
			this.attributes.delete(`${namespace}:${name}`)
		}
		addEventListener(name, handler, options) {
			if (name === '__refui_event_option_test__' && supportsOptions) {
				options.passive
				options.once
			}
			this.listeners.set(name, { handler, options })
		}
		removeEventListener(name, handler) {
			const current = this.listeners.get(name)
			if (current?.handler === handler || name === '__refui_event_option_test__') {
				this.listeners.delete(name)
			}
		}
		dispatch(name, event = { type: name }) {
			this.listeners.get(name)?.handler(event)
		}
	}
	const doc = new RecordingNode(9, '#document')
	doc.created = []
	doc.createElement = function (name) {
		const node = new RecordingNode(1, name)
		doc.created.push(['html', name, node])
		return node
	}
	doc.createElementNS = function (namespace, name) {
		const node = new RecordingNode(1, name)
		node.namespace = namespace
		doc.created.push(['ns', name, node])
		return node
	}
	doc.createTextNode = function (value) {
		return new RecordingNode(3, '#text', String(value))
	}
	doc.createComment = function (value) {
		return new RecordingNode(8, '#comment', String(value))
	}
	doc.createDocumentFragment = function () {
		throw new Error('fragment behavior is outside this recording document contract')
	}
	return doc
}

test('DOM renderer applies aliases, namespaces, directives, macros, reactive props, text, and listeners', async function () {
	const doc = createRecordingDocument()
	const directives = []
	const R = createDOMRenderer({
		doc,
		macros: {
			focus(node, value) {
				node.focused = value
			}
		},
		namespaces: { svg: 'urn:svg', xlink: 'urn:xlink' },
		onDirective(prefix, key) {
			directives.push([prefix, key])
			if (prefix === 'custom') {
				return function (node, value) {
					node.custom = value
				}
			}
		},
		propAliases: { class: 'attr:class' },
		tagAliases: { icon: 'use' },
		tagNamespaceMap: { icon: 'svg' }
	})
	const title = signal('one')
	const text = signal('text')
	const handlerCalls = []
	const handler = signal(function (event) { handlerCalls.push(['first', event.type]) })
	const node = R.c('icon', {
		'attr:data-id': title,
		class: 'icon',
		'custom:value': 3,
		'm:focus': true,
		'on:click': handler,
		'prop:value': title,
		'xlink:href': '#icon'
	}, text)
	assert.equal(node.name, 'use')
	assert.equal(node.namespace, 'urn:svg')
	assert.equal(node.attributes.get('class'), 'icon')
	assert.equal(node.attributes.get('data-id'), 'one')
	assert.equal(node.attributes.get('urn:xlink:href'), '#icon')
	assert.equal(node.custom, 3)
	assert.equal(node.focused, true)
	assert.equal(node.value, 'one')
	assert.equal(node.firstChild.data, 'text')
	assert.deepEqual(directives, [['custom', 'value'], ['xlink', 'href']])
	node.dispatch('click')
	assert.deepEqual(handlerCalls, [['first', 'click']])

	handler.value = function (event) { handlerCalls.push(['second', event.type]) }
	title.value = false
	text.value = 'updated'
	await nextTick()
	assert.equal(node.attributes.has('data-id'), false)
	assert.equal(node.value, false)
	assert.equal(node.firstChild.data, 'updated')
	node.dispatch('click')
	assert.deepEqual(handlerCalls.at(-1), ['second', 'click'])

	R.nodeOps.useMacro({
		name: 'mark',
		handler(target, value) {
			target.marked = value
		}
	})
	const marked = R.c('div', { 'm:mark': 5 })
	assert.equal(marked.marked, 5)
})

test('DOM renderer provides once and passive event fallbacks when option detection is unavailable', async function () {
	const doc = createRecordingDocument({ supportsOptions: false })
	const R = createDOMRenderer({ doc })
	const calls = []
	const node = R.c('button', {
		'on-once:click': function () { calls.push('once') },
		'on-passive:scroll': function () { calls.push('passive') }
	})
	node.dispatch('click')
	node.dispatch('click')
	assert.deepEqual(calls, ['once'])
	node.dispatch('scroll')
	assert.deepEqual(calls, ['once'])
	await nextTick()
	assert.deepEqual(calls, ['once', 'passive'])
})

test('Reflow marks abstract nodes and preserves component and async props until renderer resolution', async function () {
	const R = createHTMLRenderer()
	function View({ label }) {
		return function () {
			return R.c('b', null, label)
		}
	}
	const abstract = Reflow.c(View, { label: 'reflow' })
	assert.equal(typeof abstract, 'function')
	assert.equal(R.serialize(R.ensureElement(abstract)), '<b>reflow</b>')
	const marked = []
	assert.equal(isReflowNode(marked), false)
	markNode(marked)
	assert.equal(isReflowNode(marked), true)

	let resolve
	const asyncAbstract = Reflow.c(function AsyncView({ label }) {
		return new Promise(function (done) {
			resolve = function () {
				done(function () { return R.c('i', null, label) })
			}
		})
	}, { label: 'async', suspensed: false })
	const view = createComponent(function Root() {
		return asyncAbstract
	})
	const node = render(view, R)
	resolve()
	await nextTick()
	await nextTick()
	assert.equal(R.serialize(node), '<i>async</i>')
	dispose(view)
})
