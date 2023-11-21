import { removeFromArr } from './utils.js'

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

const flushQueue = (queue, sorted) => {
		const queueArr = Array.from(queue)

		if (sorted && queueArr.length > 1) {
			queueArr.sort((a, b) => a._id - b._id)
			for (let effects of queueArr) {
				for (let i of effects) {
					runQueue.delete(i)
					runQueue.add(i)
				}
			}
		} else {
			runQueue = new Set([].concat(...queueArr.map(i => [...i])))
		}
		for (let i of Array.from(runQueue)) i()
		runQueue = new Set()
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
	flushQueue(signalQueue, true)
	signalQueue = new Set()
	flushQueue(effectQueue)
	effectQueue = new Set()
	return Promise.resolve().then(() => {
		if (signalQueue.size || effectQueue.size) {
			return flushQueues()
		}
	})
}

const resetTick = () => {
	ticking = false
	currentTick = new Promise((resolve) => {
		currentResolve = resolve
	}).then(flushQueues)
	currentTick.finally(resetTick)
}

// Signal part

const pure = (cb) => {
	cb._pure = true
	return cb
}

const isPure = cb => !!cb._pure

const createDisposer = (disposers, prevDisposers, dispose) => {
	let _dispose = () => {
		for (let i of disposers) i(true)
		disposers.length = 0
	}
	if (dispose) {
		const __dispose = _dispose
		_dispose = (batch) => {
			dispose(batch)
			__dispose(batch)
		}
	}
	if (prevDisposers) {
		const __dispose = _dispose
		_dispose = (batch) => {
			if (!batch) removeFromArr(prevDisposers, _dispose)
			__dispose(batch)
		}
		prevDisposers.push(_dispose)
	}

	return _dispose
}

const collectDisposers = (disposers, fn, dispose) => {
	const prevDisposers = currentDisposers
	const _dispose = createDisposer(disposers, prevDisposers, dispose)
	currentDisposers = disposers
	fn()
	currentDisposers = prevDisposers
	return _dispose
}

const _onDispose = (cb) => {
	const disposers = currentDisposers
	const dispose = (batch) => {
		if (!batch) removeFromArr(disposers, dispose)
		cb(batch)
	}
	disposers.push(dispose)
	return dispose
}

const onDispose = (cb) => {
	if (currentDisposers) {
		return _onDispose(cb)
	}
}

const untrack = (fn) => {
	const prevDisposers = currentDisposers
	currentDisposers = null
	const ret = fn()
	currentDisposers = prevDisposers
	return ret
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

		this._ = internal

		if (compute) {
			watch(pure(() => this.set(value)))
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

	get() {
		this.connect(currentEffect)
		return this._.value
	}

	set(val) {
		const { compute, value } = this._
		val = compute ? read(compute(read(val))) : read(val)
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

	isEmpty() {
		const { userEffects, signalEffects } = this._
		return !(userEffects.length || signalEffects.length)
	}

	connect(effect) {
		if (!effect) return
		const { userEffects, signalEffects, disposeCtx } = this._
		const effects = isPure(effect) ? signalEffects : userEffects
		if (effects.indexOf(effect) < 0) {
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

	toJSON() {
		return this.value
	}

	*[Symbol.iterator]() {
		const val = this.value
		for (let i of val) {
			yield i
		}
	}

	[Symbol.toPrimitive](hint) {
		const val = this.value
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

const read = (val) => {
	if (isSignal(val)) return val.value
	return val
}

const peek = (val) => {
	if (isSignal(val)) return val.peek()
	return val
}

const poke = (val, newVal) => {
	if (isSignal(val)) return val.poke(newVal)
	return newVal
}

const _write = (val, newVal) => {
	if (typeof newVal === 'function') newVal = newVal(val.peek())
	val.value = newVal
	return val.peek()
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

const extract = (sig, ...extractions) => extractions.map(i => signal(sig, val => val && val[i]))

const onCondition = (sig, compute) => {
	let currentVal = null
	let conditionMap = new Map()
	let conditionValMap = new Map()
	sig.connect(
		pure(() => {
			const newVal = sig.peek()
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
					currentCondition = condition.peek()
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
	extract,
	tpl,
	watch,
	peek,
	poke,
	read,
	write,
	listen,
	scheduleEffect as schedule,
	tick,
	nextTick,
	collectDisposers,
	onCondition,
	onDispose,
	untrack
}
