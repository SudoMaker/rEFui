# rEFui Best Practices & Troubleshooting

This guide consolidates performance tips, reactive patterns, renderer notes, and common pitfalls. Prefer these patterns before reaching for custom memoization or heavy abstractions.

## 1) SVG attributes in JSX
React-style props on SVG can hit read-only DOM properties. Use `attr:` to set attributes.
```jsx
// ❌ Incorrect
<svg width="24" viewBox="0 0 24 24" />

// ✅ Correct
<svg attr:width="24" attr:viewBox="0 0 24 24" />
```

## 2) Reactivity & object properties
Signals track reads/writes on the signal itself, not nested object mutations.
```ts
// ❌ Mutation won’t notify
tracks.value[0].sampleRate = 44100

// ✅ Preferred: mutate in place + trigger for GC-friendly updates
tracks.value[0].sampleRate = 44100
tracks.trigger() // re-run dependents without recreating the array

// ✅ Replace object
const next = [...tracks.value]
next[0] = { ...next[0], sampleRate: 44100 }
tracks.value = next

// ✅ Nested signals for frequent updates
track.sampleRate.value = 44100
```

## 3) `derivedExtract` with nullable sources
`derivedExtract` tolerates `null`/`undefined` sources. You can extract directly without a safe wrapper:
```ts
const current = signal<Track | null>(null)
const { title, sampleRate } = derivedExtract(current, 'title', 'sampleRate')
```

## 4) Computed dependency tracking (early-return trap)
Read dependencies before branching so they’re tracked.
```js
const info = computed(() => {
	const t = track.value
	const m = metadata.value
	if (!t) return 'Ready'
	return `${t.title} - ${m}`
})
```

## 5) Component structure
Define complex computeds at the top of a component; keep JSX lean.
```jsx
const fileInfo = computed(() => /* ... */)
return <div>{fileInfo}</div>
```

## 6) Mental model: retained rendering + signals
- No VDOM diff; signals drive precise updates.
- Use signals only when values must stay reactive; literals are fine for static props/children.

## 7) Dependency tracking: read before branching/returning
If a value may matter, read it before an early return. Use `onCondition` to scope fan-out in large lists.

## 8) `watch` vs `useEffect` vs `onDispose`
- `watch`: reactive computations, no external cleanup.
- `useEffect`: setup + cleanup that reruns when deps change.
- `onDispose`: teardown only.

## 9) Lists: keep updates local
- Prefer `<For entries={items} track="id">`.
- Use `onCondition` or class toggles for per-row state instead of wide `computed` fan-out.

## 10) DOM refs: `$ref` prop
Pass a signal or callback: `<div $ref={el} />` or `<div $ref={(n) => ...} />`.

## 11) Debounce & scheduling
Use `createDefer` / `createSchedule` with cancelable deferrers to coalesce expensive work during rapid input.

## 12) Tooling & HMR
- Use Refurbish (Vite/Webpack/Rspack) for HMR.
- Prefer `$ref`/`expose` over relying on return values of `render()` in dev.

## 13) Custom render targets
If you have a DOM-like API, pass its `doc` to `createDOMRenderer`. Otherwise, implement `nodeOps` via `createRenderer`; see CustomRenderer.md.

## 14) Suspense/Async notes
- Async components with their own `fallback` render immediately (not accumulated).
- `suspensed` on `<Async>` defaults true; set false to skip Suspense.
- `onLoad` exists on Async/Suspense and can replace the resolved value (return `undefined` for side effects).

## 15) Avoid stale derived values
Effects/computeds flush at tick end. Use `await nextTick()` to read fresh derived values after writes.
