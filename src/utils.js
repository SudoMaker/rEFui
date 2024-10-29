// eslint-disable-next-line no-empty-function
export const nop = () => {}

export const cached = (handler) => {
	const store = new Map()
	return (arg) => {
		let val = store.get(arg)
		if (!val) {
			val = handler(arg)
			store.set(arg, val)
		}
		return val
	}
}

export const cachedStrKeyNoFalsy = (handler) => {
	const store = {__proto__: null}
	return (key) => (store[key] || (store[key] = handler(key)))
}

export const removeFromArr = (arr, val) => {
  const index = arr.indexOf(val)
  if (index > -1) {
    arr.splice(index, 1)
  }
}

export const isPrimitive = (val) => Object(val) !== val

export const splitFirst = (val, splitter) => {
	const idx = val.indexOf(splitter)
	if (idx < 0) return [val]
	const front = val.slice(0, idx)
	const back = val.slice(idx + splitter.length, val.length)
	return [front, back]
}
