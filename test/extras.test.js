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
import { createCache, createPortal } from 'refui/extras'
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
