// eslint-disable-next-line no-empty-function
export function nop() {}

export function cached(handler) {
	const store = new Map()
	return function(arg) {
		let val = store.get(arg)
		if (!val) {
			val = handler(arg)
			store.set(arg, val)
		}
		return val
	}
}

export function cachedStrKeyNoFalsy(handler) {
	const store = {__proto__: null}
	return function(key) {
		return (store[key] || (store[key] = handler(key)))
	}
}

export function removeFromArr(arr, val) {
  const index = arr.indexOf(val)
  if (index > -1) {
    arr.splice(index, 1)
  }
}

export function isPrimitive(val) {
	return Object(val) !== val
}
export function isThenable(val) {
	return val && val.then?.call
}

export function splitFirst(val, splitter) {
	const idx = val.indexOf(splitter)
	if (idx < 0) return [val]
	const front = val.slice(0, idx)
	const back = val.slice(idx + splitter.length, val.length)
	return [front, back]
}
