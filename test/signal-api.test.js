import assert from 'node:assert/strict'
import test from 'node:test'

import {
	Signal,
	bind,
	collectDisposers,
	createDefer,
	createSchedule,
	deferred,
	derivedExtract,
	extract,
	makeReactive,
	merge,
	nextTick,
	peek,
	poke,
	read,
	readAll,
	signal,
	touch,
	tpl,
	untrack,
	watch,
	write
} from 'refui/signal'

function createManualDeferrer() {
	const tasks = []
	function defer(callback) {
		const task = { active: true, callback }
		tasks.push(task)
		return function () {
			task.active = false
		}
	}
	function flush() {
		const pending = tasks.splice(0)
		for (let i = 0; i < pending.length; i++) {
			if (pending[i].active) pending[i].callback()
		}
	}
	return { defer, flush, tasks }
}

async function drainDeferrer(manual, turns = 6) {
	for (let i = 0; i < turns; i++) {
		manual.flush()
		await nextTick()
	}
}

test('Signal construction, ensuring, mutation, and protocols retain their public behavior', async function () {
	const original = signal(1)
	assert.equal(signal.ensure(original), original)
	const ensured = signal.ensure(2)
	assert.ok(ensured instanceof Signal)
	assert.deepEqual(signal.ensureAll(original, 3).map(peek), [1, 3])

	let runs = 0
	const disposeEffect = watch(function () {
		runs += 1
		original.value
	})
	assert.equal(original.get(), 1)
	assert.equal(original.hasValue(), true)
	original.poke(2)
	await nextTick()
	assert.equal(runs, 1)
	assert.equal(original.peek(), 2)
	original.trigger()
	await nextTick()
	assert.equal(runs, 2)
	original.set(null)
	await nextTick()
	assert.equal(original.hasValue(), false)
	disposeEffect()

	const list = signal([1, 2, 3])
	assert.deepEqual([...list], [1, 2, 3])
	assert.deepEqual(list.toJSON(), [1, 2, 3])
	assert.equal(String(signal('value')), 'value')
	assert.equal(Number(signal('4')), 4)
	assert.equal(signal(5) + 1, 6)
})

test('Signal boolean and selection combinators update from every supplied signal', async function () {
	const condition = signal(true)
	const truthy = signal('yes')
	const falsy = signal('no')
	const falseValue = signal(false)
	const trueValue = signal(true)
	const results = {
		inverse: condition.inverse(),
		choose: condition.choose(truthy, falsy),
		and: condition.and(trueValue),
		andNot: condition.andNot(falseValue),
		andOr: condition.andOr(truthy, falsy),
		inverseAnd: condition.inverseAnd(trueValue),
		inverseAndNot: condition.inverseAndNot(falseValue),
		inverseAndOr: condition.inverseAndOr(truthy, falsy),
		or: condition.or(falseValue),
		orNot: condition.orNot(trueValue),
		inverseOr: condition.inverseOr(falseValue),
		inverseOrNot: condition.inverseOrNot(trueValue)
	}

	assert.deepEqual(Object.fromEntries(Object.entries(results).map(function ([key, value]) {
		return [key, value.peek()]
	})), {
		inverse: false,
		choose: 'yes',
		and: true,
		andNot: true,
		andOr: 'yes',
		inverseAnd: false,
		inverseAndNot: false,
		inverseAndOr: 'no',
		or: true,
		orNot: true,
		inverseOr: false,
		inverseOrNot: false
	})

	condition.value = false
	await nextTick()
	assert.deepEqual(Object.fromEntries(Object.entries(results).map(function ([key, value]) {
		return [key, value.peek()]
	})), {
		inverse: true,
		choose: 'no',
		and: false,
		andNot: false,
		andOr: 'no',
		inverseAnd: true,
		inverseAndNot: true,
		inverseAndOr: 'yes',
		or: false,
		orNot: false,
		inverseOr: true,
		inverseOrNot: true
	})

	truthy.value = 'updated'
	await nextTick()
	condition.value = true
	await nextTick()
	assert.equal(results.choose.peek(), 'updated')
	assert.equal(results.andOr.peek(), 'updated')

	const nullable = signal(null)
	const fallback = signal('fallback')
	const resolved = nullable.nullishThen(fallback)
	assert.equal(resolved.peek(), 'fallback')
	nullable.value = 'present'
	await nextTick()
	assert.equal(resolved.peek(), 'present')
	fallback.value = 'new fallback'
	nullable.value = undefined
	await nextTick()
	assert.equal(resolved.peek(), 'new fallback')

	const key = signal('first')
	const options = signal({ first: 1, second: 2 })
	const selected = key.select(options)
	assert.equal(selected.peek(), 1)
	key.value = 'second'
	await nextTick()
	assert.equal(selected.peek(), 2)
	options.value = { first: 3, second: 4 }
	await nextTick()
	assert.equal(selected.peek(), 4)
})

test('Signal comparison combinators react to both operands', async function () {
	const left = signal(2)
	const right = signal(3)
	const comparisons = {
		eq: left.eq(right),
		neq: left.neq(right),
		gt: left.gt(right),
		lt: left.lt(right),
		gte: left.gte(right),
		lte: left.lte(right)
	}
	function values() {
		return Object.fromEntries(Object.entries(comparisons).map(function ([key, value]) {
			return [key, value.peek()]
		}))
	}

	assert.deepEqual(values(), {
		eq: false,
		neq: true,
		gt: false,
		lt: true,
		gte: false,
		lte: true
	})
	left.value = 3
	await nextTick()
	assert.deepEqual(values(), {
		eq: true,
		neq: false,
		gt: false,
		lt: false,
		gte: true,
		lte: true
	})
	right.value = 1
	await nextTick()
	assert.equal(comparisons.gt.peek(), true)
	assert.equal(comparisons.lte.peek(), false)
})

test('signal read, write, touch, bind, merge, and template helpers compose predictably', async function () {
	const inner = signal(2)
	const nested = signal(inner)
	assert.equal(peek(nested), 2)
	assert.equal(read(nested), 2)
	assert.deepEqual(readAll(inner, 3), [2, 3])
	assert.equal(poke(inner, 4), undefined)
	assert.equal(poke(1, 5), 5)
	assert.equal(write(inner, function (value) { return value + 1 }), 5)
	assert.equal(write(2, function (value) { return value * 3 }), 6)
	assert.equal(write(2, 7), 7)

	let touchRuns = 0
	const disposeTouch = watch(function () {
		touchRuns += 1
		touch(inner, 'not a signal')
	})
	inner.value = 6
	await nextTick()
	assert.equal(touchRuns, 2)
	disposeTouch()

	const boundValues = []
	const source = signal(1)
	const disposeBindings = collectDisposers(function () {
		bind(function (value) { boundValues.push(['signal', value]) }, source)
		bind(function (value) { boundValues.push(['function', value]) }, function () {
			return source.value * 2
		})
		bind(function (value) { boundValues.push(['static', value]) }, 9)
	})
	assert.deepEqual(boundValues, [
		['signal', 1],
		['function', 2],
		['static', 9]
	])
	source.value = 2
	await nextTick()
	assert.deepEqual(boundValues.slice(-2), [['signal', 2], ['function', 4]])
	disposeBindings()

	const first = signal('A')
	const second = signal('B')
	const merged = merge([first, second], function (a, b) { return `${a}:${b}` })
	const template = tpl`${first}-${second}`
	assert.equal(merged.peek(), 'A:B')
	assert.equal(template.peek(), 'A-B')
	first.value = 'C'
	await nextTick()
	assert.equal(merged.peek(), 'C:B')
	assert.equal(template.peek(), 'C-B')

	let untrackedRuns = 0
	const untrackedSource = signal(0)
	const disposeUntracked = watch(function () {
		untrackedRuns += 1
		untrack(function () { untrackedSource.value })
	})
	untrackedSource.value = 1
	await nextTick()
	assert.equal(untrackedRuns, 1)
	disposeUntracked()
})

test('extract, derivedExtract, and makeReactive preserve shallow and deep semantics', async function () {
	const name = signal('one')
	const record = signal({ name, count: 1 })
	const shallow = extract(record)
	const deep = derivedExtract(record)
	const reactive = makeReactive({ name, fixed: 'constant' })

	assert.equal(shallow.name.peek(), 'one')
	assert.equal(deep.name.peek(), 'one')
	assert.equal(reactive.name, 'one')
	assert.deepEqual(Object.keys(reactive), ['name', 'fixed'])
	name.value = 'two'
	await nextTick()
	assert.equal(shallow.name.peek(), 'one')
	assert.equal(deep.name.peek(), 'two')
	assert.equal(reactive.name, 'two')

	reactive.name = 'three'
	await nextTick()
	assert.equal(name.peek(), 'three')
	const replacementName = signal('four')
	record.value = { name: replacementName, count: 2 }
	await nextTick()
	assert.equal(shallow.name.peek(), 'four')
	assert.equal(shallow.count.peek(), 2)
	assert.equal(deep.name.peek(), 'four')
	replacementName.value = 'five'
	await nextTick()
	assert.equal(shallow.name.peek(), 'four')
	assert.equal(deep.name.peek(), 'five')
})

test('createDefer coalesces invalidated work and disposes pending and active cleanup', async function () {
	const manual = createManualDeferrer()
	const source = signal(1)
	const values = []
	let cleanups = 0
	let abort
	let output
	const disposeOwner = collectDisposers(function () {
		output = createDefer(manual.defer)(function (commit) {
			const value = source.value
			values.push(value)
			commit(value * 10)
			return function () {
				cleanups += 1
			}
		}, function (handler) {
			abort = handler
		})
	})

	assert.equal(output.peek(), undefined)
	assert.equal(manual.tasks.length, 1)
	manual.flush()
	assert.deepEqual(values, [1])
	assert.equal(output.peek(), 10)

	source.value = 2
	await nextTick()
	assert.equal(cleanups, 1)
	source.value = 3
	await nextTick()
	manual.flush()
	assert.deepEqual(values, [1, 3])
	assert.equal(output.peek(), 30)

	abort()
	assert.equal(cleanups, 2)
	disposeOwner()
	source.value = 4
	await nextTick()
	manual.flush()
	assert.deepEqual(values, [1, 3])
})

test('default deferred and createSchedule eventually publish their latest value', async function () {
	const source = signal(1)
	let defaultOutput
	const disposeDefault = collectDisposers(function () {
		defaultOutput = deferred(function (commit) {
			commit(source.value * 2)
		})
	})
	await nextTick()
	await nextTick()
	assert.equal(defaultOutput.peek(), 2)
	source.value = 2
	await nextTick()
	await nextTick()
	assert.equal(defaultOutput.peek(), 4)
	disposeDefault()

	const manual = createManualDeferrer()
	const abortHandlers = []
	const stage = createSchedule(manual.defer, function (handler) {
		abortHandlers.push(handler)
	})
	const scheduledSource = signal(0)
	let scheduled
	const disposeScheduled = collectDisposers(function () {
		scheduled = stage(scheduledSource)
	})
	await drainDeferrer(manual)
	assert.equal(scheduled.peek(), 0)

	scheduledSource.value = 1
	scheduledSource.value = 2
	await nextTick()
	await drainDeferrer(manual)
	assert.equal(scheduled.peek(), 2)

	const nullableSource = signal(null)
	let nullableScheduled
	const disposeNullable = collectDisposers(function () {
		nullableScheduled = stage(nullableSource)
	})
	await drainDeferrer(manual)
	assert.equal(nullableScheduled.peek(), null)
	nullableSource.value = undefined
	await nextTick()
	await drainDeferrer(manual)
	assert.equal(nullableScheduled.peek(), undefined)

	for (let i = 0; i < abortHandlers.length; i++) abortHandlers[i]()
	disposeScheduled()
	disposeNullable()
	scheduledSource.value = 3
	nullableSource.value = 'late'
	await nextTick()
	await drainDeferrer(manual)
	assert.equal(scheduled.peek(), 2)
	assert.equal(nullableScheduled.peek(), undefined)
})

test('createSchedule coalesces callback commits and runs invalidation cleanup', async function () {
	const manual = createManualDeferrer()
	const stage = createSchedule(manual.defer)
	const source = signal(1)
	let cleanups = 0
	let scheduled
	const disposeScheduled = collectDisposers(function () {
		scheduled = stage(function (commit) {
			const value = source.value
			commit(value)
			commit(value)
			return function () {
				cleanups += 1
			}
		})
	})

	await drainDeferrer(manual)
	assert.equal(scheduled.peek(), 1)
	source.value = 2
	source.value = 3
	await nextTick()
	await drainDeferrer(manual)
	assert.equal(scheduled.peek(), 3)
	assert.equal(cleanups, 1)

	disposeScheduled()
	assert.equal(cleanups, 2)
	source.value = 4
	await nextTick()
	await drainDeferrer(manual)
	assert.equal(scheduled.peek(), 3)
})
