// eslint-disable-next-line no-empty-function
const nop = () => {}

const cached = (handler) => {
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

const removeFromArr = (arr, val) => {
  const index = arr.indexOf(val)
  if (index > -1) {
    arr.splice(index, 1)
  }
}

export { nop, cached, removeFromArr }
