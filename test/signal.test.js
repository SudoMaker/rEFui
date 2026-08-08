import assert from 'node:assert/strict'
import test from 'node:test'

import { memo } from 'refui/components'
import {
	EffectScope,
	collectDisposers,
	computed,
	connect,
	derive,
	freeze,
	isSignal,
	listen,
	nextTick,
	onCondition,
	onDispose,
	signal,
	useEffect,
	useAction,
	watch,
	scopeValid
} from 'refui/signal'
import { cached } from 'refui/utils'

test('EffectScope owns a tracked effect and releases its cleanup', async function () {
	const source = signal(0)
	const events = []
	const scope = new EffectScope(function () {
		const value = source.value
		events.push(['run', value])
		return function () {
			events.push(['cleanup', value])
		}
	})

	assert.deepEqual(events, [])
	scope.run()
	source.value = 1
	await nextTick()
	scope.destroy()
	scope.destroy()

	assert.deepEqual(events, [
		['run', 0],
		['cleanup', 0],
		['run', 1],
		['cleanup', 1]
	])
	assert.equal(source.connected, false)
})

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

test('a disposed pending effect stays inactive while a replacement reconnects', async function () {
	const source = signal(0)
	let firstRuns = 0
	let secondRuns = 0

	const disposeFirst = watch(function () {
		source.value
		firstRuns += 1
	})

	source.value = 1
	disposeFirst()
	assert.equal(source.connected, false)

	const disposeSecond = watch(function () {
		source.value
		secondRuns += 1
	})
	assert.equal(source.connected, true)

	await nextTick()
	assert.equal(firstRuns, 1)
	assert.equal(secondRuns, 1)

	source.value = 2
	await nextTick()
	assert.equal(firstRuns, 1)
	assert.equal(secondRuns, 2)

	disposeSecond()
	assert.equal(source.connected, false)
})

test('replacing an explicit connection leaves only live callbacks active', async function () {
	const source = signal(0)
	let firstRuns = 0
	let secondRuns = 0
	let replacementRuns = 0

	const disposeFirst = collectDisposers(function () {
		source.connect(function () {
			firstRuns += 1
		}, false)
	})
	const disposeSecond = collectDisposers(function () {
		source.connect(function () {
			secondRuns += 1
		}, false)
	})
	disposeFirst()

	const disposeReplacement = collectDisposers(function () {
		source.connect(function () {
			replacementRuns += 1
		}, false)
	})
	source.value = 1
	await nextTick()
	assert.equal(firstRuns, 0)
	assert.equal(secondRuns, 1)
	assert.equal(replacementRuns, 1)

	disposeSecond()
	disposeReplacement()
	assert.equal(source.connected, false)
})

test('an explicit connection created during dispatch waits for the next trigger', async function () {
	const source = signal(0)
	let disposeLater
	let disposeReplacement
	let replacementRuns = 0
	let replace = false

	const disposeFirst = watch(function () {
		source.value
		if (replace) {
			replace = false
			disposeLater()
			disposeReplacement = collectDisposers(function () {
				source.connect(function () {
					replacementRuns += 1
				}, false)
			}, undefined, [], null)
		}
	})
	disposeLater = watch(function () {
		source.value
	})
	replace = true
	source.value = 1
	await nextTick()
	assert.equal(replacementRuns, 0)

	source.value = 2
	await nextTick()
	assert.equal(replacementRuns, 1)

	disposeFirst()
	disposeReplacement()
	assert.equal(source.connected, false)
})

test('a signal only reports live user and pure connections', function () {
	const value = signal(1)

	assert.equal(value.connected, false)

	const disposeUser = watch(function () {
		value.value
	})

	assert.equal(value.connected, true)

	disposeUser()
	assert.equal(value.connected, false)

	let mirrored
	const disposePure = collectDisposers(function () {
		mirrored = signal(value)
	})

	assert.equal(mirrored.peek(), 1)
	assert.equal(value.connected, true)

	disposePure()
	assert.equal(value.connected, false)
})

test('user and signal effects remain independently connected and disposable', async function () {
	const source = signal(1)
	let mirrored
	let userRuns = 0

	const disposePure = collectDisposers(function () {
		mirrored = signal(source)
	})
	const disposeUser = collectDisposers(function () {
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

test('watch discovers dependencies reached after a short-circuit changes', async function () {
	const a = signal(false)
	const b = signal(false)
	const values = []
	const disposeEffect = watch(function () {
		values.push(a.value && b.value)
	})

	assert.equal(b.connected, false)

	a.value = true
	await nextTick()
	assert.equal(b.connected, true)

	b.value = true
	await nextTick()
	assert.deepEqual(values, [false, false, true])

	disposeEffect()
	assert.equal(a.connected, false)
	assert.equal(b.connected, false)
})

test('watch retires a dependency after its stale subscription fires', async function () {
	const enabled = signal(true)
	const conditional = signal(0)
	let runs = 0
	const disposeEffect = watch(function () {
		runs += 1
		if (enabled.value) conditional.value
	})

	enabled.value = false
	await nextTick()
	assert.equal(runs, 2)

	conditional.value = 1
	await nextTick()
	assert.equal(runs, 3)
	assert.equal(conditional.connected, false)

	conditional.value = 2
	await nextTick()
	assert.equal(runs, 3)

	disposeEffect()
})

test('a rerunning watch replaces child effects instead of accumulating them', async function () {
	const parentSource = signal(0)
	const childSource = signal(0)
	let childRuns = 0
	const disposeParent = watch(function () {
		parentSource.value
		watch(function () {
			childSource.value
			childRuns += 1
		})
	})

	assert.equal(childRuns, 1)

	parentSource.value = 1
	await nextTick()
	assert.equal(childRuns, 2)

	childSource.value = 1
	await nextTick()
	assert.equal(childRuns, 3)

	disposeParent()
	assert.equal(parentSource.connected, false)
	assert.equal(childSource.connected, false)
})

test('signal state is private rather than exposed through the legacy underscore store', function () {
	const value = signal(1)

	assert.equal(Object.hasOwn(value, '_'), false)
	assert.deepEqual(Object.keys(value), [])
})

test('function-valued signals remain plain writable signals', function () {
	const first = function first() {}
	const second = function second() {}
	const value = signal(first)

	assert.equal(value.peek(), first)
	value.value = second
	assert.equal(value.peek(), second)
})

test('computed signals retain their public computed helper semantics', async function () {
	const source = signal(2)
	const doubled = computed(function () {
		return source.value * 2
	})

	assert.equal(doubled.peek(), 4)
	source.value = 3
	await nextTick()
	assert.equal(doubled.peek(), 6)
})

test('refresh reruns the computed scope with its original input', function () {
	const source = signal(2)
	const doubled = signal(source, function (value) {
		return value * 2
	})

	assert.equal(doubled.peek(), 4)
	doubled.refresh()
	assert.equal(doubled.peek(), 4)
})

test('refresh collects new computed branches without tracking the caller', async function () {
	let useFirst = true
	const first = signal(1)
	const second = signal(2)
	const selected = computed(function () {
		return useFirst ? first.value : second.value
	})
	const refreshTrigger = signal(0)
	let callerRuns = 0
	const disposeCaller = watch(function () {
		refreshTrigger.value
		callerRuns += 1
		selected.refresh()
	})

	useFirst = false
	refreshTrigger.value = 1
	await nextTick()
	assert.equal(selected.peek(), 2)
	assert.equal(callerRuns, 2)

	second.value = 3
	await nextTick()
	assert.equal(selected.peek(), 3)
	assert.equal(callerRuns, 2)

	disposeCaller()
})

test('refresh consumes an already queued computed execution', async function () {
	const source = signal(0)
	let computations = 0
	const value = computed(function () {
		computations += 1
		return source.value
	})

	assert.equal(computations, 1)
	source.value = 1
	value.refresh()
	assert.equal(computations, 2)
	await nextTick()
	assert.equal(computations, 2)
})

test('useEffect cleans the previous run and final run exactly once', async function () {
	const source = signal(0)
	const events = []
	const disposeEffect = useEffect(function () {
		const value = source.value
		events.push(['run', value])
		return function () {
			events.push(['cleanup', value])
		}
	})

	source.value = 1
	await nextTick()
	disposeEffect()
	disposeEffect()

	assert.deepEqual(events, [
		['run', 0],
		['cleanup', 0],
		['run', 1],
		['cleanup', 1]
	])
})

test('watch records each dependency only once across reads and reruns', async function () {
	const source = signal(1)
	let runs = 0
	const disposeEffect = watch(function () {
		runs += 1
		source.value
		source.value
	})

	source.value = 2
	await nextTick()
	assert.equal(runs, 2)

	source.value = 3
	await nextTick()
	assert.equal(runs, 3)

	disposeEffect()
})

test('watch tracks multiple dependencies without duplicate executions', async function () {
	const first = signal(1)
	const second = signal(2)
	let runs = 0
	const disposeTwo = watch(function () {
		runs += 1
		first.value
		second.value
		first.value
	})

	first.value = 3
	second.value = 4
	await nextTick()
	assert.equal(runs, 2)

	disposeTwo()
})

test('a frozen effect context becomes inert after its scope is disposed', async function () {
	const source = signal(0)
	let runFrozen
	const disposeEffect = watch(function () {
		if (!runFrozen) {
			runFrozen = freeze(function () {
				return source.value
			})
		}
	})

	assert.equal(runFrozen(), 0)
	assert.equal(source.connected, true)

	disposeEffect()
	assert.equal(source.connected, false)

	assert.equal(runFrozen(), 0)
	source.value = 1
	await nextTick()
	assert.equal(source.connected, false)
})

test('a disposed frozen context cannot create a live child effect', async function () {
	const source = signal(0)
	let createChild
	let childRuns = 0
	const disposeOwner = watch(function () {
		createChild ||= freeze(function () {
			return watch(function () {
				childRuns += 1
				source.value
			})
		})
	})

	disposeOwner()
	const disposeChild = createChild()
	assert.equal(childRuns, 0)
	assert.equal(source.connected, false)

	source.value = 1
	await nextTick()
	assert.equal(childRuns, 0)
	disposeChild()
})

test('entering another scope cannot revive a disposed frozen context', async function () {
	const source = signal(0)
	const otherScope = new EffectScope()
	let createChild
	let childRuns = 0
	const disposeOwner = watch(function () {
		createChild ||= freeze(function () {
			return otherScope._call(function () {
				return watch(function () {
					childRuns += 1
					source.value
				})
			})
		})
	})

	disposeOwner()
	const disposeChild = createChild()
	assert.equal(childRuns, 0)
	assert.equal(source.connected, false)

	source.value = 1
	await nextTick()
	assert.equal(childRuns, 0)
	disposeChild()
	otherScope.destroy()
})

test('a disposed pending effect cannot attach newly reached dependencies', async function () {
	const first = signal(0)
	const second = signal(0)
	const killer = signal(false)
	const late = signal(0)
	let disposeEffect
	let discoverLate = false
	let runs = 0

	const disposeKiller = watch(function () {
		if (killer.value && disposeEffect) {
			disposeEffect()
		}
	})
	disposeEffect = watch(function () {
		runs += 1
		first.value
		second.value
		if (discoverLate) late.value
	})

	first.value = 1
	killer.value = true
	second.value = 1
	discoverLate = true
	await nextTick()

	assert.equal(late.connected, false)
	const settledRuns = runs
	late.value = 1
	await nextTick()
	assert.equal(runs, settledRuns)

	disposeKiller()
})

test('watch owns a dependency read first inside a shorter-lived scope', async function () {
	const source = signal(0)
	let disposeInner
	let runs = 0
	const disposeEffect = watch(function () {
		runs += 1
		if (!disposeInner) {
			disposeInner = collectDisposers(function () {
				source.value
			})
		}
		source.value
	})

	disposeInner()
	source.value = 1
	await nextTick()
	assert.equal(runs, 2)
	assert.equal(source.connected, true)

	disposeEffect()
	assert.equal(source.connected, false)
})

test('connect shares one readable effect across all explicit sources', async function () {
	const a = signal(0)
	const b = signal(0)
	let runs = 0

	const disposeEffect = collectDisposers(function () {
		connect([a, b], function () {
			runs += 1
			a.value
			b.value
		})
	})
	assert.equal(runs, 1)

	a.value = 1
	b.value = 1
	await nextTick()
	assert.equal(runs, 2)

	disposeEffect()
	assert.equal(a.connected, false)
	assert.equal(b.connected, false)
})

test('listen preserves one eager subscription per supplied signal', async function () {
	const first = signal(0)
	const second = signal(0)
	let runs = 0
	const disposeListeners = collectDisposers(function () {
		listen([first, second], function () {
			runs += 1
		})
	})

	assert.equal(runs, 2)
	first.value = 1
	second.value = 1
	await nextTick()
	assert.equal(runs, 4)

	disposeListeners()
})

test('listen rolls back earlier eager connections when setup fails', async function () {
	const first = signal(0)
	const second = signal(0)
	let runs = 0

	assert.throws(function () {
		listen([first, second], function () {
			runs += 1
			if (runs === 2) throw new Error('listener setup failed')
		})
	}, /listener setup failed/)

	assert.equal(first.connected, false)
	assert.equal(second.connected, false)
	first.value = 1
	await nextTick()
	assert.equal(runs, 2)
})

test('useAction remains lazy and batches the latest action value', async function () {
	const [onAction, trigger] = useAction(0)
	const seen = []
	const disposeListener = collectDisposers(function () {
		onAction(function (value) {
			seen.push(value)
		})
	})

	assert.deepEqual(seen, [])
	trigger(1)
	trigger(2)
	await nextTick()
	assert.deepEqual(seen, [2])

	disposeListener()
	trigger(3)
	await nextTick()
	assert.deepEqual(seen, [2])
})

test('separate explicit connections keep independent disposer ownership', async function () {
	const source = signal(0)
	let runs = 0
	function effect() {
		runs += 1
	}
	const disposeFirst = collectDisposers(function () {
		source.connect(effect, false)
	})
	const disposeSecond = collectDisposers(function () {
		source.connect(effect, false)
	})

	source.value = 1
	await nextTick()
	assert.equal(runs, 2)

	disposeFirst()
	source.value = 2
	await nextTick()
	assert.equal(runs, 3)
	assert.equal(source.connected, true)

	disposeSecond()
	assert.equal(source.connected, false)
})

test('nested watches retain ownership of dependencies reached later', async function () {
	const gate = signal(false)
	const innerSource = signal(0)
	let outerRuns = 0
	let innerRuns = 0
	let initialized = false
	const disposeOuter = watch(function () {
		outerRuns += 1
		if (!initialized) {
			initialized = true
			watch(function () {
				innerRuns += 1
				if (gate.value) innerSource.value
			})
		}
	})

	gate.value = true
	await nextTick()
	innerSource.value = 1
	await nextTick()

	assert.equal(outerRuns, 1)
	assert.equal(innerRuns, 3)

	disposeOuter()
	assert.equal(gate.connected, false)
	assert.equal(innerSource.connected, false)
})

test('pure propagation finishes before an earlier user effect runs', async function () {
	const source = signal(1)
	const seen = []
	let mirrored
	const disposeScope = collectDisposers(function () {
		watch(function () {
			const value = source.value
			if (mirrored) seen.push([value, mirrored.peek()])
		})
		mirrored = signal(source)
	})

	source.value = 2
	await nextTick()
	assert.deepEqual(seen, [[2, 2]])

	disposeScope()
})

test('queued effects recover after an earlier effect throws', async function () {
	const gate = signal(false)
	let laterRuns = 0
	const disposeThrowing = watch(function () {
		if (gate.value) throw new Error('queued failure')
	})
	const disposeLater = watch(function () {
		gate.value
		laterRuns += 1
	})

	gate.value = true
	await assert.rejects(nextTick(), /queued failure/)
	assert.equal(laterRuns, 2)

	gate.value = false
	await nextTick()
	assert.equal(laterRuns, 3)
	disposeThrowing()
	disposeLater()
})

test('a cleanup failure during rerun terminates the effect', async function () {
	const source = signal(0)
	let runs = 0
	const disposeEffect = useEffect(function () {
		source.value
		runs += 1
		return function () {
			throw new Error('cleanup failed')
		}
	})

	source.value = 1
	await assert.rejects(nextTick(), /cleanup failed/)
	assert.equal(runs, 1)
	assert.equal(source.connected, false)

	source.value = 2
	await nextTick()
	assert.equal(runs, 1)
	disposeEffect()
})

test('a failed dynamic watch terminates before it can become orphaned', async function () {
	const source = signal(0)
	let fail = false
	let runs = 0
	const disposeEffect = watch(function () {
		if (fail) throw new Error('effect failed before dependency read')
		source.value
		runs += 1
	})

	fail = true
	source.value = 1
	await assert.rejects(nextTick(), /effect failed before dependency read/)
	assert.equal(source.connected, false)

	fail = false
	source.value = 2
	await nextTick()
	assert.equal(runs, 1)
	disposeEffect()
})

test('a failed manual EffectScope run terminates the scope', function () {
	const source = signal(0)
	let cleanupCalls = 0
	const scope = new EffectScope(function () {
		source.value
		onDispose(function () {
			cleanupCalls += 1
		})
		throw new Error('manual run failed')
	})

	assert.throws(function () {
		scope.run()
	}, /manual run failed/)
	assert.equal(cleanupCalls, 1)
	assert.equal(source.connected, false)
	assert.equal(scopeValid(scope), false)
})

test('a caught scheduler failure does not create another unhandled rejection', async function () {
	const failures = []
	function onUnhandled(error) {
		failures.push(error)
	}
	process.on('unhandledRejection', onUnhandled)
	const gate = signal(false)
	const disposeEffect = watch(function () {
		if (gate.value) throw new Error('handled failure')
	})

	try {
		gate.value = true
		await assert.rejects(nextTick(), /handled failure/)
		await new Promise(function(resolve) {
			setImmediate(resolve)
		})
		assert.deepEqual(failures, [])
	} finally {
		process.off('unhandledRejection', onUnhandled)
		disposeEffect()
	}
})

test('cleanup failures do not prevent later child disposal', async function () {
	const source = signal(0)
	let childRuns = 0
	const disposeParent = watch(function () {
		onDispose(function () {
			throw new Error('cleanup failure')
		})
		watch(function () {
			source.value
			childRuns += 1
		})
	})

	assert.throws(disposeParent, /cleanup failure/)
	source.value = 1
	await nextTick()
	assert.equal(childRuns, 1)
})

test('multiple cleanup failures are aggregated after every cleanup runs', function () {
	const calls = []
	const disposeScope = collectDisposers(function () {
		onDispose(function () {
			calls.push('first')
			throw new Error('first cleanup')
		})
		onDispose(function () {
			calls.push('second')
			throw new Error('second cleanup')
		})
	})

	assert.throws(disposeScope, function(error) {
		assert.ok(error instanceof AggregateError)
		assert.equal(error.errors.length, 2)
		return true
	})
	assert.deepEqual(calls, ['first', 'second'])
})

test('cleanup-only signal reads do not become effect dependencies', async function () {
	const source = signal(0)
	const cleanupOnly = signal(0)
	let runs = 0
	const disposeEffect = watch(function () {
		source.value
		runs += 1
		onDispose(function () {
			cleanupOnly.value
		})
	})

	source.value = 1
	await nextTick()
	assert.equal(runs, 2)
	assert.equal(cleanupOnly.connected, false)

	cleanupOnly.value = 1
	await nextTick()
	assert.equal(runs, 2)
	disposeEffect()
})

test('nested cleanup reads do not contaminate the parent effect', async function () {
	const source = signal(0)
	const cleanupOnly = signal(0)
	let runs = 0
	const disposeEffect = watch(function () {
		source.value
		runs += 1
		collectDisposers(function () {}, function () {
			cleanupOnly.value
		})
	})

	source.value = 1
	await nextTick()
	assert.equal(runs, 2)
	assert.equal(cleanupOnly.connected, false)

	cleanupOnly.value = 1
	await nextTick()
	assert.equal(runs, 2)
	disposeEffect()
})

test('effect cleanup retains ownership for its next lifecycle', async function () {
	const source = signal(0)
	const events = []
	const disposeEffect = watch(function () {
		const value = source.value
		onDispose(function () {
			events.push(['cleanup', value])
			onDispose(function () {
				events.push(['deferred', value])
			})
		})
	})

	source.value = 1
	await nextTick()
	assert.deepEqual(events, [['cleanup', 0]])

	source.value = 2
	await nextTick()
	assert.deepEqual(events, [
		['cleanup', 0],
		['deferred', 0],
		['cleanup', 1]
	])

	disposeEffect()
})

test('a callback frozen during cleanup stays untracked and retains its owner', async function () {
	const source = signal(0)
	const cleanupOnly = signal(0)
	let frozenCleanup
	let deferredCleanups = 0
	const disposeEffect = watch(function () {
		source.value
		onDispose(function () {
			frozenCleanup = freeze(function () {
				cleanupOnly.value
				onDispose(function () {
					deferredCleanups += 1
				})
			})
		})
	})

	source.value = 1
	await nextTick()
	frozenCleanup()
	assert.equal(cleanupOnly.connected, false)

	source.value = 2
	await nextTick()
	assert.equal(deferredCleanups, 1)
	assert.equal(cleanupOnly.connected, false)
	disposeEffect()
})

test('pure work preempts later user effects in the same queue', async function () {
	const kick = signal(false)
	const source = signal(0)
	const doubled = computed(function () {
		return source.value * 2
	})
	const seen = []
	const disposeWriter = watch(function () {
		if (kick.value) source.value = 1
	})
	const disposeReader = watch(function () {
		kick.value
		seen.push([source.value, doubled.value])
	})

	seen.length = 0
	kick.value = true
	await nextTick()
	assert.deepEqual(seen, [[1, 2]])
	disposeWriter()
	disposeReader()
})

test('subscriber churn is compacted without reading connected', function () {
	const source = signal(0)
	const disposeKeeper = watch(function () {
		source.value
	})
	for (let i = 0; i < 10000; i++) {
		watch(function () {
			source.value
		})()
	}

	const state = source[Object.getOwnPropertySymbols(source)[0]]
	assert.ok(state[2] instanceof Set)
	assert.ok(state[2].size <= 64, `retained ${state[2].size} subscribers`)
	disposeKeeper()
})

test('explicit connections return independent disposers', async function () {
	const source = signal(0)
	let connectedRuns = 0
	let listenedRuns = 0
	const disposeConnection = source.connect(function () {
		connectedRuns += 1
	})
	const disposeListeners = listen([source], function () {
		listenedRuns += 1
	})

	disposeConnection()
	disposeListeners()
	source.value = 1
	await nextTick()
	assert.equal(connectedRuns, 1)
	assert.equal(listenedRuns, 1)
})

test('signal predicates and scope validity return booleans', function () {
	assert.equal(isSignal(null), false)
	assert.equal(isSignal(0), false)
	assert.equal(scopeValid(), true)
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
		collectDisposers(function brokenScope() {
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

test('an explicitly disposed child stays inactive when its parent is disposed', function () {
	let disposeChild
	let childCleanupCalls = 0
	const disposeParent = collectDisposers(function () {
		disposeChild = collectDisposers(function () {}, function () {
			childCleanupCalls += 1
		})
	})

	disposeChild()
	assert.equal(childCleanupCalls, 1)

	disposeParent()
	assert.equal(childCleanupCalls, 1)
})

test('a manually disposed connection releases its owner slot', function () {
	const ownerDisposers = []
	let disposeConnection
	const disposeOwner = collectDisposers(function () {
		const source = signal(0)
		disposeConnection = source.connect(function () {})
		disposeConnection()
	}, undefined, ownerDisposers)

	assert.notEqual(ownerDisposers[0], disposeConnection)
	disposeOwner()
})

test('cleaned children stay inert while later siblings remain disposable', function () {
	const ownerDisposers = []
	const disposeParent = collectDisposers(function () {}, undefined, ownerDisposers)
	let firstCleanups = 0
	const disposeFirst = collectDisposers(function () {}, function () {
		firstCleanups += 1
	}, [], ownerDisposers)

	disposeFirst()
	let secondCleanups = 0
	collectDisposers(function () {}, function () {
		secondCleanups += 1
	}, [], ownerDisposers)

	disposeFirst()
	disposeParent()

	assert.equal(firstCleanups, 1)
	assert.equal(secondCleanups, 1)
})

test('a disposer keeps cleanup ordering and batch flags intact', function () {
	const calls = []
	const disposeScope = collectDisposers(
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

test('derive settles signal-valued properties before later user effects', async function () {
	const property = signal(0)
	const source = signal({ value: property })
	const kick = signal(false)
	const derived = derive(source, 'value')
	const seen = []
	const disposeWriter = watch(function () {
		if (kick.value) property.value = 1
	})
	const disposeReader = watch(function () {
		kick.value
		seen.push(derived.value)
	})

	seen.length = 0
	kick.value = true
	await nextTick()
	assert.deepEqual(seen, [1])
	disposeWriter()
	disposeReader()
})

test('onCondition keeps shared matches live until the last consumer disposes', async function () {
	const selected = signal('a')
	const condition = signal('a')
	let matches
	const disposeOwner = collectDisposers(function () {
		matches = onCondition(selected)
	})
	let first
	let second
	const disposeFirst = collectDisposers(function () {
		first = matches(condition)
	})
	const disposeSecond = collectDisposers(function () {
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

test('onCondition settles signal-valued matches before later user effects', async function () {
	const selected = signal('a')
	const condition = signal('a')
	const kick = signal(false)
	const matched = onCondition(selected)(condition)
	const seen = []
	const disposeWriter = watch(function () {
		if (kick.value) {
			selected.value = 'b'
			condition.value = 'b'
		}
	})
	const disposeReader = watch(function () {
		kick.value
		seen.push(matched.value)
	})

	seen.length = 0
	kick.value = true
	await nextTick()
	assert.deepEqual(seen, [true])
	disposeWriter()
	disposeReader()
})
