import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import * as signalAPI from 'refui/signal'

test('signal runtime and declaration value exports stay in sync', async function () {
	const declaration = await readFile(new URL('../src/signal.d.ts', import.meta.url), 'utf8')
	const declared = new Set(
		Array.from(declaration.matchAll(/^export (?:const|class|function) (\w+)/gm), function(match) {
			return match[1]
		})
	)
	const runtime = new Set(Object.keys(signalAPI))

	assert.deepEqual([...runtime].filter(function(name) {
		return !declared.has(name)
	}), [])
	assert.deepEqual([...declared].filter(function(name) {
		return !runtime.has(name)
	}), [])
})
