---
name: refui
description: "Build, debug, and migrate rEFui applications using a self-contained guide to retained-mode signals, component lifecycles, memo/keepAlive factories, lists, async UI, DOM/HTML/Reflow renderers, JSX modes, directives, and HMR. Use when library source or separate local documentation may be unavailable."
---

# rEFui

## Overview

Apply rEFui’s retained-mode + signals model correctly, choose the right JSX mode and renderer, and fix reactivity or lifecycle issues without importing assumptions from other UI frameworks. This file is the operative guide: do not require repository documentation, a linked local checkout, MCP documentation, or the bundled reference files to complete ordinary rEFui work.

## Core Pitfalls (skim)

- JSX is evaluated once; `{signal.value}` in JSX is static. Use `{signal}` or a derived `$(() => ...)`.
- In-place array/object mutation requires `sig.trigger()` (or replace with a new value).
- Effects re-run when any read signal changes; avoid writing to those signals without guards.
- Context values are stable; provide signals in context if consumers must react.
- Passing a signal/computed directly to rEFui control-flow is correct: `<If condition={sig}>` and `<If condition={computed}>` are intended usage. The pitfall is conditional `.value` reads inside JS/derived code that skip later dependencies.

## General guide

### Mental model (retained mode)

- Component bodies are **setup**: they run once; they do not “re-render”.
- JSX is evaluated once; **signals** update the already-built UI incrementally.
- If something “doesn’t update”, you almost always read `.value` too early (non-reactively) or mutated in place without `trigger()`.

### Signals & reactivity

- State: `const count = signal(0)`
- Reactive JSX: `{count}` (not `{count.value}`)
- Derived: `const label = $(() => `Count: ${count.value}`)` and then `{label}`
- In-place mutation: call `sig.trigger()` after mutating arrays/objects.

```jsx
import { signal, $ } from 'refui'

const Counter = () => {
	const count = signal(0)
	return (
		<button on:click={() => count.set(count.value + 1)}>
			{$(() => `Count: ${count.value}`)}
		</button>
	)
}
```

### Effects & cleanup

- Reactive effect: `watch(() => { ...reads signals... })`
- Setup/cleanup: `useEffect(() => { ...; return () => cleanup })`
- Teardown-only: `onDispose(() => cleanup)`
- `EffectScope` is the ownership basis for components, effects, and disposer scopes. Work created inside a live scope is automatically released with that owner.
- `connect(signals, callback)` and `signal.connect(callback)` subscribe only to the explicitly supplied signals. Reads inside their callbacks are intentionally untracked; create `watch()` explicitly when a callback needs discovered dependencies.
- `useAction` listeners are event handlers, not reactive effects. Signal reads and writes inside a listener do not subscribe the listener; listener registration is still disposed with its outer scope.
- Scheduling: if you need “after updates applied”, `await nextTick()`.

### Control flow components

- Conditional UI: `<If condition={cond}>{() => <Then />}{() => <Else />}</If>`
- Lists: `<For entries={items} track="id">{({ item, index }) => ...}</For>`; its child is an item method, not a component boundary.
- Inline dynamic subtree with lifecycle: `<Fn ctx={something}>{(ctx) => ...}</Fn>`
- `For` has **no** `fallback`; for empty states, wrap with `<If>`.
- If the condition already exists as a signal/computed, pass it directly. Do not “fix” `<If condition={someSignal}>` into extra `.value` plumbing.

### Memoization and retained subtrees

- `memo(fn)` caches only the immediate result of the first `fn(...)` call in its captured owner scope.
- Components are two-stage: `Page(props)` returns a render function, then that render function receives the concrete renderer and produces host nodes. Therefore `memo(Page)` caches the page setup result, not its concrete rendered node.
- If a `memo(Page)` value is removed from `Dynamic`, its mount-specific render scope is disposed. Re-selecting it uses the same cached setup result but creates a fresh mounted subtree. A setup-created keyed `For` must rebuild its row cache for that new mount.
- `useMemo(fn)` is the factory form for defining the helper outside a component and obtaining a correctly scoped `memo(fn)` inside each component instance.
- `keepAlive(Page)` caches both the setup result and the first concrete renderer result. Removing it from `Dynamic` detaches the node while its effects, subscriptions, and keyed `For` cache remain live; re-selecting it reattaches the exact same node.
- `useKeepAlive(Page)` is the factory form for defining a keep-alive helper outside components. Invoke the returned factory once inside each intended owner; every invocation creates an independently owned retained component template rather than sharing a concrete node globally.
- Create `keepAlive` inside the scope that should own the retained subtree. Disposing that owner must dispose the retained subtree and every nested effect or row scope.
- A kept-alive result becomes renderer-specific on first mount. Do not mount the same retained node concurrently in multiple parents or move it between different renderers.
- Use `memo` for one-time computation/setup and `keepAlive` only for intentional keep-alive UI. Neither is a substitute for correct signal tracking.

```jsx
import { Dynamic, keepAlive, signal } from 'refui'

const current = signal(null)

const App = () => {
	const PlayerPage = keepAlive(Player)
	current.value = PlayerPage
	return <Dynamic is={current} />
}
```

```jsx
import { Dynamic, signal, useKeepAlive } from 'refui'

const preparePlayerPage = useKeepAlive(Player)

const App = () => {
	const current = signal(null)
	const PlayerPage = preparePlayerPage()
	current.value = PlayerPage
	return <Dynamic is={current} />
}
```

```jsx
import { signal, $, If, For } from 'refui'

const App = () => {
	const items = signal([{ id: 1, name: 'A' }])
	return (
		<If condition={$(() => items.value.length)}>
			{() => <For entries={items} track="id">{({ item }) => <div>{item.name}</div>}</For>}
			{() => <div>Empty</div>}
		</If>
	)
}
```

### Async UI

- `<Async future={promise} fallback={...} catch={...}>` for a single promise boundary. Its resolved child receives `{ result }`.
- `<Suspense>` groups multiple async descendants under one fallback.
- `lazy(() => import(...))` caches component-module resolution; pass a symbol name for named exports and pair it with an async fallback boundary.
- `Transition` retains the current result while coordinating pending, leaving, entering, and entered state for the next result.
- Promise components are explicit delayed boundaries and retain their component scope until resolved or disposed.
- Dependencies are collected only during synchronous effect execution. Reads after `await` are not tracked unless code is deliberately restored into a captured/frozen context.
- Dispose asynchronous work: abort fetches or guard late completion so a resolved promise cannot mutate an already-disposed owner.

### Context

Use context for shared subtree values. If consumers must react to changes, provide a signal as the context value.

```jsx
import { signal, $, createContext, useContext } from 'refui'

const Theme = createContext(signal('light'), 'Theme')

const Button = () => {
	const theme = useContext(Theme)
	return <button class:dark={$(() => theme.value === 'dark')}>OK</button>
}
```

Non-Reflow/custom renderer: wrap Provider children in a function so they inherit context: `<Theme value={x}>{() => <Button />}</Theme>`.

### JSX modes and renderers

- Automatic JSX uses `jsx: 'automatic'` plus `jsxImportSource: 'refui'`. Components normally return JSX directly; the automatic runtime creates renderer-agnostic Reflow functions that a concrete renderer resolves later.
- Classic JSX uses `jsxFactory: 'R.c'` and `jsxFragment: 'R.f'` (or file pragmas). Components normally return `(R) => JSX`, making concrete renderer selection explicit.
- DOM renderer (interactive browser): create `createDOMRenderer(defaults)` once at the entry point, then call `renderer.render(target, App)`.
- HTML renderer (retained SSR/SSG tree): create `createHTMLRenderer()`, produce a node, and call `serialize(node)`. The node remains reactive while its owner is live, but each serialized string is only a snapshot.
- Reflow is not a host DOM. It stores renderer-agnostic creation functions until DOM, HTML, or a custom renderer resolves them.
- Do not assume DOM APIs in renderer-neutral components. The only generally allowed host behavior is what the selected renderer contract exposes.
- Custom renderers may provide `getParent(node)` and own ordinary-node parentage. Without it, the core tracks parentage. A renderer that owns parents must move already-parented ordinary nodes consistently in `appendNode` and `insertBefore`.

```jsx
import { createDOMRenderer } from 'refui/dom'
import { defaults } from 'refui/browser'

createDOMRenderer(defaults).render(document.getElementById('app'), App)
```

### DOM directives (browser preset)

- Events: `on:click={fn}` (+ `on-once:*`, `on-passive:*`, `on-capture:*`)
- Classes/styles: `class:active={boolOrSignal}`, `style:color={valueOrSignal}`
- Attributes vs props: `attr:*` (SVG/read-only), `prop:*` (force property write)
- Macros: `m:*` for reusable DOM behaviors (renderer-registered handlers)

## Default Policy: Use rEFui Built-ins First

When implementing a requirement, prefer rEFui’s built-in primitives (signals/components/extras/renderers) over custom plumbing. Only fall back to a custom implementation when:
- rEFui has no built-in primitive that matches the requirement, and
- the project’s rEFui version lacks an equivalent helper, and
- you can’t express it cleanly as a DOM macro (`m:*`) or small reusable component.

## Quick Triage (do this first)

1. Identify **JSX mode** in the target repo:
	 - **Automatic runtime**: look for `jsx: 'automatic'` + `jsxImportSource: 'refui'` (Vite/esbuild) or `jsxImportSource: "refui"` (tsconfig/Bun).
	 - **Classic transform**: look for `jsxFactory: 'R.c'` + `jsxFragment: 'R.f'` (Vite/esbuild) or `/** @jsx R.c */` file pragmas.
2. Identify the **host renderer**:
	 - Browser apps: `createDOMRenderer(defaults)` from `refui/dom` + `refui/browser` (or `refui/presets/browser` in older repos).
	 - SSR/SSG: `createHTMLRenderer()` from `refui/html`, then `serialize()`.
	 - Reflow logic-only modules: `refui/reflow` (often injected via `jsxInject: import { R } from 'refui/reflow'` in classic mode).
3. Confirm the installed **rEFui version** from `package.json` or the lockfile. Match the import paths and APIs already used by the project; if an API described here is absent from the installed package, do not invent it.

The optional `scripts/refui-audit.mjs` command can scan JSX mode and common `.value` mistakes, but the workflow must not depend on that script.

## When Usage Is Unclear (optional documentation lookup)

This skill remains sufficient for ordinary rEFui work. When an API, version-specific behavior, or repository-level detail is still ambiguous after checking the installed package version and exports, use external documentation lookup when those tools are available:

- Use **Context7 MCP** for current library API documentation and examples:
	- Resolve the library with `mcp__context7__resolve-library-id` and `libraryName: "refui"`.
	- Query the specific API or behavior with `mcp__context7__query-docs` rather than requesting a broad overview.
- Use **DeepWiki MCP** for repository-level architecture or implementation questions:
	- Call `mcp__deepwiki__read_wiki_structure`, then `mcp__deepwiki__ask_question` on `SudoMaker/rEFui`, such as to find where a behavior is implemented or documented.

Treat lookup results as supporting evidence, not a substitute for the target project's installed version or a public-API reproduction. If the tools are unavailable, continue from this guide and the installed package; do not require a linked local document.

## Feature selection

- State that changes: `signal`; derived state: `$`/`computed`; reactive work: `watch`; setup with returned cleanup: `useEffect`; teardown only: `onDispose`.
- Conditional replacement: `If`; keyed lists: `For`; positional list reuse: `UnKeyed`; inline replacement scope: `Fn`; changing component/tag: `Dynamic`; explicit component instance: `createComponent` plus `Render`.
- One-time function result: `memo`, or `useMemo` for a module-level factory; retained concrete subtree across detach/reattach: `keepAlive`, or `useKeepAlive` for a module-level factory; reusable managed slots: `createCache`/`Cached`.
- A single promise: `Async`; grouped promises: `Suspense`; lazy module: `lazy`; old/new handoff: `Transition`.
- Render elsewhere while retaining logical ownership: `createPortal`, which returns inlet and outlet components.
- Structured text parsing: `Parse`; positional lists: `UnKeyed`; web-component boundary: `defineCustomElement`.
- Wide equality matching such as selected-row state: `onCondition(source)` rather than one computed equality per row.
- Field-level subscriptions from a large object: `extract` or `derivedExtract`.
- Coalesced expensive work: `createDefer` or `createSchedule`; use returned cancellation/disposal paths.

### Extras and host boundaries

- `createPortal()` from `refui/extras` returns `[Inlet, Outlet]`. Content produced by inlets is rendered at the outlet and remains disposed with its logical owner.
- `Parse` is an escape hatch for parsed/structured source. Sanitize untrusted markup before parsing or emitting raw HTML.
- HTML-renderer `rawHTML` bypasses escaping and must receive trusted content only.
- `defineCustomElement` creates a custom-element boundary whose attributes map to reactive props and whose connected/disconnected lifecycle owns the rendered component.
- Prefer reusable `m:*` macros for DOM-only behaviors such as focus traps, click-outside, and scroll locking; the macro must clean up listeners or host resources.

### HMR

- Use the `refurbish` integration for the project’s bundler; application components should not hand-write `import.meta.hot` bookkeeping.
- Vite configuration uses `import { refurbish } from 'refurbish/vite'` and `plugins: [refurbish()]`. Bun uses the `refurbish/bun` plugin.
- HMR builds retain component construction boundaries that production may optimize away, so do not infer production allocation behavior from development-only wrappers.
- Use `$ref` or `expose` for stable node/component handles. HMR wrapping may change the immediate object returned by `renderer.render()` or `createComponent()`.
- Framework primitives marked static are invoked directly and are not ordinary user HMR boundaries.

## Non-Negotiables (retained mode)

- Do not write React/Vue/Solid/Svelte primitives (`useState`, hooks, VDOM assumptions, `$:` blocks, etc.). Map them to rEFui signals/effects.
- Treat component bodies as **setup** (constructor-ish). JSX is evaluated once; signals drive incremental updates afterward.
- Keep reactive reads reactive:
	- ✅ Use a signal directly: `<div>{count}</div>`
	- ✅ Wrap derived expressions: `<div>{$(() => `Count: ${count.value}`)}</div>` or `<div>{computed(() => ...)}</div>`
	- ❌ Avoid inline `.value` in JSX: `<div>{count.value}</div>` (evaluates once, won’t update)
- Control-flow note:
	- ✅ `<If condition={flag}>` when `flag` is already a signal/computed
	- ✅ `<If condition={$(() => count.value > 0)}>` for a derived condition
	- ❌ Treating `<If condition={flag}>` as a reactivity smell by itself
- Remember scheduling: signal effects/computed flush at the end of the tick; use `await nextTick()` when you must observe derived updates.

## Default Patterns (copy these mentally)

- State: `const x = signal(initial)`
- Derived: `const y = $(() => /* uses x.value */)` (or `computed(() => ...)`)
- Effects: `watch(fn)` for reactive computations; `useEffect(setup)` for setup+cleanup; `onDispose(cleanup)` for teardown.
- Lists:
	- Keyed: `<For entries={items} track="id">{({ item }) => ...}</For>`
	- Unkeyed (perf experiments / reorder heavy): `UnKeyed` from `refui/extras/unkeyed.js`
	- If mutating arrays/objects in place: call `sig.trigger()` after mutation.
- Async:
	- `<Async future={promise} fallback={...} catch={...}>{({ result }) => ...}</Async>`
	- `<Suspense>` for grouping async subtrees
	- `async` components are supported; pair with fallbacks when needed.
- DOM directives/events (DOM renderer):
	- Events: `on:click={...}`, plus options `on-once:*`, `on-passive:*`, `on-capture:*`
	- Attributes vs props: prefer `attr:` for SVG or when a DOM prop is read-only; use `prop:` to force a property set.
	- Preset directives (browser preset): `class:x={boolSignal}`, `style:color={valueOrSignal}`
	- Macros: `m:name={value}` where `name` is registered on the renderer.
- Refs/handles:
	- `$ref={sig}` to receive a node/instance in `sig.value`
	- `$ref={(node) => ...}` callback form
	- Prefer `expose` prop for imperative child handles (v0.8.0+).

## Workflows

### Add a feature safely

1. Keep renderer creation at the entry point; do not create renderers inside components.
2. Localize state: prefer per-component signals over global blobs; use `extract`/`derivedExtract` to reduce fan-out.
3. For repeated DOM behaviors, register a macro and use it via `m:*` rather than duplicating manual DOM code.
4. For lists, choose keyed `<For>` unless you have a measured reason to use unkeyed.

### Set up a new project (when asked)

1. Ask only: preferred package manager (`npm`/`pnpm`/`yarn`/`bun`) and language (JS/TS). Do not ask runtime.
2. Default to JSX automatic runtime + JavaScript + `refui` latest from npm unless the user specifies otherwise.
3. For Vite, configure `esbuild: { jsx: 'automatic', jsxImportSource: 'refui' }`. For TS/TSX, use `"jsx": "react-jsx"` and `"jsxImportSource": "refui"` when TypeScript performs the transform; do not configure two competing JSX transforms.
4. Use `.jsx`/`.tsx` for files containing JSX. Create the host renderer once in the entry file and mount the root component there.
5. A minimal browser entry imports `createDOMRenderer` from `refui/dom`, imports `defaults` from `refui/browser`, creates the renderer, and calls `renderer.render(document.getElementById('app'), App)`.
6. Add `refurbish` only when HMR is wanted and configure its bundler plugin as described above.
7. Preserve an existing project’s JSX mode, renderer, import paths, and package manager during unrelated work.

## Validation

- Reproduce lifecycle bugs through public APIs before changing application or framework code.
- For scheduled reactivity, await `nextTick()` before asserting downstream effects or rendered output.
- Verify unmount and final-owner disposal separately for `memo`, `keepAlive`, `useKeepAlive`, `Dynamic`, async boundaries, lists, listeners, and external resources.
- Renderer-neutral tests must not fake browser-only `DocumentFragment` semantics. Test host-specific behavior against the actual host contract, and test HTML behavior with the HTML renderer.
- Do not patch a test harness or target implementation merely to make an assertion pass; correct the production ownership or behavior that the reproduction exposed.
