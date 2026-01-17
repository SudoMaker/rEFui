# rEFui Do’s and Don’ts (anti-React guardrails)

Use this file whenever you are about to write or refactor rEFui code. It is intentionally repetitive to keep weaker models from “slipping into React”.

## Core mental model

### Do
- Treat component bodies as **setup**: build the retained UI once, then update via signals.
- Keep state in **signals**, not in local variables that you expect to “re-render”.
- Assume effects/computed flush **at end of tick**; use `nextTick` when you must observe derived updates.

### Don’t
- Don’t assume re-renders/VDOM diffing.
- Don’t introduce React hooks (`useState`, `useMemo`, `useCallback`, dependency arrays) or hook-order reasoning.
- Don’t “lift state” by default; keep it close to where it’s read.

## `signal` (state)

### Do
- Use `signal(initial)` for mutable state.
- Pass signals directly into JSX for reactive text/props/children: `{sig}` not `{sig.value}`.
- After in-place mutation of arrays/objects stored in a signal, call `sig.trigger()`.

### Don’t
- Don’t write `{sig.value}` in JSX expecting updates (evaluates once).
- Don’t destructure `const {x} = sig.value` and expect reactivity unless `x` is itself a signal.

## `$` / `computed` (derived state)

### Do
- Use `$(() => ...)` / `computed(() => ...)` for **computed expressions** (string templates, ternaries, math, formatting).
- Read dependencies *before* branching when early returns exist (dependency tracking).

### Don’t
- Don’t compute derived strings inline in JSX via `.value` reads.
- Don’t use memoization to “fix” stale derived values; it usually hides a dependency bug.

## `read`, `peek`, `touch`, `untrack` (signal hygiene)

### Do
- Use `read(x)` when `x` might be a signal or a plain value (common for props).
- Use `peek(sig)` to read without subscribing.
- Use `sig.touch()` when you need to depend on changes without reading the value.
- Use `untrack(fn)` for one-off reads that must not create dependencies.

### Don’t
- Don’t eagerly unwrap everything with `.value` “because that’s how React state works”.
- Don’t use `peek` inside derived computations as a shortcut; it disables tracking and can create stale UI.

## `watch`, `useEffect`, `onDispose` (lifecycle/effects)

### Do
- Use `watch(fn)` for reactive computations; keep it within a component scope so disposal happens.
- Use `useEffect(setup)` for “setup + cleanup” (DOM listeners, intervals, subscriptions). Return cleanup.
- Use `onDispose(cleanup)` for teardown-only cleanup in the current scope.

### Don’t
- Don’t add global listeners without cleanup.
- Don’t create effects outside a component scope unless you intentionally want process-lifetime behavior.
- Don’t use “dependency arrays”; rEFui tracks signals automatically.

## `useAction` (push-style events)

Use `useAction` when you need a lightweight event channel (fire-and-forget notifications) without sharing mutable state across modules.

### Do
- Use it for “an event happened” signals: service worker events, one-shot prompts, imperative triggers.
- Keep payloads small; store long-lived state in signals instead.

### Don’t
- Don’t replace normal state with `useAction`; it’s for events, not storage.

## `nextTick` / `tick` (scheduling)

### Do
- Use `await nextTick()` (or `nextTick(cb)`) when you need post-flush derived values or DOM changes to have applied.

### Don’t
- Don’t assume synchronous propagation of computed/effects.
- Don’t call `tick()` as a generic “fix”; prefer `nextTick` when you need sequencing.

## Renderers (DOM/HTML/Reflow)

### Do
- Create host renderer instances **once** at the entry point (e.g. `main.js`) and reuse them.
- For browser UI, use the DOM renderer + browser preset defaults when available.
- For SSR/SSG output, use the HTML renderer and serialize once you’ve produced the node.

### Don’t
- Don’t create renderers inside components.
- Don’t assume DOM-only behaviors exist when rendering to HTML/Reflow.

## `<If>` (conditional UI)

### Do
- Prefer `<If condition={cond}>{() => <Then/>}{() => <Else/>}</If>` so disposal happens correctly when branches swap.
- Put branch-only subscriptions inside the branch so they dispose when hidden.

### Don’t
- Don’t rely on inline JS conditionals that keep both branches alive when you actually need disposal semantics.

## `<For>` (lists)

### Do
- Use `<For entries={items} track="id">` for stable identity when items have IDs.
- Use `indexed` when you need a reactive index.
- For in-place list mutation (push/splice/sort), call `items.trigger()`.
- Use `extract`/`derivedExtract` for per-row field subscriptions instead of reading a giant object everywhere.

### Don’t
- Don’t use array index as identity unless you truly want “position identity”.
- Don’t rebuild the entire list for small changes if `<For>` can handle it.

## `onCondition` (high-scale selection/matching)

`onCondition(source)` returns a matcher function that produces boolean signals for “does this equal X?” checks, optimized for large fan-out scenarios (many rows/components checking against one selection).

### Do
- Use it for selection/highlighting in large lists:
  - `const isSelected = onCondition(selectedId)`
  - In each row: `const active = isSelected(rowId)` then `class:active={active}`
- Prefer it over `computed(() => selectedId.value === rowId)` repeated across many rows.
- Use it to avoid global boolean fan-out by scoping comparisons locally.

### Don’t
- Don’t compute “selected” booleans centrally for every row unless you need a precomputed map.
- Don’t store derived booleans in plain locals; keep them as signals.

## `Fn` (inline dynamic subtrees)

### Do
- Use `Fn` when you need an inline render function with its own lifecycle/disposal.

### Don’t
- Don’t use `Fn` as a substitute for normal components everywhere; keep it for cases that benefit from scoped lifecycles.

## `Dynamic` / `Render` (dynamic components/instances)

### Do
- Use `Dynamic` when the tag/component type changes at runtime.
- Use `Render` (and `createComponent`) when you need to manage component instances explicitly (rare in app code).

### Don’t
- Don’t create component instances in hot paths unless you truly need manual lifetime control.

## `memo` / `useMemo` (component memoization)

### Do
- Use memoization only when you’ve identified repeated construction of a large subtree that can be reused across parents.

### Don’t
- Don’t use memoization as a default “performance optimization”; rEFui’s fine-grained signals handle most cases.

## `<Async>`, `<Suspense>`, `lazy`, `Transition` (async UI)

### Do
- Use `<Async>` for a single promise boundary with fallback/error.
- Use `<Suspense>` to group multiple async subtrees under one fallback.
- Use `lazy()` for code/data deferred component loading and pair it with a fallback boundary.
- Use `Transition` for “swap content with pending/leaving/entering states” patterns.

### Don’t
- Don’t hand-roll loading booleans everywhere when an async boundary expresses intent better.
- Don’t recreate promises every time the component runs unless you explicitly want refetch.

## Portals / overlays / “render elsewhere”

### Do
- Prefer `createPortal()` (extras) or the project’s existing portal primitive so content disposes correctly.
- Use macros (`m:*`) for reusable DOM behaviors (click-outside, scroll lock, focus trap).

### Don’t
- Don’t append nodes to `document.body` manually without cleanup/disposal.

## DOM renderer directives (browser)

### Do
- Use `on:*` for events; call `preventDefault()` in the handler when needed.
- Use `class:*` / `style:*` directives (browser preset) for reactive toggles.
- Use `attr:*` for SVG and when DOM props are read-only; use `prop:*` to force property writes.

### Don’t
- Don’t use React-style `onClick` props.
- Don’t mutate DOM outside macros/effects unless you own the node and clean it up.

## `$ref` and `expose` (imperative handles)

### Do
- Use `$ref={signal}` or `$ref={(node) => ...}` to access DOM nodes safely.
- Use `expose` callback props (when available) to publish child handles to parents.

### Don’t
- Don’t rely on return values of renderer `render()` in HMR-heavy dev flows; use `$ref`/`expose`.

## `extract` / `derivedExtract` (field-level subscriptions)

### Do
- Use extraction helpers to avoid fanning out dependencies from large object signals.
- Use tolerant patterns for nullable sources (e.g., safe object computed) when required by your project.

### Don’t
- Don’t read deep object properties everywhere (`big.value.a.b.c`) across many components; it creates broad coupling.

## `createDefer` / `createSchedule` (coalescing expensive work)

### Do
- Use deferrers/schedulers to coalesce rapid inputs (search boxes, window resize, scroll).
- Keep the scheduled callback small and cancelable.

### Don’t
- Don’t spam `watch`/`useEffect` with expensive synchronous work on every keystroke; defer/coalesce.
