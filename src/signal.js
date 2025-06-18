import { nop, removeFromArr } from './utils.js'

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

const scheduleSignal = signalEffects => signalQueue.add(signalEffects)
const scheduleEffect = effects => effectQueue.add(effects)

const flushRunQueue = () => {
	for (let i of runQueue) i()
	runQueue.clear()
}

const flushQueue = (queue, sorted) => {
	while (queue.size) {
		const queueArr = Array.from(queue)
		queue.clear()

		if (sorted && queueArr.length > 1) {
			queueArr.sort((a, b) => a._id - b._id)
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

const tick = () => {
	if (!ticking) {
		ticking = true
		currentResolve()
	}
	return currentTick
}

const nextTick = cb => tick().then(cb)

const flushQueues = () => {
	if (signalQueue.size || effectQueue.size) {
		flushQueue(signalQueue, true)
		signalQueue = new Set(signalQueue)
		flushQueue(effectQueue)
		effectQueue = new Set(effectQueue)
		return Promise.resolve().then(flushQueues)
	}
}
const tickHandler = (resolve) => {
	currentResolve = resolve
}
const resetTick = () => {
	ticking = false
	currentTick = new Promise(tickHandler).then(flushQueues)
	currentTick.finally(resetTick)
}

// Signal part

const pure = (cb) => {
	cb._pure = true
	return cb
}

const isPure = cb => !!cb._pure

function _dispose_raw() {
	for (let i of this) i(true)
	this.length = 0
}
function _dispose_with_callback(dispose_raw, batch) {
	this(batch)
	dispose_raw(batch)
}
function _dispose_with_upstream(prevDisposers, batch) {
	if (!batch) removeFromArr(prevDisposers, this)
	this(batch)
}
const createDisposer = (disposers, prevDisposers, cleanup) => {
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

const collectDisposers = (disposers, fn, cleanup) => {
	const prevDisposers = currentDisposers
	const _dispose = createDisposer(disposers, prevDisposers, cleanup)
	currentDisposers = disposers
	fn()
	currentDisposers = prevDisposers
	return _dispose
}

const _onDispose = (cb) => {
	const disposers = currentDisposers
	const cleanup = (batch) => {
		if (!batch) removeFromArr(disposers, cleanup)
		cb(batch)
	}
	disposers.push(cleanup)
	return cleanup
}

const onDispose = (cb) => {
	if (currentDisposers) {
		return _onDispose(cb)
	}
	return nop
}

const useEffect = (effect) => {
	onDispose(effect())
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

const freeze = (fn) => _frozen.bind(fn, currentDisposers, currentEffect)

const untrack = (fn) => {
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
		if (process.env.NODE_ENV === 'development' && new.target !== Signal) throw new Error('Signal must not be extended!')

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

	connect(effect) {
		if (!effect) return
		const { userEffects, signalEffects, disposeCtx } = this._
		const effects = isPure(effect) ? signalEffects : userEffects
		if (!effects.includes(effect)) {
			effects.push(effect)
			if (currentDisposers && currentDisposers !== disposeCtx) {
				_onDispose(() => {
					removeFromArr(effects, effect)
					if (runQueue.size) runQueue.delete(effect)
				})
			}
		}
		if (currentEffect !== effect) effect()
	}

	and(val) {
		return signal(this, i => read(val) && i)
	}

	or(val) {
		return signal(this, i => read(val) || i)
	}

	eq(val) {
		return signal(this, i => read(val) === i)
	}

	neq(val) {
		return signal(this, i => read(val) !== i)
	}

	gt(val) {
		return signal(this, i => i > read(val))
	}

	lt(val) {
		return signal(this, i => i < read(val))
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
				if (Object(val) !== val) return val
				return !!val
		}
	}
}

const isSignal = val => val && val.constructor === Signal

const watch = (effect) => {
	const prevEffect = currentEffect
	currentEffect = effect
	const _dispose = collectDisposers([], effect)
	currentEffect = prevEffect

	return _dispose
}

const peek = (val) => {
	while (isSignal(val)) {
		val = val.peek()
	}
	return val
}

const poke = (val, newVal) => {
	if (isSignal(val)) return val.poke(newVal)
	return newVal
}

const read = (val) => {
	if (isSignal(val)) val = peek(val.get())
	return val
}

const readAll = (vals, handler) => handler(...vals.map(read))

const _write = (val, newVal) => {
	if (typeof newVal === 'function') newVal = newVal(peek(val))
	val.value = newVal
	return peek(val)
}

const write = (val, newVal) => {
	if (isSignal(val)) return _write(val, newVal)
	if (typeof newVal === 'function') return newVal(val)
	return newVal
}

const listen = (vals, cb) => {
	for (let val of vals) {
		if (isSignal(val)) {
			val.connect(cb)
		}
	}
}

const signal = (value, compute) => new Signal(value, compute)

const computed = fn => signal(null, fn)
const merge = (vals, handler) => computed(readAll.bind(null, vals, handler))
const tpl = (strs, ...exprs) => {
	const raw = { raw: strs }
	return signal(null, () => String.raw(raw, ...exprs))
}

const connect = (sigs, effect) => {
	const prevEffect = currentEffect
	currentEffect = effect
	for (let sig of sigs) {
		sig.connect(effect)
	}
	effect()
	currentEffect = prevEffect
}

const bind = (handler, val) => {
	if (isSignal(val)) val.connect(() => handler(peek(val)))
	else if (typeof val === 'function') watch(() => handler(val()))
	else handler(val)
}

const derive = (sig, key, compute) => {
	if (isSignal(sig)) {
		const derivedSig = signal(null, compute)
		let disposer = null

		const _dispose = () => {
			if (disposer) {
				disposer()
				disposer = null
			}
		}

		sig.connect(pure(() => {
			_dispose()
			const newVal = peek(sig)
			if (!newVal) return

			untrack(() => {
				disposer = watch(() => {
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

const extract = (sig, ...extractions) => {
	if (!extractions.length) {
		extractions = Object.keys(peek(sig))
	}

	return extractions.reduce((mapped, i) => {
		mapped[i] = signal(sig, val => val && peek(val[i]))
		return mapped
	}, {})
}
const derivedExtract = (sig, ...extractions) => {
	if (!extractions.length) {
		extractions = Object.keys(peek(sig))
	}

	return extractions.reduce((mapped, i) => {
		mapped[i] = derive(sig, i)
		return mapped
	}, {})
}

const makeReactive = (obj) => Object.defineProperties({}, Object.entries(obj).reduce((descriptors, [key, value]) => {
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

const onCondition = (sig, compute) => {
	let currentVal = null
	let conditionMap = new Map()
	let conditionValMap = new Map()
	sig.connect(
		pure(() => {
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
		_onDispose(() => {
			conditionMap = new Map()
			conditionValMap = new Map()
		})
	}

	const match = (condition) => {
		let currentCondition = peek(condition)
		let matchSet = conditionMap.get(currentCondition)
		if (isSignal(condition)) {
			let matchSig = conditionValMap.get(condition)
			if (!matchSig) {
				matchSig = signal(currentCondition === currentVal, compute)
				conditionValMap.set(condition, matchSig)

				condition.connect(() => {
					currentCondition = peek(condition)
					if (matchSet) removeFromArr(matchSet, matchSig)
					matchSet = conditionMap.get(currentCondition)
					if (!matchSet) {
						matchSet = []
						conditionMap.set(currentCondition, matchSet)
					}
					matchSet.push(matchSig)
					matchSig.value = currentCondition === currentVal
				})

				if (currentDisposers) {
					_onDispose(() => {
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
					_onDispose(() => {
						conditionValMap.delete(currentCondition)
						if (matchSet.length === 1) conditionMap.delete(currentCondition)
						else removeFromArr(matchSet, matchSig)
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
	derive,
	extract,
	derivedExtract,
	makeReactive,
	tpl,
	watch,
	peek,
	poke,
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
