# Reactivity Pitfalls (high-signal checklist)

Use this file when debugging “it renders once but doesn’t update”, list updates behaving oddly, or effects leaking.

## 0) This is not React (retained mode)

Component bodies are setup-only. JSX is evaluated once, then signals drive updates. Do not import React mental models (hooks, rerender cycles, virtual DOM assumptions).

## 1) Inline `.value` in JSX (most common)

Because rEFui is retained-mode, JSX is not re-executed to re-compute expressions.

- ✅ Reactive: `<div>{count}</div>` (pass the signal)
- ✅ Reactive: `<div>{$(() => `Count: ${count.value}`)}</div>` (derived/computed signal)
- ❌ Usually wrong: `<div>{count.value}</div>` (evaluated once)

Fix pattern:
- If it’s just a signal, pass the signal itself.
- If it’s a computed string/number/boolean, create a derived signal via `$(() => ...)` / `computed(() => ...)` / `t\`...\``.

Note on `.value`:
- ✅ Use `.value` inside `computed` / `$(() => ...)` / `watch` / event handlers to read or write.
- ❌ Avoid `.value` directly inside JSX text/attrs; JSX does not re-run.

## 2) Mutating objects/arrays inside a signal

Signals track changes on the signal itself, not mutations deep inside the stored value.

If you mutate in place:
- Call `sig.trigger()` after the mutation.

If you want immutable updates:
- Replace the value with a new array/object: `sig.value = [...sig.value]`, `sig.value = { ...sig.value, x: next }`.

If updates are frequent per-field:
- Use nested signals for hot fields.

## 3) Stale derived values (scheduler got you)

Effects/computed flush at the end of the tick. If you need to observe derived values after a write:
- `await nextTick()`

Prefer `nextTick` over manually calling `tick()` unless you truly need to kick the scheduler.

## 4) Dependency tracking “early return” trap

Signals are tracked only when they are read during the synchronous run of a computation.

If you return before touching a dependency, it won’t be tracked:
- Read all dependencies first, then branch.

Example (buggy):
- `const label = $(() => isLive.value ? 'Live' : `Step ${index.value + 1} of ${len.value}`)`
If `isLive.value` is true, `index`/`len` are never read, so changes to them won’t trigger updates.

Fix:
- Read all dependencies first: `const label = $(() => { const live = isLive.value; const i = index.value; const l = len.value; return live ? 'Live' : `Step ${i + 1} of ${l}` })`

## 5) Effects/lifecycle cleanup

Preferred patterns:
- `watch(fn)` for reactive computations (returns disposer).
- `useEffect(setup)` for setup + cleanup (cleanup is returned).
- `onDispose(cleanup)` for teardown-only.

Smell:
- Global `addEventListener` without matching cleanup.
- Effects created outside a component scope (no automatic disposal).

## 6) DOM props vs attributes (SVG gotchas)

If a prop seems ignored or throws (common with SVG):
- Use `attr:*` (e.g., `attr:viewBox`, `attr:stroke-width`).

If you must force a property write:
- Use `prop:*`.

## 7) Lists and identity

- Use `<For entries={items} track="id">` for stable identity.
- If you reorder with in-place mutations, remember `items.trigger()`.
- For perf experiments and reorder-heavy scenarios, consider `UnKeyed` from `refui/extras/unkeyed.js` (but treat it as a deliberate choice).
- For large lists with selection/highlight, prefer `onCondition(selectedId)` to create per-row match signals instead of repeating `computed(() => selectedId.value === rowId)` everywhere.

## 8) Control-flow components have strict child rules

`If` accepts **two** children: true branch, then false branch. Each branch must be a single renderable.  
`For` accepts a single template.

If you need multiple nodes inside a branch:
- Wrap them in a container element (e.g., `<div>...</div>`) or a fragment.
- Otherwise only the first child will render, and the rest will be dropped.

Also:
- `For` has **no** `fallback` prop. Use `If` for empty states.

## 9) Common mistakes to avoid (generic)

- Mixing two modes as multiple children of a single `If`:
  - `If` only takes **two** children (true branch, false branch). Extra siblings are ignored.
  - Wrap each branch in a single container if it needs multiple nodes.
- Conditional computed that skips dependencies; read all dependencies before branching.
- `watch` that accidentally tracks a control signal you only wanted to observe; use `peek` when you need a non-tracking read.
- Using a stale lookup map after list reorder:
  - If you build a `Map` from an array once and then reorder the array, the map reflects **old positions**.
  - For lookups by id, rebuild the map from the latest `signal` each time (or compute it with `$(() => new Map(...))`).
  - For ordering logic, always read from the current array signal, not a cached copy.
- Applying state snapshots while also updating indices in the same tick; schedule with `nextTick()` to avoid races.

## 10) Time‑travel / history sliders (generic fix notes)

When implementing a history slider:
- Record snapshots **after** state changes, but guard during restore (e.g., `isRestoring` / `isRecording` flags).
- Apply snapshots directly on slider input instead of relying on a watcher that can be preempted.
- If slider max depends on history length, update the index on `nextTick()` so the DOM range bounds update first.
