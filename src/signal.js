/* Copyright Yukino Song, SudoMaker Ltd.
 *
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * 	http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { nop, removeFromArr } from 'refui/utils'
import { isProduction } from 'refui/constants'

let ticking = false
let currentScope = null
let currentResolve = null
let currentTick = null

let contextValid = true

let signalQueue = []
let effectQueue = []

const SIGNAL_STATE = Symbol(isProduction ? '' : 'signalState')

const SIGNAL_VALUE = 0
const SIGNAL_COMPUTE = 1
const SIGNAL_EFFECTS = 2

const SCOPE_ACTIVE = 1
const SCOPE_VALID = 2
const SCOPE_PURE = 4
const SCOPE_CLEANUP_RESULT = 8
const SCOPE_SCHEDULED = 16
const SCOPE_PENDING = 32
const SCOPE_RUNNING = 64

// Scheduler part

function scheduleEffect(scope) {
	const flags = scope?.flags ?? 0
	if (!(flags & SCOPE_ACTIVE) || !scope.effect) return
	if (flags & SCOPE_RUNNING) {
		scope.flags = flags | SCOPE_PENDING
		return
	}
	if (flags & SCOPE_SCHEDULED) return
	scope.flags = flags | SCOPE_SCHEDULED
	const queue = flags & SCOPE_PURE ? signalQueue : effectQueue
	queue.push(scope)
	return queue.length
}

function flushRunQueue(queue) {
	const queueLength = queue.length
	for (let i = 0; i < queueLength; i++) queue[i].run()
}
function flushQueues() {
	if (signalQueue.length || effectQueue.length) {
		while (signalQueue.length) {
			const queue = signalQueue
			signalQueue = []
			flushRunQueue(queue)
		}
		while (effectQueue.length) {
			const queue = effectQueue
			effectQueue = []
			flushRunQueue(queue)
			if (signalQueue.length) break
		}

		if (signalQueue.length || effectQueue.length) {
			return Promise.resolve().then(flushQueues)
		}
	}
}


function tickHandler(resolve) {
	currentResolve = resolve
}
function resetTick() {
	ticking = false
	currentTick = new Promise(tickHandler).then(flushQueues)
	currentTick.finally(resetTick)
}
function _tick() {
	currentResolve()
	return currentTick
}
function tick() {
	if (!ticking) {
		ticking = true
		currentResolve()
		currentTick = currentTick.finally(_tick)
	}
	return currentTick
}
function nextTick(cb, ...args) {
	if (args.length) {
		cb = cb.bind(null, ...args)
	}
	return tick().finally(cb)
}

// Signal part

function pure(cb) {
	cb._pure = true
	return cb
}

function isPure(cb) {
	return !!cb._pure
}

function disposeStore(disposers) {
	if (!disposers) return
	const count = disposers.length
	for (let i = 0; i < count; i++) disposers[i](true)
}

function getCurrentDisposers() {
	if (!(currentScope?.flags & SCOPE_ACTIVE) || !contextValid) return
	if (!currentScope.disposers) currentScope.disposers = []
	return currentScope.disposers
}

class EffectScope {
	constructor(
		effect,
		cleanupResult = true,
		ownerDisposers = getCurrentDisposers(),
		sources = null,
		cleanup,
		disposers = null
	) {
		let flags = SCOPE_ACTIVE | (contextValid ? SCOPE_VALID : 0)
		if (effect) {
			flags |= (isPure(effect) ? SCOPE_PURE : 0)
				| (cleanupResult ? SCOPE_CLEANUP_RESULT : 0)
			this.effect = effect
		} else if (cleanup) this.cleanup = cleanup
		this.flags = flags
		this.disposers = disposers
		if (sources) this.sources = sources
		this.destroy = this._destroy.bind(this)
		if (contextValid && ownerDisposers) {
			this.ownerDisposers = ownerDisposers
			ownerDisposers.push(this.destroy)
		}
	}

	_cleanupEffect() {
		const disposers = this.disposers
		const dispose = this.dispose
		this.disposers = null
		if (dispose) this.dispose = null
		try {
			disposeStore(disposers)
		} finally {
			dispose?.()
		}
	}

	_call(fn, ...args) {
		const prevScope = currentScope
		const prevContextValid = contextValid
		currentScope = this
		contextValid = prevContextValid
			&& (this.flags & (SCOPE_ACTIVE | SCOPE_VALID)) === (SCOPE_ACTIVE | SCOPE_VALID)
		try {
			return fn(...args)
		} finally {
			currentScope = prevScope
			contextValid = prevContextValid
		}
	}

	run() {
		let flags = this.flags & ~SCOPE_SCHEDULED
		this.flags = flags
		if ((flags & (SCOPE_ACTIVE | SCOPE_VALID)) !== (SCOPE_ACTIVE | SCOPE_VALID) || !this.effect) return
		if (flags & SCOPE_RUNNING) {
			this.flags = flags | SCOPE_PENDING
			return
		}

		const prevScope = currentScope
		const prevContextValid = contextValid
		this.flags = flags | SCOPE_RUNNING
		currentScope = this
		contextValid = true
		try {
			if (this.disposers || this.dispose) this._cleanupEffect()
			if (!(this.flags & SCOPE_ACTIVE)) return
			if (isSignal(this.sources)) {
				subscribeSignal(this.sources, this)
			} else if (this.sources) {
				const sourceCount = this.sources.length
				for (let i = 0; i < sourceCount; i++) {
					subscribeSignal(this.sources[i], this)
				}
			}
			const dispose = this.effect()
			if ((this.flags & SCOPE_CLEANUP_RESULT) && typeof dispose === 'function') {
				if (this.flags & SCOPE_ACTIVE) this.dispose = dispose
				else dispose()
			}
		} finally {
			currentScope = prevScope
			contextValid = prevContextValid
			flags = this.flags & ~SCOPE_RUNNING
			this.flags = flags
			if ((flags & (SCOPE_PENDING | SCOPE_ACTIVE)) === (SCOPE_PENDING | SCOPE_ACTIVE)) {
				this.flags = flags & ~SCOPE_PENDING
				scheduleEffect(this)
			}
		}
	}

	_destroy(batch) {
		if (!(this.flags & SCOPE_ACTIVE)) return
		this.flags = 0
		const ownerDisposers = this.ownerDisposers
		try {
			if (!this.effect) {
				const cleanup = this.cleanup
				const disposers = this.disposers
				if (cleanup) this.cleanup = null
				this.disposers = null
				try {
					cleanup?.call(this, batch)
				} finally {
					disposeStore(disposers)
				}
				return
			}
			try {
				if (this.disposers || this.dispose) this._cleanupEffect()
			} finally {
				this.effect = null
				if (this.sources) this.sources = null
				this.disposers = null
			}
		} finally {
			if (ownerDisposers && !batch) {
				const ownerPosition = ownerDisposers.indexOf(this.destroy)
				if (ownerPosition !== -1) ownerDisposers[ownerPosition] = nop
			}
			if (ownerDisposers) this.ownerDisposers = null
		}
	}
}

function collectDisposers(fn, cleanup, disposers = [], ownerDisposers = getCurrentDisposers()) {
	const scope = new EffectScope(null, false, ownerDisposers, null, cleanup, disposers)
	try {
		scope._call(fn)
	} catch (error) {
		scope.cleanup = null
		try {
			scope.destroy()
		} catch (cleanupError) {
			throw new AggregateError(
				[error, cleanupError],
				'Failed to clean up a disposer scope after setup failed'
			)
		}
		throw error
	}
	return scope.destroy
}

function _onDispose(cb) {
	const disposers = getCurrentDisposers()
	function cleanup(batch) {
		if (!cb) return
		const current = cb
		cb = null
		current(batch)
	}
	disposers.push(cleanup)
	return cleanup
}

function onDispose(cb) {
	if ((currentScope?.flags & SCOPE_ACTIVE) && contextValid) {
		if (!isProduction && typeof cb !== 'function') {
			throw new TypeError(`Callback must be a function but got ${Object.prototype.toString.call(cb)}`)
		}
		return _onDispose(cb)
	}
	return cb
}

function createEffect(effect, cleanupResult) {
	const scope = new EffectScope(effect, cleanupResult)
	try {
		scope.run()
	} catch (error) {
		try {
			scope.destroy()
		} catch (cleanupError) {
			throw new AggregateError(
				[error, cleanupError],
				'Failed to clean up an effect after setup failed'
			)
		}
		throw error
	}
	return scope.destroy
}

function useEffect(effect, ...args) {
	return createEffect(effect.bind(null, ...args), true)
}

function _invalidateFrozenState() {
	this.scope = null
	this.valid = false
}
function _frozen({ scope, valid }, ...args) {
	const prevScope = currentScope
	const prevContextValid = contextValid

	currentScope = scope
	contextValid = valid && (!scope || !!(scope.flags & SCOPE_ACTIVE))

	try {
		return this(...args)
	} finally {
		currentScope = prevScope
		contextValid = prevContextValid
	}
}
function freeze(
	fn,
	state = {
		scope: currentScope,
		valid: contextValid
	}
) {
	onDispose(_invalidateFrozenState.bind(state))
	return _frozen.bind(fn, state)
}

const untrack = freeze(function(fn, ...args) {
	return fn(...args)
})

function scopeIsLive(scope) {
	return !!(
		scope?.effect
		&& (scope.flags & (SCOPE_ACTIVE | SCOPE_VALID)) === (SCOPE_ACTIVE | SCOPE_VALID)
	)
}

function subscribeSignal(sig, scope) {
	if (!contextValid || !scopeIsLive(scope)) return
	const state = sig[SIGNAL_STATE]
	const effects = state[SIGNAL_EFFECTS]
	if (!effects) {
		state[SIGNAL_EFFECTS] = scope
	} else if (effects instanceof Set) {
		effects.add(scope)
	} else if (effects !== scope) {
		if (scopeIsLive(effects)) state[SIGNAL_EFFECTS] = new Set([effects, scope])
		else state[SIGNAL_EFFECTS] = scope
	}
}

function trackSignal(sig) {
	if (currentScope?.effect) subscribeSignal(sig, currentScope)
}

function triggerSignal(sig) {
	const state = sig[SIGNAL_STATE]
	const effects = state[SIGNAL_EFFECTS]
	if (effects) {
		state[SIGNAL_EFFECTS] = null
		if (effects instanceof Set) {
			for (const scope of effects) scheduleEffect(scope)
		} else scheduleEffect(effects)
	}
	tick()
}

function signalConnected(sig) {
	const state = sig[SIGNAL_STATE]
	const effects = state[SIGNAL_EFFECTS]
	if (!effects) return false
	if (!(effects instanceof Set)) {
		if (scopeIsLive(effects)) return true
		state[SIGNAL_EFFECTS] = null
		return false
	}
	for (const scope of effects) {
		if (!scopeIsLive(scope)) effects.delete(scope)
	}
	if (!effects.size) {
		state[SIGNAL_EFFECTS] = null
		return false
	}
	if (effects.size === 1) state[SIGNAL_EFFECTS] = effects.values().next().value
	return true
}

function setSignal(sig, val) {
	const state = sig[SIGNAL_STATE]
	const compute = state[SIGNAL_COMPUTE]
	const newValue = read(val)
	const nextValue = compute ? peek(compute(newValue)) : newValue
	if (state[SIGNAL_VALUE] !== nextValue) {
		state[SIGNAL_VALUE] = nextValue
		triggerSignal(sig)
	}
}

const Signal = class {
	constructor(value, compute) {
		if (!isProduction && new.target !== Signal) {
			throw new Error('Signal must not be extended!')
		}

		Object.defineProperty(this, SIGNAL_STATE, {
			value: [value, compute, null],
			enumerable: false,
			configurable: false,
			writable: false
		})

		if (compute) {
			watch(pure(setSignal.bind(null, this, value)))
		} else if (isSignal(value)) {
			value.connect(pure(setSignal.bind(null, this, value)))
		}
	}

	static ensure(val) {
		if (isSignal(val)) {
			return val
		}
		return signal(val)
	}

	static ensureAll(...vals) {
		return vals.map(this.ensure)
	}

	get value() {
		return this.get()
	}

	set value(val) {
		this.set(val)
	}

	get connected() {
		return signalConnected(this)
	}

	touch() {
		trackSignal(this)
	}

	get() {
		trackSignal(this)
		return this[SIGNAL_STATE][SIGNAL_VALUE]
	}

	set(val) {
		setSignal(this, val)
	}

	peek() {
		return this[SIGNAL_STATE][SIGNAL_VALUE]
	}

	poke(val) {
		this[SIGNAL_STATE][SIGNAL_VALUE] = val
	}

	trigger() {
		triggerSignal(this)
	}

	refresh() {
		const state = this[SIGNAL_STATE]
		const compute = state[SIGNAL_COMPUTE]
		if (compute) {
			const nextValue = peek(compute(state[SIGNAL_VALUE]))
			if (state[SIGNAL_VALUE] !== nextValue) {
				state[SIGNAL_VALUE] = nextValue
				triggerSignal(this)
			}
		}
	}

	connect(effect, runImmediate = true) {
		connectSignals(this, effect, runImmediate)
	}

	hasValue() {
		const val = this.get()
		return val !== undefined && val !== null
	}

	inverse() {
		return signal(this, function(i) {
			return !i
		})
	}

	nullishThen(val) {
		return signal(this, function(i) {
			const _val = read(val)
			return (i === undefined || i === null) ? _val : i
		})
	}

	choose(trueVal, falseVal) {
		return signal(this, function(i) {
			const _trueVal = read(trueVal)
			const _falseVal = read(falseVal)
			return i ? trueVal : falseVal
		})
	}

	select(options) {
		return signal(this, function (i) {
			const _options = read(options)
			return Reflect.get(_options, i)
		})
	}

	and(val) {
		return signal(this, function(i) {
			const _val = read(val)
			return i && _val
		})
	}

	andNot(val) {
		return signal(this, function(i) {
			const _val = read(val)
			return i && !_val
		})
	}

	andOr(andVal, orVal) {
		return signal(this, function(i) {
			const _andVal = read(andVal)
			const _orVal = read(orVal)
			return i && _andVal || orVal
		})
	}

	inverseAnd(val) {
		return signal(this, function(i) {
			const _val = read(val)
			return !i && _val
		})
	}

	inverseAndNot(val) {
		return signal(this, function(i) {
			const _val = read(val)
			return !i && !_val
		})
	}

	inverseAndOr(andVal, orVal) {
		return signal(this, function(i) {
			const _andVal = read(andVal)
			const _orVal = read(orVal)
			return !i && _andVal || orVal
		})
	}

	or(val) {
		return signal(this, function(i) {
			const _val = read(val)
			return i || _val
		})
	}

	orNot(val) {
		return signal(this, function(i) {
			const _val = read(val)
			return i || !_val
		})
	}

	inverseOr(val) {
		return signal(this, function(i) {
			const _val = read(val)
			return !i || _val
		})
	}

	inverseOrNot(val) {
		return signal(this, function(i) {
			const _val = read(val)
			return !i || !_val
		})
	}

	eq(val) {
		return signal(this, function(i) {
			return i === read(val)
		})
	}

	neq(val) {
		return signal(this, function(i) {
			return i !== read(val)
		})
	}

	gt(val) {
		return signal(this, function(i) {
			return i > read(val)
		})
	}

	lt(val) {
		return signal(this, function(i) {
			return i < read(val)
		})
	}

	gte(val) {
		return signal(this, function(i) {
			return i >= read(val)
		})
	}

	lte(val) {
		return signal(this, function(i) {
			return i <= read(val)
		})
	}

	toJSON() {
		return this.get()
	}

	*[Symbol.iterator]() {
		yield* this.get()
	}

	[Symbol.toPrimitive](hint) {
		const val = this.get()
		switch (hint) {
			case 'string':
				return String(val)
			case 'number':
				return Number(val)
			default:
				if (Object(val) !== val) {
					return val
				}
				return !!val
		}
	}
}

function signal(value, compute) {
	return new Signal(value, compute)
}

Object.defineProperties(signal, {
	ensure: {
		value: Signal.ensure.bind(Signal),
		enumerable: true
	},
	ensureAll: {
		value: Signal.ensureAll.bind(Signal),
		enumerable: true
	}
})

function isSignal(val) {
	return val && val.constructor === Signal
}

function connectSignals(signals, effect, runImmediate = true) {
	if (!effect) return
	const ownerDisposers = getCurrentDisposers()
	const scope = new EffectScope(effect, false, null, signals)
	ownerDisposers?.push(scope.destroy)
	if (runImmediate) {
		try {
			scope.run()
		} catch (error) {
			scope.destroy()
			throw error
		}
	} else if (isSignal(signals)) {
		subscribeSignal(signals, scope)
	} else {
		const signalCount = signals.length
		for (let i = 0; i < signalCount; i++) {
			subscribeSignal(signals[i], scope)
		}
	}
}
function watch(effect) {
	return createEffect(effect, false)
}

function peek(val) {
	while (isSignal(val)) {
		val = val.peek()
	}
	return val
}

function poke(val, newVal) {
	if (isSignal(val)) {
		return val.poke(newVal)
	}
	return newVal
}

function touch(...vals) {
	const valCount = vals.length
	for (let i = 0; i < valCount; i++) {
		if (isSignal(vals[i])) {
			vals[i].touch()
		}
	}
}

function read(val) {
	if (isSignal(val)) {
		val = peek(val.get())
	}
	return val
}

function readAll(...vals) {
	return vals.map(read)
}

function _write(val, newVal) {
	if (typeof newVal === 'function') {
		newVal = newVal(peek(val))
	}
	val.value = newVal
	return peek(val)
}

function write(val, newVal) {
	if (isSignal(val)) {
		return _write(val, newVal)
	}
	if (typeof newVal === 'function') {
		return newVal(val)
	}
	return newVal
}

function listen(vals, cb) {
	const valCount = vals.length
	for (let i = 0; i < valCount; i++) {
		if (isSignal(vals[i])) {
			vals[i].connect(cb)
		}
	}
}

function computed(fn) {
	return signal(null, fn)
}
function _merged(vals) {
	return this(...readAll(...vals))
}
function merge(vals, handler) {
	return computed(_merged.bind(handler, vals))
}
function tpl(raw, ...exprs) {
	if (!Array.isArray(raw)) {
		raw = [raw]
	}
	raw = { raw }
	return signal(null, function() {
		return String.raw(raw, ...exprs)
	})
}

function dummyDeferrer(cb) {
	let cancelled = false
	nextTick(function() {
		if (cancelled) return
		cb()
	})

	return function() {
		cancelled = true
	}
}
function createDefer(deferrer = dummyDeferrer) {
	return function(fn, onAbort) {
		const deferredSignal = signal()
		const commit = Signal.prototype.set.bind(deferredSignal)

		let dispose = null
		let cleanup = null
		function callback() {
			if (!dispose) return
			cleanup = fn(commit)
		}

		let run = function() {
			callback()
			run = function() {
				if (!dispose) return
				cleanup?.()
				cleanup = deferrer(callback)
			}
		}

		const frozenWatch = freeze(watch)
		dispose = deferrer(function() {
			if (!dispose) return
			dispose = frozenWatch(function() {
				run()
			})
		})

		function handleAbort() {
			if (cleanup) {
				cleanup()
				cleanup = null
			}
		}

		onDispose(function() {
			handleAbort()
			if (dispose) {
				dispose()
				dispose = null
			}
		})

		onAbort?.(handleAbort)

		return deferredSignal
	}
}
const deferred = createDefer()

function createSchedule(deferrer, onAbort) {
	const _deferred = createDefer(deferrer)
	const [onFlush, triggerFlush] = useAction()

	let pending = 0
	let cancelFlush = null

	function _flush() {
		if (cancelFlush) {
			cancelFlush = null
			triggerFlush()
		}
	}

	const flush = nextTick.bind(null, _flush)

	function scheduleFlush() {
		pending = Math.max(0, pending - 1)
		if (!pending && !cancelFlush) {
			cancelFlush = deferrer(flush)
		}
	}

	function scheduled(fn) {
		let _commit = null
		let _val = null
		let _valChanged = false

		const wrappedFn = (function() {
			if (isSignal(fn)) {
				return function(commit) {
					pending += 1
					_commit = commit
					_val = fn.value
					nextTick(scheduleFlush)
					return scheduleFlush
				}
			} else {
				let _cleanup = null
				function wrappedCommit(val) {
					if (_val === val) {
						return
					}
					_valChanged = true
					_val = val
					scheduleFlush()
				}
				function wrappedCleanup() {
					_cleanup?.()
					scheduleFlush()
				}
				return function(commit) {
					pending += 1
					_commit = commit
					_cleanup = fn(wrappedCommit)
					return wrappedCleanup
				}
			}
		})()

		onAbort?.(function() {
			_commit = null
		})

		onFlush(function() {
			if (_valChanged && _commit) {
				_commit(_val)
				_commit = null
				_valChanged = false
			}
		})

		return _deferred(wrappedFn, onAbort)
	}

	onAbort?.(function() {
		cancelFlush?.()
		cancelFlush = null
	})

	return scheduled
}

function connect(sigs, effect, runImmediate = true) {
	connectSignals(sigs, effect, runImmediate)
}

function bind(handler, val) {
	if (isSignal(val)) {
		val.connect(function() {
			handler(val.peek())
		})
	}
	else if (typeof val === 'function') {
		watch(function() {
			handler(val())
		})
	} else {
		handler(val)
	}
}

function useAction(val, compute) {
	val = signal(val, compute)
	function onAction(cb) {
		val.connect(function() {
			cb(val.peek())
		}, false)
	}
	function trigger(newVal) {
		val.value = newVal
		val.trigger()
	}
	return [onAction, trigger, val.touch.bind(val)]
}

function derive(sig, key, compute) {
	if (isSignal(sig)) {
		const derivedSig = signal()
		let disposer = null

		const _dispose = function() {
			disposer?.()
		}

		sig.connect(pure(function() {
			_dispose()
			const newVal = peek(sig)
			if (newVal === undefined || newVal === null) {
				derivedSig.value = undefined
				return
			}

			untrack(function() {
				disposer = watch(function() {
					const value = read(newVal[key])
					derivedSig.value = compute ? peek(compute(value)) : value
				})
			})
		}))

		onDispose(_dispose)

		return derivedSig
	} else {
		return signal(sig[key], compute)
	}
}

function extract(sig, ...extractions) {
	if (!extractions.length) {
		extractions = Object.keys(peek(sig))
	}

	return extractions.reduce(function(mapped, i) {
		mapped[i] = signal(sig, function(val) {
			return val && peek(val[i])
		})
		return mapped
	}, {})
}
function derivedExtract(sig, ...extractions) {
	if (!extractions.length) {
		extractions = Object.keys(peek(sig))
	}

	return extractions.reduce(function(mapped, i) {
		mapped[i] = derive(sig, i)
		return mapped
	}, {})
}

function makeReactive(obj) {
	return Object.defineProperties({}, Object.entries(obj).reduce(function(descriptors, [key, value]) {
		if (isSignal(value)) {
			descriptors[key] = {
				get: value.get.bind(value),
				set: value.set.bind(value),
				enumerable: true,
				configurable: false
			}
		} else {
			descriptors[key] = {
				value,
				enumerable: true
			}
		}

		return descriptors
	}, {}))
}

function onCondition(sig, compute) {
	let currentVal = null
	let conditionMap = new Map()
	let conditionValMap = new Map()

	function getMatchSet(conditionVal) {
		let matchSet = conditionMap.get(conditionVal)
		if (!matchSet) {
			matchSet = []
			conditionMap.set(conditionVal, matchSet)
		}
		return matchSet
	}

	function removeEntry(key, entry) {
		if (conditionValMap.get(key) !== entry) {
			return
		}
		conditionValMap.delete(key)
		removeFromArr(entry.matchSet, entry.matchSig)
		if (!entry.matchSet.length) {
			conditionMap.delete(entry.currentCondition)
		}
		entry.dispose()
	}

	function retainEntry(key, entry) {
		if (!(currentScope?.flags & SCOPE_ACTIVE) || !contextValid) {
			entry.persistent = true
			return
		}

		entry.refs += 1
		onDispose(function () {
			entry.refs -= 1
			if (!entry.refs && !entry.persistent) {
				removeEntry(key, entry)
			}
		})
	}

	function createEntry(key, condition, currentCondition) {
		const entry = {
			currentCondition,
			dispose: null,
			matchSet: getMatchSet(currentCondition),
			matchSig: null,
			persistent: false,
			refs: 0
		}

		entry.dispose = untrack(function () {
			return collectDisposers(function () {
				entry.matchSig = signal(currentCondition === currentVal, compute)
				if (isSignal(condition)) {
					condition.connect(function () {
						removeFromArr(entry.matchSet, entry.matchSig)
						if (!entry.matchSet.length) {
							conditionMap.delete(entry.currentCondition)
						}

						entry.currentCondition = peek(condition)
						entry.matchSet = getMatchSet(entry.currentCondition)
						entry.matchSet.push(entry.matchSig)
						entry.matchSig.value = entry.currentCondition === currentVal
					}, false)
				}
			})
		})

		entry.matchSet.push(entry.matchSig)
		conditionValMap.set(key, entry)
		return entry
	}

	sig.connect(
		pure(function() {
			const newVal = peek(sig)
			if (currentVal !== newVal) {
				const prevMatchSet = conditionMap.get(currentVal)
				const newMatchSet = conditionMap.get(newVal)

				currentVal = newVal

				if (prevMatchSet) {
					const size = prevMatchSet.length
					for (let i = 0; i < size; i++) prevMatchSet[i].value = false
				}
				if (newMatchSet) {
					const size = newMatchSet.length
					for (let i = 0; i < size; i++) newMatchSet[i].value = true
				}
			}
		})
	)

	if ((currentScope?.flags & SCOPE_ACTIVE) && contextValid) {
		onDispose(function() {
			for (const entry of conditionValMap.values()) {
				entry.dispose()
			}
			conditionMap = new Map()
			conditionValMap = new Map()
		})
	}

	function match(condition) {
		const conditionIsSignal = isSignal(condition)
		const currentCondition = peek(condition)
		const key = conditionIsSignal ? condition : currentCondition
		const entry = conditionValMap.get(key) || createEntry(key, condition, currentCondition)
		retainEntry(key, entry)
		return entry.matchSig
	}

	return match
}

resetTick()

export {
	Signal,
	signal,
	isSignal,
	computed,
	createDefer,
	createSchedule,
	deferred,
	connect,
	bind,
	useAction,
	derive,
	extract,
	derivedExtract,
	makeReactive,
	tpl,
	watch,
	peek,
	poke,
	touch,
	read,
	readAll,
	merge,
	write,
	listen,
	tick,
	nextTick,
	collectDisposers,
	onCondition,
	onDispose,
	useEffect,
	untrack,
	freeze,
	contextValid,
	EffectScope
}
