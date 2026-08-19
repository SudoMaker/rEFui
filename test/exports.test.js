import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import * as componentsAPI from 'refui/components'
import * as signalAPI from 'refui/signal'

async function assertDeclarationExportsMatch(runtimeAPI, declarationPath) {
	const declaration = await readFile(new URL(declarationPath, import.meta.url), 'utf8')
	const declared = new Set(
		Array.from(declaration.matchAll(/^export (?:const|class|function) (\w+)/gm), function(match) {
			return match[1]
		})
	)
	const runtime = new Set(Object.keys(runtimeAPI))

	assert.deepEqual([...runtime].filter(function(name) {
		return !declared.has(name)
	}), [])
	assert.deepEqual([...declared].filter(function(name) {
		return !runtime.has(name)
	}), [])
}

test('signal runtime and declaration value exports stay in sync', async function () {
	await assertDeclarationExportsMatch(signalAPI, '../src/signal.d.ts')
})

test('component runtime and declaration value exports stay in sync', async function () {
	await assertDeclarationExportsMatch(componentsAPI, '../src/components.d.ts')
})
