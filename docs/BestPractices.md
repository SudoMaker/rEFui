# Best Practices & Common Pitfalls

This guide collects practical patterns that keep rEFui apps fast, correct, and easy to maintain.

## 1) Mental model: retained rendering + signals

- rEFui is **not React** and does not rely on a virtual DOM diff.
- Signals are the unit of reactivity. Only use signals for values that should stay reactive; plain values are fine for static props/children.

## 2) Dependency tracking: read before branching/returning

rEFui tracks dependencies when a signal is **read** during a `computed`, `watch`, or `useEffect` run.

**Rule of thumb:** if a value *might* be needed in any branch of a reactive function, **read it before the first `return`** and before branching that could skip the read.

### Common pitfall

```js
const label = computed(() => {
	if (!active.value) return '…' // ❌ isPlaying is never tracked for inactive runs
	return isPlaying.value ? '▶' : 'Ⅱ'
})
```

### Safer pattern

```js
const label = computed(() => {
	const active = isActive.value
	const playing = isPlaying.value // read up-front so it’s tracked whenever needed
	if (!active) return '…'
	return playing ? '▶' : 'Ⅱ'
})
```

When you want to avoid “global signal fan-out” for large lists, prefer **`onCondition`** to update only the relevant rows/items.

## 3) `watch` vs `useEffect` vs `onDispose`

### `watch(fn)`

- Use for **reactive computations** and glue code that only needs to run when its dependencies change.
- Avoid doing “setup + cleanup” of external resources (DOM listeners, timers, subscriptions) directly in `watch`.

### `useEffect(effect, ...args)`

- Use when you need **setup + cleanup** that can re-run when dependencies change.
- Return a cleanup function:

```js
useEffect(() => {
	const el = ref.value
	if (!el) return
	const onClick = () => {}
	el.addEventListener('click', onClick)
	return () => el.removeEventListener('click', onClick)
})
```

### `onDispose(cleanup)`

- Use for **unmount-only** cleanup (release object URLs, close a single resource, final teardown).
- Avoid calling `onDispose` *inside* `watch` branches; prefer `useEffect` for cleanup that depends on reactive state.

## 4) Lists: keep updates local

- Use `<For entries={items} track="id">` for stable list identity.
- Avoid per-row `computed(() => currentId.value === item.id)` across huge lists if the global signal changes often.
- Prefer:
	- `onCondition(currentId)(item.id)` for “active row” selection.
	- `class:active={...}` and `class:playing={...}` to toggle classes without rebuilding strings.

## 5) DOM refs: use `$ref` (not an imported function)

- `$ref` is a **prop**, not an exported helper.
- Pass either a signal or a callback:
	- `const el = signal(null); <div $ref={el} />`
	- `<div $ref={(node) => { /* ... */ }} />`

## 6) Debounce & scheduling: `createDefer` / `createSchedule`

For “user is dragging a slider” scenarios, don’t spam expensive work. Use `createDefer` with a cancelable deferrer:

```js
const defer = createDefer((cb) => {
	const id = setTimeout(cb, 80)
	return () => clearTimeout(id)
})
```

Then write into an input signal (`target.value = ...`) and let the deferred signal drive the expensive side effect.

## 7) Tooling & HMR

- For Vite, use the Refurbish plugin to inject rEFui HMR code into `.jsx/.tsx` modules.
- During HMR, do not rely on return values of `render()` / `createComponent()` for “stable component handles” in dev; prefer `$ref`/`expose` patterns.

