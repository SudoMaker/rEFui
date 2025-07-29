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

let signalQueue = new Set()
let effectQueue = new Set()
let runQueue = new Set()

// Scheduler part

function scheduleSignal(signalEffects) {
	return signalQueue.add(signalEffects)
}
function scheduleEffect(effects) {
	return effectQueue.add(effects)
}

function flushRunQueue() {
	for (let i of runQueue) i()
	runQueue.clear()
}

function sortQueue(a, b) {
	return a._id - b._id
}
function flushQueue(queue, sorted) {
	while (queue.size) {
		const queueArr = Array.from(queue)
		queue.clear()

		if (sorted && queueArr.length > 1) {
			queueArr.sort(sortQueue)
			const tempArr = [...(new Set([].concat(...queueArr).reverse()))].reverse()
			runQueue = new Set(tempArr)
		} else if (queueArr.length > 10000) {
			let flattenedArr = []
			for (let i = 0; i < queueArr.length; i += 10000) {
				flattenedArr = flattenedArr.concat(...queueArr.slice(i, i + 10000))
			}
			runQueue = new Set(flattenedArr)
		} else {
			runQueue = new Set([].concat(...queueArr))
		}
		flushRunQueue()
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

function flushQueues() {
	if (signalQueue.size || effectQueue.size) {
		flushQueue(signalQueue, true)
		signalQueue = new Set(signalQueue)
		flushQueue(effectQueue)
		effectQueue = new Set(effectQueue)
		return Promise.resolve().then(flushQueues)
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

// Signal part

function pure(cb) {
	cb._pure = true
	return cb
}

function isPure(cb) {
	return !!cb._pure
}

function _dispose_raw() {
	for (let i of this) i(true)
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

function _frozen(capturedDisposers, capturedEffects, ...args) {
	const prevDisposers = currentDisposers
	const prevEffect = currentEffect

	currentDisposers = capturedDisposers
	currentEffect = capturedEffects

	try {
		return this(...args)
	} finally {
		currentDisposers = prevDisposers
		currentEffect = prevEffect
	}
}

function freeze(fn) {
 return _frozen.bind(fn, currentDisposers, currentEffect)
}

function untrack(fn) {
	const prevDisposers = currentDisposers
	const prevEffect = currentEffect

	currentDisposers = null
	currentEffect = null

	try {
		return fn()
	} finally {
		currentDisposers = prevDisposers
		currentEffect = prevEffect
	}
}

const Signal = class {
	constructor(value, compute) {
		if (!isProduction && new.target !== Signal) {
			throw new Error('Signal must not be extended!')
		}

		// eslint-disable-next-line no-plusplus
		const id = sigID++
		const userEffects = []
		const signalEffects = []
		const disposeCtx = currentDisposers

		userEffects._id = id
		signalEffects._id = id

		const internal = {
			id,
			value,
			compute,
			disposeCtx,
			userEffects,
			signalEffects
		}

		Object.defineProperty(this, '_', {
			value: internal,
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
		val = compute ? peek(compute(read(val))) : read(val)
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
		if (!effects.includes(effect)) {
			effects.push(effect)
			if (currentDisposers && currentDisposers !== disposeCtx) {
				_onDispose(function() {
					removeFromArr(effects, effect)
					if (runQueue.size) {
						runQueue.delete(effect)
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
	for (let i of vals) {
		if (isSignal(i)) {
			i.touch()
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
	for (let val of vals) {
		if (isSignal(val)) {
			val.connect(cb)
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

function not(val) {
	return signal(null, function() {
		return !read(val)
	})
}

function connect(sigs, effect, runImmediate = true) {
	for (let sig of sigs) {
		sig.connect(effect, false)
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
	return [onAction, trigger]
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
					for (let i of prevMatchSet) i.value = false
				}
				if (newMatchSet) {
					for (let i of newMatchSet) i.value = true
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
	connect,
	bind,
	useAction,
	derive,
	extract,
	derivedExtract,
	makeReactive,
	tpl,
	not,
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
	freeze
}
