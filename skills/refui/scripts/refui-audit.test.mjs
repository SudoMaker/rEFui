import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { auditIfBranches, auditSignalFeedback } from './refui-audit.mjs'

// Run from a workspace with its own SWC installation, just like the audit CLI.
const requireFromProject = createRequire(path.join(process.cwd(), 'package.json'))
const { parseSync } = await import(pathToFileURL(requireFromProject.resolve('@swc/core')).href)

function feedback(source) {
	return auditSignalFeedback(parseSync(source, { syntax: 'ecmascript', jsx: true }), source, 'example.jsx')
}

test('signal feedback recognizes direct writes, helpers, aliases, and namespace APIs', () => {
	const result = feedback(`
		import { signal as state, watch as effect, read, touch, write } from 'refui'
		import * as ui from 'refui'
		const count = state(0), other = state(0)
		effect(() => { count.value++; other.value = 1 })
		ui.useEffect(() => { read(count); count.set(2) })
		ui.computed(() => { touch(count); write(count, 3); return 0 })
		effect(() => { count.get(); count.trigger() })
		state(0, () => { count.hasValue(); count.value += 1; return 0 })
	`)
	assert.equal(result.scopes, 5)
	assert.deepEqual(result.warnings.map(warning => warning.signal), Array(5).fill('count'))
})

test('guarded convergent writes remain advisory candidates', () => {
	const result = feedback(`import { signal, watch } from 'refui';
		const count = signal(0); watch(() => { if (count.value < 3) count.value++ })`)
	assert.deepEqual(result.warnings.map(warning => warning.signal), ['count'])
})

test('shadowed bindings, plain values, strings, and comments do not impersonate signals or APIs', () => {
	const result = feedback(`import { signal, watch } from 'refui';
		const count = signal(0), plain = { value: 0 };
		watch(() => { const count = { value: 0 }; count.value++; plain.value++ });
		function handler(watch) { watch(() => count.value++) }
		watch(() => { /* count.value++ */ const text = 'count.value++'; return text });`)
	assert.equal(result.scopes, 2)
	assert.deepEqual(result.warnings, [])
})

test('peek and untrack reads and deferred callbacks do not subscribe the enclosing scope', () => {
	const result = feedback(`import { signal, watch, peek, untrack } from 'refui';
		const count = signal(0);
		watch(() => { peek(count); count.peek(); count.value = 1 });
		watch(() => { untrack(() => count.value); count.set(2) });
		watch(() => { count.value; const later = () => count.value++;
			const actions = { run() { count.value++ }, get current() { count.value++ } };
			return <button on:click={() => count.value++} /> });`)
	assert.deepEqual(result.warnings, [])
})

test('untracked writes can still notify an enclosing scope dependency', () => {
	const result = feedback(`import { signal, watch, untrack } from 'refui';
		const count = signal(0); watch(() => { count.value; untrack(() => count.set(1)) });
		watch(() => { untrack(async () => { await Promise.resolve(); count.set(2) }); count.value })`)
	assert.deepEqual(result.warnings.map(warning => warning.signal), ['count', 'count'])
})

test('nested reactive callbacks own their dependencies separately', () => {
	const result = feedback(`import { signal, watch } from 'refui';
		const count = signal(0);
		watch(() => { count.value; watch(() => { count.set(1) }) });
		watch(() => { watch(() => { count.value++; }) });`)
	assert.equal(result.scopes, 4)
	assert.deepEqual(result.warnings.map(warning => warning.signal), ['count'])
})

test('connect uses explicit sources rather than tracking incidental reads', () => {
	const result = feedback(`import { signal, connect } from 'refui';
		const count = signal(0), other = signal(0);
		count.connect(() => { other.value++; count.set(1) });
		connect([count, other], () => { other.trigger() });
		count.connect(() => { other.value++; });`)
	assert.deepEqual(result.warnings.map(warning => warning.signal), ['count', 'other'])
})

test('post-await reads do not subscribe, but writes can notify pre-await dependencies', () => {
	const result = feedback(`import { signal, watch } from 'refui';
		const count = signal(0);
		watch(async () => { await Promise.resolve(); count.value++ });
		watch(async () => { count.value; await Promise.resolve(); count.set(1) });
		watch(async () => { await Promise.resolve(count.value); count.set(2) });`)
	assert.deepEqual(result.warnings.map(warning => warning.signal), ['count', 'count'])
})

test('If findings preserve named factories, empty branches, and imported identity', () => {
	const source = `// 😀 before source spans\nimport { If as When } from 'refui';
		import * as ui from 'refui'; import { If } from 'another-framework';
		const branch = () => <span />;
		const a = <When>{branch}</When>, b = <When true={branch} />;
		const c = <ui.If>{() => <span />}{null}</ui.If>;
		const d = <If><span /></If>;
		const e = <When><span /></When>;
		function shadow(When) { return <When><span /></When> }`
	const result = auditIfBranches(parseSync(source, { syntax: 'ecmascript', jsx: true }), source, 'example.jsx')
	assert.equal(result.boundaries, 4)
	assert.equal(result.warnings.length, 1)
	assert.equal(result.warnings[0].line, 8)
})

test('CLI exits successfully with eager If, feedback, and incomplete syntax coverage', () => {
	const child = spawnSync(process.execPath, [
		fileURLToPath(new URL('./refui-audit.mjs', import.meta.url)),
		fileURLToPath(new URL('./fixtures/audit', import.meta.url)),
	], { cwd: process.cwd(), encoding: 'utf8', timeout: 10000 })
	assert.equal(child.error, undefined)
	assert.equal(child.status, 0, child.stderr)
	assert.match(child.stdout, /If ownership: 1 boundaries parsed, 1 advisory warnings/)
	assert.match(child.stdout, /Signal feedback: 1 recognizable scopes, 1 advisory warnings/)
	assert.match(child.stdout, /Syntax coverage incomplete: 1 files/)
})
