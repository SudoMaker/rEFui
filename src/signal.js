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

import { removeFromArr } from 'refui/utils'
import { isProduction } from 'refui/constants'

let sigID = 0
let ticking = false
let currentEffect = null
let currentDisposers = null
let currentResolve = null
let currentTick = null

let contextValid = true

let signalQueue = []
let effectQueue = []

// Scheduler part

function scheduleSignal(signalEffects) {
	return signalQueue.push(signalEffects)
}
function scheduleEffect(effects) {
	return effectQueue.push(effects)
}

// effectStore: [id, delCount, ...effects]
function flushRunQueue(queue) {
	const queueLength = queue.length
	for (let i = 0; i < queueLength; i++) {
		const effects = queue[i]
		const effectEnd = effects.length
		for (let j = 2; j < effectEnd; j++) {
			const effect = effects[j][0]
			if (!effect) {
				continue
			}
			effect.__refui_scheduled = Math.max(1, effect.__refui_scheduled + 1)
			effect.__refui_pending = false
		}
	}

	for (let i = 0; i < queueLength; i++) {
		const effects = queue[i]
		const effectEnd = effects.length
		for (let j = 2; j < effectEnd; j++) {
			const effect = effects[j][0]
			if (effect) {
				if (--effect.__refui_scheduled > 0) {
					effect.__refui_pending = true
				} else if (effect.__refui_scheduled === 0) {
					effect.__refui_pending = false
					effect()
				}
			}
		}
	}
}
function sortQueue(a, b) {
	return a[0] - b[0]
}
function flushQueues() {
	if (signalQueue.length || effectQueue.length) {
		while (signalQueue.length) {
			const _ = signalQueue
			signalQueue = []
			if (_.length > 1) {
				_.sort(sortQueue)
			}
			flushRunQueue(_)
		}
		while (effectQueue.length) {
			const _ = effectQueue
			effectQueue = []
			flushRunQueue(_)
		}

		return Promise.resolve().then(flushQueues)
	}
}

function tick() {
	if (!ticking) {
		ticking = true
		currentResolve()
	}
	return currentTick
}
function nextTick(cb, ...args) {
	if (args.length) {
		cb = cb.bind(null, ...args)
	}
	return tick().finally(cb)
}
function tickHandler(resolve) {
	currentResolve = resolve
}
function resetTick() {
	ticking = false
	currentTick = new Promise(tickHandler).then(flushQueues)
	currentTick.finally(resetTick)
}

// Signal part

function pure(cb) {
	cb._pure = true
	return cb
}

function isPure(cb) {
	return !!cb._pure
}

function _dispose_raw() {
	const count = this.length
	for (let i = 0; i < count; i++) this[i](true)
	this.length = 0
}
function _dispose_with_callback(dispose_raw, batch) {
	this(batch)
	dispose_raw(batch)
}
function _dispose_with_upstream(prevDisposers, batch) {
	if (!batch) {
		removeFromArr(prevDisposers, this)
	}
	this(batch)
}
function createDisposer(disposers, prevDisposers, cleanup) {
	let _cleanup = _dispose_raw.bind(disposers)

	if (cleanup) {
		_cleanup = _dispose_with_callback.bind(cleanup, _cleanup)
	}

	if (prevDisposers) {
		_cleanup = _dispose_with_upstream.bind(_cleanup, prevDisposers)
		prevDisposers.push(_cleanup)
	}

	return _cleanup
}

function collectDisposers(disposers, fn, cleanup) {
	const prevDisposers = currentDisposers
	const _dispose = createDisposer(disposers, prevDisposers, cleanup)
	currentDisposers = disposers
	try {
		fn()
	} finally {
		currentDisposers = prevDisposers
	}
	return _dispose
}

function _onDispose(cb) {
	const disposers = currentDisposers
	function cleanup(batch) {
		if (!batch) {
			removeFromArr(disposers, cleanup)
		}
		cb(batch)
	}
	disposers.push(cleanup)
	return cleanup
}

function onDispose(cb) {
	if (currentDisposers) {
		if (!isProduction && typeof cb !== 'function') {
			throw new TypeError(`Callback must be a function but got ${Object.prototype.toString.call(cb)}`)
		}
		return _onDispose(cb)
	}
	return cb
}

function useEffect(effect, ...args) {
	let cleanup = null
	let cancelled = false
	const _dispose = watch(function() {
		cleanup?.()
		cleanup = effect(...args)
	})
	const cancelEffect = function() {
		if (cancelled) {
			return
		}
		cancelled = true
		cleanup?.()
		_dispose()
	}
	onDispose(cancelEffect)
	return cancelEffect
}

const _invalidatedState = {
	disposers: null,
	effect: null,
	valid: false
}
function _invalidateFrozenState() {
	Object.assign(this, _invalidatedState)
}
function _frozen({ disposers, effect, valid }, ...args) {
	const prevDisposers = currentDisposers
	const prevEffect = currentEffect
	const prevContextValid = contextValid

	currentDisposers = disposers
	currentEffect = effect
	contextValid = valid

	try {
		return this(...args)
	} finally {
		currentDisposers = prevDisposers
		currentEffect = prevEffect
		contextValid = prevContextValid
	}
}
function freeze(
	fn,
	state = {
		disposers: currentDisposers,
		effect: currentEffect,
		valid: contextValid
	}
) {
	if (currentDisposers) {
		_onDispose(_invalidateFrozenState.bind(state))
	}
	return _frozen.bind(fn, state)
}

const untrack = freeze(function(fn, ...args) {
	return fn(...args)
}, _invalidatedState)

function vacuumEffectStore() {
	let delCount = this[1]
	if (!delCount) {
		return
	}
	const effectEnd = this.length

	if (delCount === effectEnd - 2) {
		this.length = 2
		this[1] = 0
		return
	}

	let i = 2

	for (; i < effectEnd; i++) {
		if (!this[i][0]) {
			delCount -= 1
			break
		}
	}

	let cursor = i
	i += 1

	for (; i < effectEnd && delCount > 0; i++) {
		if (this[i][0]) {
			this[cursor] = this[i]
			cursor += 1
		} else {
			delCount -= 1
		}
	}

	this.splice(cursor, i - cursor)
	this[1] = 0
}

function scheduleVacuum(effects) {
	if (effects[1] === 2) {
		nextTick(vacuumEffectStore.bind(effects))
	}
	effects[1] += 1
}

const Signal = class {
	constructor(value, compute) {
		if (!isProduction && new.target !== Signal) {
			throw new Error('Signal must not be extended!')
		}

		// effectStore: [id, delCount, ...effects]
		// eslint-disable-next-line no-plusplus
		const id = sigID++
		const userEffects = [id, 0]
		const signalEffects = [id, 0]
		const disposeCtx = currentDisposers

		const internals = {
			id,
			value,
			compute,
			disposeCtx,
			userEffects,
			signalEffects
		}

		Object.defineProperty(this, '_', {
			value: internals,
			writable: false,
			enumerable: false,
			configurable: false
		})

		if (compute) {
			watch(pure(this.set.bind(this, value)))
		} else if (isSignal(value)) {
			value.connect(pure(this.set.bind(this, value)))
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
		const { userEffects, signalEffects } = this._
		return !!(userEffects.length || signalEffects.length)
	}

	touch() {
		this.connect(currentEffect)
	}

	get() {
		this.connect(currentEffect)
		return this._.value
	}

	set(val) {
		const { compute, value } = this._
		val = compute ? peek(
			compute(
				read(val)
			)
		) : read(val)
		if (value !== val) {
			this._.value = val
			this.trigger()
		}
	}

	peek() {
		return this._.value
	}

	poke(val) {
		this._.value = val
	}

	trigger() {
		const { userEffects, signalEffects } = this._
		scheduleSignal(signalEffects)
		scheduleEffect(userEffects)
		tick()
	}

	refresh() {
		const { compute, value } = this._
		if (compute) {
			const val = peek(compute(value))
			if (value !== val) {
				this._.value = val
				this.trigger()
			}
		}
	}

	connect(effect, runImmediate = true) {
		if (!effect) {
			return
		}
		const { userEffects, signalEffects, disposeCtx } = this._
		const effects = isPure(effect) ? signalEffects : userEffects
		if (contextValid) {
			const container = [effect]
			effects.push(container)
			if (currentDisposers && currentDisposers !== disposeCtx) {
				_onDispose(function() {
					container[0] = null
					if (!--effect.__refui_scheduled && effect.__refui_pending) {
						effect.__refui_pending = false
						effect()
					}
					scheduleVacuum(effects)
				})
			}
			if (!Object.hasOwn(effect, '__refui_scheduled')) {
				Object.defineProperties(effect, {
					__refui_scheduled: {
						value: 0,
						writable: true
					},
					__refui_pending: {
						value: false,
						writable: true
					}
				})
			}
		}
		if (runImmediate && currentEffect !== effect) {
			effect()
		}
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

function watch(effect) {
	const prevEffect = currentEffect
	currentEffect = effect
	const _dispose = collectDisposers([], effect)
	currentEffect = prevEffect

	return _dispose
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
function tpl(strs, ...exprs) {
	const raw = { raw: strs }
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
	const sigCount = sigs.length
	for (let i = 0; i < sigCount; i++) {
		sigs[i].connect(effect, false)
	}
	if (runImmediate) {
		const prevEffect = currentEffect
		currentEffect = effect
		try {
			effect()
		} finally {
			currentEffect = prevEffect
		}
	}
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
		const derivedSig = signal(null, compute)
		let disposer = null

		const _dispose = function() {
			disposer?.()
		}

		sig.connect(pure(function() {
			_dispose()
			const newVal = peek(sig)
			if (!newVal) {
				return
			}

			untrack(function() {
				disposer = watch(function() {
					derivedSig.value = read(newVal[key])
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

	if (currentDisposers) {
		_onDispose(function() {
			conditionMap = new Map()
			conditionValMap = new Map()
		})
	}

	function match(condition) {
		let currentCondition = peek(condition)
		let matchSet = conditionMap.get(currentCondition)
		if (isSignal(condition)) {
			let matchSig = conditionValMap.get(condition)
			if (!matchSig) {
				matchSig = signal(currentCondition === currentVal, compute)
				conditionValMap.set(condition, matchSig)

				condition.connect(function() {
					currentCondition = peek(condition)
					if (matchSet) {
						removeFromArr(matchSet, matchSig)
					}
					matchSet = conditionMap.get(currentCondition)
					if (!matchSet) {
						matchSet = []
						conditionMap.set(currentCondition, matchSet)
					}
					matchSet.push(matchSig)
					matchSig.value = currentCondition === currentVal
				})

				if (currentDisposers) {
					_onDispose(function() {
						conditionValMap.delete(condition)
						if (matchSet.length === 1) conditionMap.delete(currentCondition)
						else removeFromArr(matchSet, matchSig)
					})
				}
			}
			return matchSig
		} else {
			if (!matchSet) {
				matchSet = []
				conditionMap.set(currentCondition, matchSet)
			}
			let matchSig = conditionValMap.get(currentCondition)
			if (!matchSig) {
				matchSig = signal(currentCondition === currentVal, compute)
				conditionValMap.set(currentCondition, matchSig)
				matchSet.push(matchSig)

				if (currentDisposers) {
					_onDispose(function() {
						conditionValMap.delete(currentCondition)
						if (matchSet.length === 1) {
							conditionMap.delete(currentCondition)
						} else {
							removeFromArr(matchSet, matchSig)
						}
					})
				}
			}
			return matchSig
		}
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
	scheduleEffect as schedule,
	tick,
	nextTick,
	collectDisposers,
	onCondition,
	onDispose,
	useEffect,
	untrack,
	freeze,
	contextValid
}
