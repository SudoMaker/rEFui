const RSet = class {
	constructor(arrayLike) {
		const __kPrev = Symbol('RSet::__kPrev')
		const __kNext = Symbol('RSet::__kNext')
		this.__kPrev = __kPrev
		this.__kNext = __kNext
		this._size = 0

		if (arrayLike) {
			this.fill(arrayLike)
		} else {
			this._front = null
			this._back = null
		}
	}

	add(item) {
		if (Object(item) !== item) {
			return this
		}

		const { __kPrev, __kNext } = this

		if (this._back) {
			if (item === this._back) {
				return this
			}

			const itemPrev = item[__kPrev]
			const itemNext = item[__kNext]

			if (item === this._front) {
				this._front = itemNext
			} else if (itemPrev) {
				itemPrev[__kNext] = itemNext
			}

			if (itemNext) {
				itemNext[__kPrev] = itemPrev
				item[__kNext] = null
			}

			this._back[__kNext] = item
			item[__kPrev] = this._back
			this._back = item

			if (!itemPrev && !itemNext) {
				this._size += 1
			}
		} else {
			this._front = item
			this._back = item
			item[__kPrev] = item[__kNext] = null
			this._size = 1
		}

		return this
	}

	fill(arrayLike) {
		this.clear()

		const arr = (Array.isArray(arrayLike) ? arrayLike : Array.from(arrayLike))
		if (arr.length) {
			let i = arr.length - 1
			let cur = arr[i]
			let next = null
			this._back = cur

			do {
				cur = arr[i]
				i -= 1
				if ((Object(cur) === cur) && !(cur[__kNext] || cur[__kPrev])) {
					if (next) {
						if (cur === next) {
							continue
						}
						next[__kPrev] = cur
					}

					cur[__kNext] = next
					next = cur
					this._size += 1
				}
			} while (i > 0)

			if (next) {
				next[__kPrev] = null
				this._front = next
			}
		}

		return this
	}

	delete(item) {
		if (!this.has(item)) {
			return false
		}

		const { __kPrev, __kNext } = this

		const itemPrev = item[__kPrev]
		const itemNext = item[__kNext]

		if (item === this._front) {
			this._front[__kPrev] = null
			this._front = itemNext
		}

		if (item === this._back) {
			this._back[__kNext] = null
			this._back = itemPrev
		}

		if (itemPrev) {
			itemPrev[__kNext] = itemNext
		}

		if (itemNext) {
			itemNext[__kPrev] = itemPrev
		}

		item[__kPrev] = item[__kNext] = null

		this._size -= 1

		return true
	}

	has(item) {
		return !!(
			this._size > 0
			&& (Object(item) === item)
			&& (
				item[this.__kNext]
				|| item[this.__kPrev]
				|| item == this._front
			)
		)
	}

	clear() {
		if (this._size <= 0) {
			return
		}

		const { __kPrev, __kNext } = this

		let next = this._front
		while (next) {
			const cur = next
			next = cur[__kNext]
			cur[__kPrev] = cur[__kNext] = null
		}

		this._front = this._back = null
		this._size = 0
	}

	*[Symbol.iterator]() {
		const { __kNext } = this

		let next = this._front
		while (next) {
			yield next
			next = next[__kNext]
		}
	}

	forEach(cb) {
		for (let i of this) cb(i)
	}

	get size() {
		return this._size
	}
}

export { RSet }
