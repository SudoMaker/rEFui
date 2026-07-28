import assert from 'node:assert/strict'
import test from 'node:test'

import { memo } from 'refui/components'
import { collectDisposers, derive, nextTick, onCondition, onDispose, signal, watch } from 'refui/signal'
import { cached } from 'refui/utils'

test('a signal reports live connections accurately', function () {
	const value = signal(1)

	assert.equal(value.connected, false)

	const disposeEffect = watch(function () {
		value.value
	})
	assert.equal(value.connected, true)

	disposeEffect()
	assert.equal(value.connected, false)
})

test('a signal leaves unused effect stores unallocated', function () {
	const value = signal(1)

	assert.equal(value._.userEffects, null)
	assert.equal(value._.signalEffects, null)

	const disposeUser = watch(function () {
		value.value
	})

	assert.ok(value._.userEffects)
	assert.equal(value._.signalEffects, null)

	disposeUser()

	let mirrored
	const disposePure = collectDisposers([], function () {
		mirrored = signal(value)
	})

	assert.ok(value._.signalEffects)
	assert.equal(mirrored.peek(), 1)

	disposePure()
})

test('user and signal effects remain independently connected and disposable', async function () {
	const source = signal(1)
	let mirrored
	let userRuns = 0

	const disposePure = collectDisposers([], function () {
		mirrored = signal(source)
	})
	const disposeUser = collectDisposers([], function () {
		watch(function () {
			source.value
			userRuns += 1
		})
	})

	source.value = 2
	await nextTick()

	assert.equal(mirrored.peek(), 2)
	assert.equal(userRuns, 2)

	disposeUser()
	source.value = 3
	await nextTick()

	assert.equal(mirrored.peek(), 3)
	assert.equal(userRuns, 2)
	assert.equal(source.connected, true)

	disposePure()
	assert.equal(source.connected, false)
})

test('memo caches falsy results', function () {
	let calls = 0
	const once = memo(function () {
		calls += 1
		return 0
	})

	assert.equal(once(), 0)
	assert.equal(once(), 0)
	assert.equal(calls, 1)
})

test('cached caches falsy results', function () {
	let calls = 0
	const lookup = cached(function () {
		calls += 1
		return false
	})

	assert.equal(lookup('key'), false)
	assert.equal(lookup('key'), false)
	assert.equal(calls, 1)
})

test('a watch that throws releases partial subscriptions', async function () {
	const source = signal(1)
	let calls = 0

	assert.throws(function () {
		watch(function brokenEffect() {
			source.value
			calls += 1
			throw new Error('expected setup failure')
		})
	}, /expected setup failure/)

	source.value = 2
	await nextTick()

	assert.equal(calls, 1)
})

test('a disposer scope that throws releases partial subscriptions and cleanup callbacks', async function () {
	const source = signal(1)
	let reactions = 0
	let cleanups = 0

	assert.throws(function () {
		collectDisposers([], function brokenScope() {
			source.connect(function () {
				reactions += 1
			}, false)
			onDispose(function () {
				cleanups += 1
			})
			throw new Error('expected scope failure')
		})
	}, /expected scope failure/)

	source.value = 2
	await nextTick()

	assert.equal(reactions, 0)
	assert.equal(cleanups, 1)
})

test('an explicitly disposed child scope detaches from its parent scope', function () {
	let disposeChild
	let childCleanupCalls = 0
	const disposeParent = collectDisposers([], function () {
		disposeChild = collectDisposers([], function () {}, function () {
			childCleanupCalls += 1
		})
	})

	disposeChild()
	assert.equal(childCleanupCalls, 1)

	disposeParent()
	assert.equal(childCleanupCalls, 1)
})

test('a disposer keeps cleanup ordering and batch flags intact', function () {
	const calls = []
	const disposeScope = collectDisposers(
		[],
		function () {
			onDispose(function (batch) {
				calls.push(['child', batch])
			})
		},
		function (batch) {
			calls.push(['scope', batch])
		}
	)

	disposeScope(false)

	assert.deepEqual(calls, [
		['scope', false],
		['child', true]
	])
})

test('derive computes from the source property during initialization', function () {
	const source = signal({ name: 'Ada' })
	const upperName = derive(source, 'name', function (name) {
		return name.toUpperCase()
	})

	assert.equal(upperName.peek(), 'ADA')
})

test('derive clears stale values when a nullable source is cleared', async function () {
	const source = signal({ title: 'Track' })
	const title = derive(source, 'title')

	assert.equal(title.peek(), 'Track')

	source.value = null
	await nextTick()

	assert.equal(title.peek(), undefined)
})

test('onCondition keeps shared matches live until the last consumer disposes', async function () {
	const selected = signal('a')
	const condition = signal('a')
	let matches
	const disposeOwner = collectDisposers([], function () {
		matches = onCondition(selected)
	})
	let first
	let second
	const disposeFirst = collectDisposers([], function () {
		first = matches(condition)
	})
	const disposeSecond = collectDisposers([], function () {
		second = matches(condition)
	})

	assert.equal(first, second)
	assert.equal(second.peek(), true)
	assert.equal(condition.connected, true)

	disposeFirst()
	condition.value = 'b'
	await nextTick()
	assert.equal(second.peek(), false)
	assert.equal(condition.connected, true)

	selected.value = 'b'
	await nextTick()
	assert.equal(second.peek(), true)

	disposeSecond()
	assert.equal(condition.connected, false)

	disposeOwner()
	assert.equal(selected.connected, false)
})
