import { signal, watch, read } from '../signal.js'
import { For } from '../component.js'

export function UnKeyed({ entries, ...args }, item) {
	const rawSigEntries = []
	const sigEntries = signal(rawSigEntries)

	watch(function() {
		const rawEntries = read(entries)
		const oldLength = rawSigEntries.length
		rawSigEntries.length = rawEntries.length
		for (let i in rawEntries) {
			if (rawSigEntries[i]) rawSigEntries[i].value = rawEntries[i]
			else rawSigEntries[i] = signal(rawEntries[i])
		}

		if (oldLength !== rawEntries.length) sigEntries.trigger()
	})

	return function(R) {
		return R.c(For, { name: 'UnKeyed', entries: sigEntries, ...args }, item)
	}
}
