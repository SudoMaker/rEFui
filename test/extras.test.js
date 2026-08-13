import assert from 'node:assert/strict'
import test from 'node:test'

import {
	Component,
	createComponent,
	dispose,
	getCurrentSelf,
	onDispose,
	render,
	signal
} from 'refui'
import {
	Parse,
	UnKeyed,
	createCache,
	createPortal,
	defineCustomElement
} from 'refui/extras'
import { createHTMLRenderer } from 'refui/html'
import { nextTick } from 'refui/signal'

test('createCache can add, update, recycle, and dispose entries', async function () {
	const R = createHTMLRenderer()
	let disposedEntries = 0
	const cache = createCache(function Item({ name }) {
		onDispose(function () {
			disposedEntries += 1
		})
		return function () {
			return R.c('p', null, name)
		}
	})

	cache.add({ name: 'one' })
	const view = createComponent(cache.Cached, {})
	const node = render(view, R)
	assert.equal(R.serialize(node), '<p>one</p>')

	cache.set(0, { name: 'two' })
	await nextTick()
	await nextTick()
	assert.equal(R.serialize(node), '<p>two</p>')

	cache.clear()
	await nextTick()
	assert.equal(R.serialize(node), '')

	cache.add({ name: 'three' })
	await nextTick()
	await nextTick()
	assert.equal(R.serialize(node), '<p>three</p>')

	cache.dispose()
	await nextTick()
	assert.equal(disposedEntries, 3)
	assert.equal(cache.size(), 0)

	cache.add({ name: 'after disposal' })
	cache.replace([{ name: 'also after disposal' }])
	assert.equal(cache.size(), 0)

	dispose(view)
})

test('createCache keeps data and rendered slots aligned through replace and delete', async function () {
	const R = createHTMLRenderer()
	const cache = createCache(function Item({ name }) {
		return function () {
			return R.c('p', null, name)
		}
	})

	cache.add({ name: 'a' }, { name: 'b' })
	const view = createComponent(cache.Cached, {})
	const node = render(view, R)

	cache.replace([{ name: 'c' }, { name: 'd' }, { name: 'e' }])
	await nextTick()
	await nextTick()
	assert.equal(R.serialize(node), '<p>c</p><p>d</p><p>e</p>')
	assert.equal(cache.size(), 3)
	assert.equal(cache.get(1).name, 'd')

	cache.replace([{ name: 'f' }])
	await nextTick()
	await nextTick()
	assert.equal(R.serialize(node), '<p>f</p>')

	cache.add({ name: 'g' })
	await nextTick()
	await nextTick()
	cache.del(0)
	await nextTick()
	assert.equal(R.serialize(node), '<p>g</p>')
	assert.equal(cache.getIndex(function ({ name }) {
		return name === 'g'
	}), 0)

	cache.dispose()
	dispose(view)
})

test('createCache invokes unreferenced templates in the retained slot scope', async function () {
	const R = createHTMLRenderer()
	const selves = []
	const cache = createCache(function Item({ name }) {
		selves.push(getCurrentSelf())
		return function () {
			return R.c('p', null, name)
		}
	})

	cache.add({ name: 'one', $ref: null })
	const view = createComponent(cache.Cached, {})
	const node = render(view, R)

	cache.set(0, { name: 'two', $ref: null })
	await nextTick()
	await nextTick()

	assert.equal(R.serialize(node), '<p>two</p>')
	assert.equal(selves.length, 2)
	assert.equal(selves[0], selves[1])

	cache.dispose()
	dispose(view)
})

test('createCache keeps component construction for a requested ref', async function () {
	const R = createHTMLRenderer()
	const current = signal(null)
	const selves = []
	const cache = createCache(function Item({ name }) {
		selves.push(getCurrentSelf())
		return function () {
			return R.c('p', null, name)
		}
	})

	cache.add({ name: 'one', $ref: current })
	const view = createComponent(cache.Cached, {})
	const node = render(view, R)
	const first = current.peek()

	assert.ok(first instanceof Component)
	assert.equal(selves[0], first)

	cache.set(0, { name: 'two', $ref: current })
	await nextTick()
	await nextTick()

	const second = current.peek()
	assert.equal(R.serialize(node), '<p>two</p>')
	assert.ok(second instanceof Component)
	assert.notEqual(second, first)
	assert.equal(selves[1], second)

	cache.dispose()
	dispose(view)
})

test('Portal Outlet accepts fallback as a prop', function () {
	const R = createHTMLRenderer()
	const [, Outlet] = createPortal()
	const view = createComponent(Outlet, {
		fallback: function () {
			return R.c('i', null, 'empty')
		}
	})

	assert.equal(R.serialize(render(view, R)), '<i>empty</i>')

	dispose(view)
})

test('Parse tracks source reads, exposes append, and swaps signal parsers', async function () {
	const R = createHTMLRenderer()
	const source = signal('one')
	let append
	let firstCalls = 0
	let secondCalls = 0
	function firstParser({ source: input, onAppend }, suffix) {
		firstCalls += 1
		const value = input.value
		onAppend(function (value) {
			append = value
		})
		return function () {
			return R.c('b', null, value, suffix)
		}
	}
	function secondParser({ source: input }) {
		secondCalls += 1
		const value = input.value
		return function () {
			return R.c('i', null, value)
		}
	}
	const parser = signal(firstParser)
	const view = createComponent(Parse, {
		expose(api) {
			api.append('append hook')
		},
		parser,
		source
	}, '!')
	const node = render(view, R)
	assert.equal(R.serialize(node), '<b>one!</b>')
	assert.equal(append, 'append hook')
	assert.equal(firstCalls, 1)

	source.value = 'two'
	await nextTick()
	await nextTick()
	assert.equal(R.serialize(node), '<b>two!</b>')
	assert.equal(firstCalls, 2)
	parser.value = secondParser
	await nextTick()
	await nextTick()
	assert.equal(R.serialize(node), '<i>two</i>')
	assert.equal(secondCalls, 1)

	dispose(view)
})

test('UnKeyed reuses positional item signals while adapting list length', async function () {
	const R = createHTMLRenderer()
	const entries = signal(['one', 'two'])
	const itemSignals = []
	let templates = 0
	const view = createComponent(UnKeyed, { entries }, function ({ item }) {
		templates += 1
		itemSignals.push(item)
		return R.c('p', null, item)
	})
	const node = render(view, R)
	assert.equal(R.serialize(node), '<p>one</p><p>two</p>')
	assert.equal(templates, 2)

	entries.value = ['three', 'four']
	await nextTick()
	assert.equal(R.serialize(node), '<p>three</p><p>four</p>')
	assert.equal(templates, 2)
	assert.equal(itemSignals[0].peek(), 'three')
	entries.value = ['five', 'six', 'seven']
	await nextTick()
	assert.equal(R.serialize(node), '<p>five</p><p>six</p><p>seven</p>')
	assert.equal(templates, 3)
	entries.value = ['last']
	await nextTick()
	assert.equal(R.serialize(node), '<p>last</p>')
	dispose(view)
})

test('portal inlets stream into outlets, switch renderers, and restore fallback on disposal', async function () {
	const R = createHTMLRenderer()
	const [Inlet, Outlet] = createPortal()
	const itemRenderer = signal(function ({ item }) {
		return R.c('section', null, item)
	})
	const outlet = createComponent(Outlet, {
		fallback() {
			return R.c('i', null, 'empty')
		},
		itemRenderer
	})
	const node = render(outlet, R)
	assert.equal(R.serialize(node), '<i>empty</i>')

	const first = createComponent(Inlet, {}, R.c('b', null, 'one'))
	const second = createComponent(Inlet, {}, R.c('u', null, 'two'))
	await nextTick()
	await nextTick()
	assert.equal(
		R.serialize(node),
		'<section><b>one</b></section><section><u>two</u></section>'
	)

	itemRenderer.value = function ({ item }) {
		return R.c('article', null, item)
	}
	await nextTick()
	await nextTick()
	assert.equal(
		R.serialize(node),
		'<article><b>one</b></article><article><u>two</u></article>'
	)
	dispose(first)
	await nextTick()
	assert.equal(R.serialize(node), '<article><u>two</u></article>')
	dispose(second)
	await nextTick()
	await nextTick()
	assert.equal(R.serialize(node), '<i>empty</i>')
	dispose(outlet)
})

test('createCache handles empty and invalid operations and exposes its rendered-node cache', function () {
	const R = createHTMLRenderer()
	const cache = createCache(function Item({ name }) {
		return function () {
			return R.c('b', null, name)
		}
	})
	cache.add()
	cache.clear()
	cache.set(2, { name: 'missing' })
	cache.del(2)
	assert.equal(cache.size(), 0)
	assert.equal(cache.get(0), undefined)
	assert.equal(cache.getIndex(function () { return true }), -1)

	cache.add({ name: 'one' })
	let exposed
	const view = createComponent(cache.Cached, {
		expose(api) {
			exposed = api.cache
		}
	})
	assert.equal(R.serialize(render(view, R)), '<b>one</b>')
	assert.ok(exposed instanceof WeakMap)
	cache.dispose()
	cache.dispose()
	dispose(view)
})

test('defineCustomElement wires attributes, slots, styles, render, and disconnect lifecycle', async function () {
	const R = createHTMLRenderer()
	const definitions = []
	const originalCustomElements = globalThis.customElements
	const originalStyleSheet = globalThis.CSSStyleSheet
	class TestStyleSheet {
		constructor() {
			this.text = null
		}
		replace(text) {
			this.text = text
			return Promise.resolve(this)
		}
	}
	class TestElement {
		attachInternals() {
			return { role: 'internals' }
		}
		attachShadow(options) {
			this.shadowOptions = options
			return R.c('shadow-root')
		}
	}
	globalThis.CSSStyleSheet = TestStyleSheet
	globalThis.customElements = {
		define(...args) {
			definitions.push(args)
		}
	}

	try {
		const externalSheet = { external: true }
		let receivedProps
		function CustomView(props, defaultSlot) {
			receivedProps = props
			return function () {
				return R.c('div', null, props.title, props.header, defaultSlot)
			}
		}
		const CustomElement = defineCustomElement.call(R, 'x-refui-test', CustomView, {
			attrs: ['title'],
			base: TestElement,
			cssText: ':host { display: block }',
			extends: 'section',
			mode: 'closed',
			slots: ['header'],
			styleSheets: [externalSheet]
		})
		assert.equal(CustomElement.observedAttributes[0], 'title')
		assert.deepEqual(definitions[0], ['x-refui-test', CustomElement, { extends: 'section' }])

		const element = new CustomElement()
		assert.deepEqual(element.shadowOptions, { mode: 'closed' })
		const state = element.__refui_custom_element_state
		assert.equal(state.shadowRoot.adoptedStyleSheets[0], externalSheet)
		assert.equal(state.shadowRoot.adoptedStyleSheets[1].text, ':host { display: block }')
		assert.equal(element.title, undefined)
		element.attributeChangedCallback('title', null, 'hello')
		assert.equal(element.title, 'hello')
		element.connectedCallback()
		assert.equal(receivedProps.title.peek(), 'hello')
		assert.equal(receivedProps.$$.container, element)
		assert.equal(
			R.serialize(state.shadowRoot),
			'<shadow-root><div>hello<slot name="header"></slot><slot></slot></div></shadow-root>'
		)
		element.title = 'updated'
		await nextTick()
		assert.equal(
			R.serialize(state.shadowRoot),
			'<shadow-root><div>updated<slot name="header"></slot><slot></slot></div></shadow-root>'
		)
		element.connectedMoveCallback()
		element.disconnectedCallback()
		assert.equal(state.instance, null)
	} finally {
		if (originalCustomElements === undefined) delete globalThis.customElements
		else globalThis.customElements = originalCustomElements
		if (originalStyleSheet === undefined) delete globalThis.CSSStyleSheet
		else globalThis.CSSStyleSheet = originalStyleSheet
	}
})
