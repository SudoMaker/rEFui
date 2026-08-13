import assert from 'node:assert/strict'
import test from 'node:test'

import {
	KEY_HMRWRAP,
	KEY_HMRWRAPPED,
	enableHMR,
	hotEnabled,
	setup
} from 'refui/hmr'
import { isSignal, nextTick, signal } from 'refui/signal'
import {
	cached,
	cachedStrKeyNoFalsy,
	emptyArr,
	isPrimitive,
	isStatic,
	isThenable,
	markStatic,
	nop,
	nullRefObject,
	removeFromArr,
	splitFirst
} from 'refui/utils'

test('public utility helpers preserve caching, classification, splitting, removal, and static markers', function () {
	assert.equal(nop(), undefined)
	assert.deepEqual(nullRefObject, { $ref: null })
	assert.deepEqual(emptyArr, [])

	let cachedCalls = 0
	const lookup = cached(function (key) {
		cachedCalls += 1
		return key ? 0 : false
	})
	assert.equal(lookup('key'), 0)
	assert.equal(lookup('key'), 0)
	assert.equal(lookup(''), false)
	assert.equal(lookup(''), false)
	assert.equal(cachedCalls, 2)

	let stringCalls = 0
	const stringLookup = cachedStrKeyNoFalsy(function (key) {
		stringCalls += 1
		return key === 'truthy' ? 'value' : 0
	})
	assert.equal(stringLookup('truthy'), 'value')
	assert.equal(stringLookup('truthy'), 'value')
	assert.equal(stringLookup('falsy'), 0)
	assert.equal(stringLookup('falsy'), 0)
	assert.equal(stringCalls, 3)

	const values = [1, 2, 3]
	removeFromArr(values, 2)
	removeFromArr(values, 9)
	assert.deepEqual(values, [1, 3])
	assert.equal(isPrimitive(null), true)
	assert.equal(isPrimitive('text'), true)
	assert.equal(isPrimitive({}), false)
	assert.equal(isThenable(Promise.resolve()), Function.prototype.call)
	assert.equal(isThenable(null), null)
	assert.deepEqual(splitFirst('prefix:value:rest', ':'), ['prefix', 'value:rest'])
	assert.deepEqual(splitFirst('plain', ':'), ['plain'])

	function View() {}
	assert.equal(isStatic(View), false)
	assert.equal(markStatic(View), View)
	assert.equal(isStatic(View), true)
})

test('enableHMR reuses component wrappers and leaves static and non-function templates raw', function () {
	const originalInfo = console.info
	const originalError = console.error
	const info = []
	const errors = []
	const instances = []
	const rawCalls = []
	class FakeComponent {
		constructor(...args) {
			this.args = args
			instances.push(this)
		}
	}
	console.info = function (...args) { info.push(args) }
	console.error = function (...args) { errors.push(args) }
	try {
		const create = enableHMR({
			Component: FakeComponent,
			createComponentRaw(...args) {
				rawCalls.push(args)
				return { raw: args }
			},
			makeDyn(component, handleError) {
				return { component, handleError }
			}
		})
		function View() { return 'view' }
		const first = create(View, null, 'child')
		const wrapper = View[KEY_HMRWRAP]
		assert.ok(isSignal(wrapper))
		assert.equal(wrapper.name, 'View')
		assert.equal(wrapper.hot, false)
		assert.equal(first, instances[0])
		assert.equal(first.args[0].component, wrapper)
		assert.deepEqual(first.args.slice(1), [{}, 'child'])

		const second = create(View, { value: 1 })
		assert.equal(second.args[0].component, wrapper)
		assert.equal(View[KEY_HMRWRAPPED], undefined)
		assert.equal(wrapper.peek()[KEY_HMRWRAPPED], true)
		const expected = new Error('cold failure')
		assert.throws(function () {
			first.args[0].handleError(expected, null, { hot: false, name: 'View' })
		}, expected)
		first.args[0].handleError(expected, null, { hot: true, name: 'View' })
		assert.match(errors[0][0], /<View>/)

		function StaticView() {}
		markStatic(StaticView)
		assert.deepEqual(create(StaticView, { static: true }), {
			raw: [StaticView, { static: true }]
		})
		assert.deepEqual(create('div', null), { raw: ['div', null] })
		assert.equal(info.length, 1)
		assert.equal(rawCalls.length, 2)
	} finally {
		console.info = originalInfo
		console.error = originalError
	}
})

test('HMR setup carries module state, updates component wrappers, and invalidates changed ordinary exports', async function () {
	const originalInfo = console.info
	console.info = function () {}
	try {
		const create = enableHMR({
			Component: class FakeComponent {
				constructor(...args) { this.args = args }
			},
			createComponentRaw() {},
			makeDyn(component) { return component }
		})
		function OldComponent() { return 'old' }
		create(OldComponent)
		const wrapper = OldComponent[KEY_HMRWRAP]

		const data = {}
		let disposeHandler
		let accepted = 0
		const oldModule = Promise.resolve({ OldComponent })
		setup({
			accept() { accepted += 1 },
			current: oldModule,
			data,
			dispose(handler) { disposeHandler = handler },
			invalidate() { throw new Error('unexpected invalidation') }
		})
		disposeHandler(data)
		assert.equal(data[KEY_HMRWRAP], oldModule)

		function UpdatedComponent() { return 'updated' }
		setup({
			accept() { accepted += 1 },
			current: Promise.resolve({ OldComponent: UpdatedComponent }),
			data,
			dispose() {},
			invalidate() { throw new Error('unexpected invalidation') }
		})
		await Promise.resolve()
		await Promise.resolve()
		assert.equal(wrapper.hot, true)
		assert.equal(UpdatedComponent[KEY_HMRWRAP], wrapper)
		assert.equal(wrapper.peek()(), 'updated')
		assert.equal(accepted, 2)

		const invalidations = []
		setup({
			accept() {},
			current: Promise.resolve({ version: 2 }),
			data: { [KEY_HMRWRAP]: Promise.resolve({ version: 1 }) },
			dispose() {},
			invalidate(reason) { invalidations.push(reason) }
		})
		await Promise.resolve()
		await Promise.resolve()
		assert.deepEqual(invalidations, ['[rEFui HMR] Non HMR-able export "version" changed.'])
		assert.equal(typeof hotEnabled, 'boolean')
	} finally {
		console.info = originalInfo
	}
})

test('browser preset exports namespace maps, aliases, and reactive class and style directives', async function () {
	const originalDocument = globalThis.document
	const fakeDocument = { name: 'preset document' }
	globalThis.document = fakeDocument
	try {
		const browser = await import(new URL('../src/presets/browser.js?test', import.meta.url))
		assert.equal(browser.defaults.doc, fakeDocument)
		assert.equal(browser.namespaces.svg, 'http://www.w3.org/2000/svg')
		assert.equal(browser.tagNamespaceMap.path, 'svg')
		assert.equal(browser.propAliases.class, 'attr:class')
		assert.deepEqual(browser.tagAliases, {})

		const classes = new Set()
		const node = {
			classList: {
				add(value) { classes.add(value) },
				remove(value) { classes.delete(value) }
			},
			style: {}
		}
		const active = signal(true)
		const color = signal('red')
		browser.directives.class('active')(node, active)
		browser.directives.style('color')(node, color)
		await nextTick()
		assert.equal(classes.has('active'), true)
		assert.equal(node.style.color, 'red')

		active.value = false
		color.value = null
		await nextTick()
		await nextTick()
		assert.equal(classes.has('active'), false)
		assert.equal(node.style.color, 'unset')
		assert.equal(browser.defaults.onDirective('unknown', 'x'), undefined)
	} finally {
		if (originalDocument === undefined) delete globalThis.document
		else globalThis.document = originalDocument
	}
})
