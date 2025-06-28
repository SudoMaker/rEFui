import { Fn } from '../component.js'
import { read } from '../signal.js'

export function Parse({ text, parser }) {
	let currentText = ''
	let currentParser = null
	let currentRender = null

	return Fn({ name: 'Parse' }, function() {
		const newText = read(text)
		const newParser = read(parser)

		if (newText === currentText && currentParser === newParser) {
			return currentRender
		}

		currentText = newText
		currentParser = newParser

		return (currentRender = function(R) {
			return R.c(R.f, null, newParser(newText, R))
		})
	})
}
