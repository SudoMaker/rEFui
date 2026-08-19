import assert from 'node:assert/strict'
import test from 'node:test'

import {
	Async,
	Component,
	Dynamic,
	Fn,
	For,
	If,
	Suspense,
	Transition,
	createComponent,
	createContext,
	dispose,
	getCurrentSelf,
	keepAlive,
	lazy,
	memo,
	render,
	snapshot,
	useContext,
	useKeepAlive,
	useMemo
} from 'refui/components'
import { createHTMLRenderer } from 'refui/html'
import { R as Reflow } from 'refui/reflow'
import { nextTick, onDispose, signal, watch } from 'refui/signal'

async function settle(turns = 6) {
	for (let i = 0; i < turns; i++) {
		await Promise.resolve()
		await nextTick()
	}
}

test('component refs, snapshots, memo helpers, and contexts retain lifecycle boundaries', function () {
	const R = createHTMLRenderer()
	const Theme = createContext('default', 'Theme')
	const signalRef = signal(null)
	let callbackRef
	let runLater
	let memoCalls = 0
	const prepareMemo = useMemo(function (value) {
		memoCalls += 1
		return R.c('em', null, value)
	})

	function Reader({ label }) {
		const memoized = prepareMemo()
		const snap = snapshot()
		runLater = function () {
			return snap(function () {
				return [getCurrentSelf(), useContext(Theme)]
			})
		}
		return function () {
			return R.c('span', null, useContext(Theme), memoized(label), memoized('ignored'))
		}
	}

	const provider = createComponent(function Provider() {
		return function () {
			return R.c(Theme, { value: 'inside' }, function () {
				return R.c(Reader, {
					$ref(value) {
						callbackRef = value
					},
					label: 'memoized'
				})
			})
		}
	}, { $ref: signalRef })
	assert.equal(signalRef.peek(), provider)

	assert.equal(R.serialize(render(provider, R)), '<span>inside<em>memoized</em></span>')
	assert.ok(callbackRef instanceof Component)
	assert.equal(memoCalls, 1)
	assert.deepEqual(runLater(), [callbackRef, 'inside'])
	assert.equal(useContext(Theme), 'default')
	assert.equal(useContext(function UnknownContext() {}), undefined)

	dispose(provider)
	assert.deepEqual(runLater(), [undefined, 'default'])
	assert.equal(render(callbackRef, R), undefined)
})

test('memoized component scopes are destroyed with their captured parent scope', async function () {
	const R = createHTMLRenderer()
	const source = signal(0)
	let child
	let childDisposals = 0
	let childRuns = 0
	let memoCalls = 0

	function Child() {
		onDispose(function () {
			childDisposals += 1
		})
		watch(function () {
			childRuns += 1
			source.value
		})
		return function () {
			return R.c('b', null, source)
		}
	}

	const prepareMemo = useMemo(function () {
		memoCalls += 1
		return R.c(Child, {
			$ref(value) {
				child = value
			}
		})
	})
	const parent = createComponent(function Parent() {
		const memoized = prepareMemo()
		return function () {
			return R.c('div', null, memoized(), memoized())
		}
	})
	const node = render(parent, R)

	assert.equal(R.serialize(node), '<div><b>0</b></div>')
	assert.equal(memoCalls, 1)
	assert.equal(childRuns, 1)
	assert.equal(source.connected, true)

	source.value = 1
	await nextTick()
	assert.equal(R.serialize(node), '<div><b>1</b></div>')
	assert.equal(childRuns, 2)

	dispose(parent)
	assert.equal(childDisposals, 1)
	assert.equal(render(child, R), undefined)
	assert.equal(source.connected, false)
	source.value = 2
	await nextTick()
	assert.equal(childRuns, 2)
})

test('a memoized page remounts its setup-created keyed For into a fresh Dynamic fragment', async function () {
	const R = createHTMLRenderer()
	const entries = signal([{ id: 0 }, { id: 1 }])
	const current = signal(null)
	let MemoPage
	let rowDisposals = 0

	function Page() {
		return Reflow.c('list', null,
			Reflow.c(For, { entries, track: 'id' }, function ({ item }) {
				onDispose(function () {
					rowDisposals += 1
				})
				return Reflow.c('row', null, item.id)
			})
		)
	}

	const app = createComponent(function App() {
		MemoPage = memo(Page)
		current.poke(MemoPage)
		return function () {
			return R.c(Dynamic, { is: current })
		}
	})
	const node = render(app, R)
	assert.equal(R.serialize(node), '<list><row>0</row><row>1</row></list>')

	current.value = null
	await settle(2)
	assert.equal(R.serialize(node), '')
	assert.equal(rowDisposals, 2)
	assert.equal(entries.connected, false)
	current.value = MemoPage
	await settle(2)
	assert.equal(R.serialize(node), '<list><row>0</row><row>1</row></list>')
	assert.equal(entries.connected, true)
	entries.value = [{ id: 1 }, { id: 2 }]
	await settle(2)
	assert.equal(R.serialize(node), '<list><row>1</row><row>2</row></list>')
	assert.equal(rowDisposals, 3)
	dispose(app)
	assert.equal(rowDisposals, 5)
	assert.equal(entries.connected, false)
})

test('keepAlive reattaches one rendered keyed subtree across Dynamic mounts', async function () {
	const R = createHTMLRenderer()
	const entries = signal([{ id: 0 }, { id: 1 }])
	const current = signal(null)
	let AlivePage
	let listNode
	let listRefCalls = 0
	let pageSetups = 0
	let rowDisposals = 0

	function Page() {
		pageSetups += 1
		return Reflow.c('list', {
			$ref(node) {
				listRefCalls += 1
				if (listNode) assert.equal(node, listNode)
				else listNode = node
			}
		}, Reflow.c(For, { entries, track: 'id' }, function ({ item }) {
			onDispose(function () {
				rowDisposals += 1
			})
			return Reflow.c('row', null, item.id)
		}))
	}

	const app = createComponent(function App() {
		AlivePage = keepAlive(Page)
		current.poke(AlivePage)
		return function () {
			return R.c(Dynamic, { is: current })
		}
	})
	const node = render(app, R)
	assert.equal(R.serialize(node), '<list><row>0</row><row>1</row></list>')
	assert.equal(pageSetups, 1)
	assert.equal(listRefCalls, 1)

	current.value = null
	await settle(2)
	assert.equal(R.serialize(node), '')
	assert.equal(rowDisposals, 0)
	assert.equal(entries.connected, true)
	entries.value = [{ id: 1 }, { id: 2 }]
	await settle(2)
	assert.equal(R.serialize(listNode), '<list><row>1</row><row>2</row></list>')

	current.value = AlivePage
	await settle(2)
	assert.equal(R.serialize(node), '<list><row>1</row><row>2</row></list>')
	assert.equal(pageSetups, 1)
	assert.equal(listRefCalls, 1)
	assert.equal(rowDisposals, 1)

	dispose(app)
	assert.equal(rowDisposals, 3)
	assert.equal(entries.connected, false)
})

test('useKeepAlive creates independently owned retained subtrees per component instance', async function () {
	const R = createHTMLRenderer()
	const source = signal(0)
	const currentA = signal(null)
	const currentB = signal(null)
	const alivePages = new Map()
	const pageNodes = new Map()
	const setupCalls = new Map()
	const refCalls = new Map()
	const disposals = new Map()

	function Page({ id }) {
		setupCalls.set(id, (setupCalls.get(id) ?? 0) + 1)
		onDispose(function () {
			disposals.set(id, (disposals.get(id) ?? 0) + 1)
		})
		return Reflow.c('page', {
			$ref(node) {
				refCalls.set(id, (refCalls.get(id) ?? 0) + 1)
				pageNodes.set(id, node)
			}
		}, id, ':', source)
	}

	const prepareAlive = useKeepAlive(Page)
	function App({ id, current }) {
		const AlivePage = prepareAlive()
		alivePages.set(id, AlivePage)
		current.poke(AlivePage)
		return function () {
			return R.c(Dynamic, { is: current, id })
		}
	}

	const appA = createComponent(App, { id: 'A', current: currentA })
	const appB = createComponent(App, { id: 'B', current: currentB })
	const nodeA = render(appA, R)
	const nodeB = render(appB, R)

	assert.equal(R.serialize(nodeA), '<page>A:0</page>')
	assert.equal(R.serialize(nodeB), '<page>B:0</page>')
	assert.notEqual(pageNodes.get('A'), pageNodes.get('B'))
	assert.deepEqual(Object.fromEntries(setupCalls), { A: 1, B: 1 })
	assert.deepEqual(Object.fromEntries(refCalls), { A: 1, B: 1 })

	currentA.value = null
	await settle(2)
	assert.equal(R.serialize(nodeA), '')
	source.value = 1
	await settle(2)
	assert.equal(R.serialize(pageNodes.get('A')), '<page>A:1</page>')
	assert.equal(R.serialize(pageNodes.get('B')), '<page>B:1</page>')

	currentA.value = alivePages.get('A')
	await settle(2)
	assert.equal(R.serialize(nodeA), '<page>A:1</page>')
	assert.deepEqual(Object.fromEntries(setupCalls), { A: 1, B: 1 })
	assert.deepEqual(Object.fromEntries(refCalls), { A: 1, B: 1 })

	dispose(appA)
	assert.deepEqual(Object.fromEntries(disposals), { A: 1 })
	assert.equal(source.connected, true)
	source.value = 2
	await settle(2)
	assert.equal(R.serialize(pageNodes.get('A')), '<page>A:1</page>')
	assert.equal(R.serialize(pageNodes.get('B')), '<page>B:2</page>')

	dispose(appB)
	assert.deepEqual(Object.fromEntries(disposals), { A: 1, B: 1 })
	assert.equal(source.connected, false)
})

test('lazy caches successful modules, selects named exports, and rejects missing exports', async function () {
	const R = createHTMLRenderer()
	let loads = 0
	function Loaded({ label }) {
		return function () {
			return R.c('b', null, label)
		}
	}
	const LazyDefault = lazy(async function () {
		loads += 1
		return { default: Loaded }
	})
	const first = createComponent(LazyDefault, { label: 'first', suspensed: false })
	const second = createComponent(LazyDefault, { label: 'second', suspensed: false })
	const firstNode = render(first, R)
	const secondNode = render(second, R)
	await settle()
	assert.equal(R.serialize(firstNode), '<b>first</b>')
	assert.equal(R.serialize(secondNode), '<b>second</b>')
	assert.equal(loads, 1)

	const LazyNamed = lazy(function () {
		return { Named: Loaded }
	}, 'Named')
	const named = createComponent(LazyNamed, { label: 'named', suspensed: false })
	const namedNode = render(named, R)
	await settle()
	assert.equal(R.serialize(namedNode), '<b>named</b>')

	const Missing = lazy(function () { return {} }, 'Missing')
	const missing = createComponent(Missing, {
		catch({ error }) {
			return R.c('i', null, error.name)
		},
		suspensed: false
	})
	const missingNode = render(missing, R)
	await settle()
	assert.equal(R.serialize(missingNode), '<i>SyntaxError</i>')

	dispose(first)
	dispose(second)
	dispose(named)
	dispose(missing)
})

test('Fn replaces, clears, and recovers rendered output through its error handler', async function () {
	const R = createHTMLRenderer()
	const handler = signal(function () {
		return function () {
			return R.c('b', null, 'first')
		}
	})
	const view = createComponent(Fn, {
		name: 'Recoverable',
		catch(error, name) {
			return R.c('i', null, `${name}:${error.message}`)
		}
	}, handler)
	const node = render(view, R)
	assert.equal(R.serialize(node), '<b>first</b>')

	handler.value = null
	await settle(2)
	assert.equal(R.serialize(node), '')
	handler.value = function () {
		return function () {
			throw new Error('broken')
		}
	}
	await settle(2)
	assert.equal(R.serialize(node), '<i>Recoverable:broken</i>')
	handler.value = function () {
		return function () {
			return R.c('u', null, 'recovered')
		}
	}
	await settle(2)
	assert.equal(R.serialize(node), '<u>recovered</u>')
	dispose(view)
})

test('For expose methods retrieve, remove, and clear keyed entries', async function () {
	const R = createHTMLRenderer()
	const entries = signal([{ id: 1, label: 'one' }, { id: 2, label: 'two' }])
	let api
	const view = createComponent(For, {
		entries,
		expose(value) {
			api = value
		},
		track: 'id'
	}, function ({ item }) {
		return R.c('b', null, item.label)
	})
	const node = render(view, R)
	assert.equal(R.serialize(node), '<b>one</b><b>two</b>')
	assert.equal(api.getItem(2), entries.peek()[1])

	api.remove(1)
	await nextTick()
	assert.equal(R.serialize(node), '<b>two</b>')
	assert.deepEqual(entries.peek().map(function (item) { return item.id }), [2])
	api.clear()
	await nextTick()
	assert.equal(R.serialize(node), '')
	assert.deepEqual(entries.peek(), [])
	api.clear()
	dispose(view)
})

test('reactive If and Dynamic switch host output and support empty selections', async function () {
	const R = createHTMLRenderer()
	const condition = signal(true)
	const selected = signal('b')
	const view = createComponent(function View() {
		return function () {
			return R.c('div', null,
				R.c(If, { condition }, R.c('i', null, 'yes'), R.c('u', null, 'no')),
				R.c(Dynamic, { is: selected }, 'dynamic')
			)
		}
	})
	const node = render(view, R)
	assert.equal(R.serialize(node), '<div><i>yes</i><b>dynamic</b></div>')
	condition.value = false
	selected.value = 'strong'
	await settle(2)
	assert.equal(R.serialize(node), '<div><u>no</u><strong>dynamic</strong></div>')
	selected.value = null
	await settle(2)
	assert.equal(R.serialize(node), '<div><u>no</u></div>')
	dispose(view)
})

test('Async renders fallback, success, onLoad, and caught failure states', async function () {
	const R = createHTMLRenderer()
	let resolve
	let onLoadCalls = 0
	const future = new Promise(function (done) { resolve = done })
	const success = createComponent(Async, {
		future,
		fallback() {
			return R.c('i', null, 'loading')
		},
		onLoad() {
			onLoadCalls += 1
		},
		label: 'result'
	}, function ({ label, result }) {
		return R.c('b', null, `${label}:${result}`)
	})
	const successNode = render(success, R)
	await settle(2)
	assert.equal(R.serialize(successNode), '<i>loading</i>')
	resolve('done')
	await settle()
	assert.equal(R.serialize(successNode), '<b>result:done</b>')
	assert.equal(onLoadCalls, 1)

	const failure = createComponent(Async, {
		future: Promise.reject(new Error('failed')),
		catch({ error }) {
			return R.c('u', null, error.message)
		},
		suspensed: false
	}, function () {
		return R.c('b', null, 'unexpected')
	})
	const failureNode = render(failure, R)
	await settle()
	assert.equal(R.serialize(failureNode), '<u>failed</u>')
	dispose(success)
	dispose(failure)
})

test('Suspense coordinates nested async work and reports empty boundaries', async function () {
	const R = createHTMLRenderer()
	assert.equal(Suspense({}), undefined)
	let resolve
	const future = new Promise(function (done) { resolve = done })
	const view = createComponent(Suspense, {
		fallback() {
			return R.c('i', null, 'waiting')
		}
	}, function () {
		return R.c(Async, { future }, function ({ result }) {
			return R.c('b', null, result)
		})
	})
	const node = render(view, R)
	await settle(2)
	assert.equal(R.serialize(node), '<i>waiting</i>')
	resolve('ready')
	await settle(8)
	assert.equal(R.serialize(node), '<b>ready</b>')
	dispose(view)
})

test('Transition exposes state and performs initial and subsequent async handoffs', async function () {
	const R = createHTMLRenderer()
	const value = signal('one')
	const loading = signal(false)
	const pending = signal(false)
	const handoffs = []
	const states = []
	const view = createComponent(Transition, {
		data: { view: 'test' },
		loading,
		onLoad(state, hasCurrent, swap) {
			handoffs.push(hasCurrent)
			assert.equal(state.data.view, 'test')
			return swap()
		},
		pending
	}, function (state) {
		states.push(state)
		const current = value.value
		return Promise.resolve(function () {
			return R.c('b', null, current)
		})
	})
	const node = render(view, R)
	await settle(10)
	assert.equal(R.serialize(node), '<b>one</b>')
	assert.deepEqual(handoffs, [false])
	assert.equal(loading.peek(), false)
	assert.equal(pending.peek(), false)
	assert.equal(states[0].entering.peek(), true)
	assert.equal(states[0].entered.peek(), false)

	value.value = 'two'
	await settle(10)
	assert.equal(R.serialize(node), '<b>two</b>')
	assert.deepEqual(handoffs, [false, true])
	assert.equal(states[0].leaving.peek(), true)
	assert.equal(loading.peek(), false)
	assert.equal(pending.peek(), false)
	dispose(view)
})
