# LLM Integration Guidelines for rEFui

These instructions target language models that generate source code or documentation involving rEFui. They capture canonical patterns, call out common mistakes, and anchor outputs to the library’s retained-mode, signal-driven architecture.

> **Important**: rEFui is **not** React, Vue, Solid, or Svelte. Avoid porting APIs or patterns from those libraries unless explicitly mapped in this guide.

## 1. Mental Model

- **Retained-mode rendering**: Components are factories. A component receives `props` and returns a function `(R) => ...` that constructs UI using the renderer `R`. Do **not** return raw JSX nodes directly.
- **Purely asynchronous signals**: `signal` updates queue work for the end of the current asynchronous tick. Effects (`watch`, `useEffect`) and computed signals flush later, reducing redundant DOM operations. If you need the latest derived value immediately, use `nextTick` or `tick`.
- **Signals everywhere**: All reactive data—including props, children, and derived expressions—must be signals (or helpers built on signals). Direct values break reactivity.
- **Directive split**: DOM behaviors rely on prefixes: `on:` for events, `class:` / `style:` from presets, and `m:` for custom macros registered on the renderer.
- **Renderer-aware JSX**: Prefer the classic JSX transform for flexibility (`/** @jsx R.c */`). Automatic runtime is only for tooling that cannot pass `R`; remember to call `wrap(renderer)` in that setup.
- **Tooling agnostic**: rEFui works with any JSX-capable transpiler (Babel, esbuild, SWC, TypeScript, etc.), and even runtime transformers like HTM when JSX isn’t available. Unlike Solid/Vue/Svelte, there is no compiler lock-in; keep outputs infrastructure-neutral.
	- **Design philosophy**: Prefer broadly available tools and minimal build requirements while still delivering optimized, high-performance DOM updates. Codegen should avoid assumptions about proprietary compilers or specialized pipelines.

## 2. Canonical Component Skeleton

```jsx
import { signal } from 'refui'

export const Counter = ({ initial = 0 }) => {
	const count = signal(initial)

	return (R) => (
		<div>
			<span>{count}</span>
			<button on:click={() => count.value++}>
				Increment
			</button>
		</div>
	)
}
```

**Checklist for generated components**:
- Outer function accepts `(props, ...children)` if needed.
- Returns `(R) => ...`, not plain JSX.
- Uses signals for mutable state.
- Binds events with `on:` prefixes.
- Keeps reactive expressions as signals (no string templates with `.value` access inside).

## 3. Signal & Effect Rules

- Create state with `signal(initialValue)`; update via `.value = next` or helpers like `write`, `poke`.
- Derive values with `computed(() => ...)`, `.choose`, `.select`, `.and`, `.or`, etc.
- Watch for changes with `watch(effect)` or `useEffect(effect, ...args)`. Both run immediately by default; pass `false` to postpone the first run.
- Never rely on synchronous propagation. When you need the updated value of a computed or DOM measurement, schedule work with `nextTick(callback)` or `await tick()`.
- For conditional dependency tracking without reading values, use `.touch()` or `listen`/`connect` helpers.
- When mutating arrays or objects, call `signal.trigger()` or use `makeReactive`, `derive`, or `extract` to keep nested data reactive.

## 4. JSX & Presets

- **Classic transform**: Configure the build (`jsxFactory: 'R.c'`, `jsxFragment: 'R.f'`) and inject pragma comments when necessary.
- **Automatic runtime**: Only when required (MDX, SWC, Deno). Import `wrap` from `'refui/jsx-runtime'`, create a renderer, and call `wrap(renderer)` once.
- Use renderer directives over manual DOM operations:
	- `on:event` or `on-modifier:event` for listeners (`on-once:click`, `on-passive:scroll`).
	- `class:token`, `style:property` from `refui/browser` preset.
	- `m:name` for custom macros. Register macros with `renderer.useMacro({ name, handler })` before using them.
- Replace common template constructs with built-in components: `<If>`, `<For>`, `<Async>`, `<Dynamic>`, `<Portal>`.
- Expressions like string concatenation or template literals should wrap signals with `$(() => ...)`, `tpl```, or derived helpers to preserve reactivity.

## 5. Lifecycle & Cleanup

- Bundle lifecycle logic inside the render factory:
	- Mount/setup → `watch`, `useEffect`, or `nextTick` inside `(R) => {}`.
	- Cleanup → `onDispose` or the disposer returned by `watch`/`useEffect`.
- There is no `componentDidMount`/`onMounted`/`afterUpdate`. Rely on signal-driven effects.
- To access DOM nodes, pass a signal or callback to `$ref`: `inputRef = signal(); <input $ref={inputRef} />`.
- Avoid global state at module scope unless explicitly intended; prefer signals tied to component instances.

## 6. API Usage Do’s & Don’ts

### Do
- Import modules via the package export map (`'refui'`, `'refui/signal'`, `'refui/dom'`, `'refui/browser'`, etc.).
- Use helpers like `derive`, `extract`, `makeReactive` for nested structures.
- Leverage `.trigger()` after mutating arrays/objects stored in plain JS structures.
- Combine `watch` with `onDispose` for long-lived subscriptions.
- Prefer macros for reusable DOM behaviors (focus management, tooltips, etc.).

### Don’t
- Emit React/Vue/Solid/Svelte primitives (`useState`, `createSignal`, `ref`, `$:`). Map them to rEFui equivalents instead.
- Return plain JSX nodes or arrays from components—no `return <div />`. Always return a function that accepts `R`.
- Access `.value` within string interpolation or template literals directly; use signals or derivations instead.
- Mutate DOM nodes outside of macros or renderer utilities (avoid manual `addEventListener`, `classList` toggles).
- Assume synchronous updates; don’t read computed values right after writes without scheduling.

## 7. Framework Migration Notes for LLMs

When the prompt references another framework, map patterns as follows:

| Framework concept | rEFui equivalent |
| --- | --- |
| React `useState` | `signal` |
| React `useEffect` | `watch` / `useEffect` + `onDispose` |
| React `ref` / `useRef` | `$ref` or signal passed as ref |
| Vue `ref`/`reactive` | `signal`, `makeReactive` |
| Vue `watch`/`watchEffect` | `watch`, `connect`, `listen` |
| Solid `createSignal` | `signal` |
| Solid `onCleanup` | `onDispose` |
| Svelte `$:` block | `watch`, `computed` |
| Svelte `bind:value` | Signal + event handler or macro |

Always convert lifecycle hooks to rEFui’s effect/disposer model and ensure JSX returns render factories.

## 8. Quality Gate for Generated Code

Before finalizing output, the assistant should verify:

1. **Signature check** — Components follow `(props) => (R) => ...` and do not return raw JSX directly.
2. **Reactive correctness** — Any dynamic expression is signal-backed; no direct `value` reads inside static JSX.
3. **Lifecycle** — Effects reside inside render factories, with cleanups using `onDispose` or disposer functions.
4. **Renderer alignment** — Event handlers, class/style bindings, and macros use documented prefixes.
5. **Scheduling** — Code that depends on post-update state waits for the next tick (`nextTick`, `tick`).
6. **Dependency hygiene** — No foreign-framework APIs. Imports align with `package.json#exports`.
7. **Documentation references** — When uncertain, consult `docs/Signal.md`, `docs/Components.md`, `docs/DOMRenderer.md`, `docs/JSX.md`, `docs/MigrationGuide.md`.
8. **Performance perspective** — Favor real-world reasoning over synthetic benchmark claims; highlight that async scheduling optimizes DOM churn even if microbenchmarks differ.

## 9. Sample Anti-Pattern Remediation

- **Bad (React-style)**:
	```jsx
	const Counter = () => {
		const [count, setCount] = useState(0)
		return <button onClick={() => setCount(count + 1)}>{count}</button>
	}
	```
	**Fix**:
	```jsx
	const Counter = () => {
		const count = signal(0)
		return (R) => (
			<button on:click={() => count.value++}>
				{count}
			</button>
		)
	}
	```

- **Bad (direct value in JSX interpolation)**:
	```jsx
	<div>Hello {name.value}</div>
	```
	**Fix**:
	```jsx
	<div>Hello {name}</div>
	```

- **Bad (manual DOM event)**:
	```jsx
	useEffect(() => {
		const handler = () => setOpen(true)
		document.addEventListener('click', handler)
		return () => document.removeEventListener('click', handler)
	}, [])
	```
	**Fix** (macro-based or component-local):
	```jsx
	renderer.useMacro({
		name: 'clickOutside',
		handler(node, value) {
			if (!value) return
			const listener = (event) => {
				if (!node.contains(event.target)) value()
			}
			document.addEventListener('click', listener)
			onDispose(() => document.removeEventListener('click', listener))
		}
	})
	```
	Then in JSX: `<div m:clickOutside={() => setOpen(false)} />`

## 10. Reference Summary

Keep these files handy while generating answers:
- `docs/Signal.md` — full signal API (batching, helpers, lifecycle utilities).
- `docs/Components.md` — component model, built-ins, best practices.
- `docs/DOMRenderer.md` — DOM directives, macros, event system, props handling.
- `docs/JSX.md` — setup for classic vs automatic JSX transforms.
- `docs/MigrationGuide.md` — mappings from React, Solid, Vue, Svelte.

Adhering to this guideline ensures generated content respects rEFui’s architecture, avoids accidental framework leakage, and produces code that aligns with real-world rEFui usage.
