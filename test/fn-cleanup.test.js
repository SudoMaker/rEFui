import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import { Fn, createComponent, dispose, render } from 'refui/components'
import { createHTMLRenderer } from 'refui/html'
import { nextTick, onDispose, signal, watch } from 'refui/signal'

for (const observerFirst of [true, false]) {
	for (const change of ['replace', 'clear result', 'clear handler', 'dispose owner']) {
		test(`Fn cleanup after a caught scheduler failure: ${change}, observer ${observerFirst ? 'first' : 'last'}`, async function () {
			const R = createHTMLRenderer()
			const failure = new Error('observer failure')
			const fail = signal(false)
			const handler = signal(function () {
				return function () {
					onDispose(function () { disposals += 1 })
					return R.c('i', null, 'old')
				}
			})
			let disposals = 0
			let stop
			function observe() {
				stop = watch(function () { if (fail.value) throw failure })
			}
			if (observerFirst) observe()
			const instance = createComponent(Fn, {}, handler)
			const node = render(instance, R)
			if (!observerFirst) observe()
			await nextTick()
			assert.equal(R.serialize(node), '<i>old</i>')

			try {
				if (observerFirst) fail.value = true
				if (change === 'replace') handler.value = function () { return R.c('b', null, 'new') }
				else if (change === 'clear result') handler.value = function () { return null }
				else if (change === 'clear handler') handler.value = null
				else dispose(instance)
				if (!observerFirst) fail.value = true
				await assert.rejects(nextTick(), function (error) { return error === failure })
				await nextTick()
				assert.equal(R.serialize(node), change === 'replace' ? '<b>new</b>' : '')
				assert.equal(disposals, 1)
				// Let Node observe ignored rejected promises; catching nextTick alone
				// must not produce a second rejection from the deferred removal.
				await new Promise(function (resolve) { setImmediate(resolve) })
			} finally {
				stop()
				dispose(instance)
				await nextTick()
			}
			assert.equal(R.serialize(node), '')
			assert.equal(disposals, 1)
		})
	}
}

test('Fn removal remains deferred until the scheduler settles', async function () {
	const R = createHTMLRenderer()
	const instance = createComponent(Fn, {}, function () { return R.c('i', null, 'old') })
	const node = render(instance, R)
	dispose(instance)
	assert.equal(R.serialize(node), '<i>old</i>')
	await nextTick()
	assert.equal(R.serialize(node), '')
})

for (const failedTick of [false, true]) {
	test(`Fn does not swallow a renderer removal failure after a ${failedTick ? 'failed' : 'successful'} tick`, function () {
		// Expected unhandled cleanup errors need their own process so the parent
		// test runner can verify reporting without intercepting global errors.
		const child = spawnSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '-e', `
			import assert from 'node:assert/strict'
			import { Fn, createComponent, dispose, render } from 'refui/components'
			import { createHTMLRenderer } from 'refui/html'
			import { nextTick, signal, watch } from 'refui/signal'
			const R = createHTMLRenderer(), fail = signal(false)
			const stop = watch(function () { if (fail.value) throw new Error('observer failure') })
			R.removeNode = function () { throw new Error('renderer removal failure') }
			const instance = createComponent(Fn, {}, function () { return R.c('i', null, 'old') })
			render(instance, R)
			await nextTick()
			dispose(instance)
			fail.value = ${failedTick}
			if (${failedTick}) await assert.rejects(nextTick(), /observer failure/)
			else await nextTick()
			stop()
			await new Promise(function (resolve) { setImmediate(resolve) })
		`], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 10000 })
		assert.equal(child.error, undefined)
		assert.equal(child.signal, null)
		assert.equal(child.status, 1)
		assert.match(child.stderr, /Error: renderer removal failure/)
	})
}
