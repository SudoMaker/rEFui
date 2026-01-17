# Async UI: `<Async>`, `<Suspense>`, `lazy`, `Transition`

Use this file when a requirement involves: data fetching, async components, loading states, “skeletons”, progressive rendering, or coordinating multiple async subtrees.

## Mental model

- rEFui is retained-mode: the UI structure is created once; signals drive updates; async work updates signals later.
- Async boundaries are explicit and disposable: prefer built-ins so cleanup happens when the subtree unmounts.

## Pick the right primitive

### “I have a promise and want a loading + error + resolved UI”

Use `<Async>` when:
- You already have a `Promise` (or thenable) and want clear pending/resolved/error rendering.

Typical shape (exact props may vary by version; confirm with MCP if unsure):
- `future`: the promise
- `fallback`: pending UI
- `catch`: error UI
- children: resolved UI render function

Guidance:
- Keep `future` stable if you don’t want refetching.
- Store results in signals if they must be reused elsewhere.

### “I have multiple async children and want a single fallback while any are pending”

Use `<Suspense>` when:
- You want to group multiple async subtrees under one boundary (shared loading UI).

Good for:
- Page-level loading states
- Panels where parts load independently but should share one fallback

Avoid:
- Putting giant unrelated trees under one suspense boundary if you want partial interactivity.

### “I want components that load code/data lazily”

Use `lazy(loader)` when:
- You want code-splitting or deferred component resolution.

Guidance:
- Use with `<Suspense>` or `<Async>` so users see a fallback.
- If the loader may resolve to a module with named exports, pass/select the export as needed.

### “I want a transition between old/new content while new content is loading”

Use `Transition` when:
- You want coordinated “pending/leaving/entering/entered” states across a subtree (animations/skeleton overlap).

Typical use cases:
- Route changes
- List filter/sort swaps with animated continuity

Pattern:
- Drive a “pending” signal for UI affordances (opacity/spinners).
- Use `class:`/`style:` directives (browser preset) to toggle animation classes based on transition signals.

## Best practices

- Prefer signals as state holders; wire fetch results into signals rather than storing in plain locals.
- Don’t assume synchronous completion: when you need post-update consistency, use `await nextTick()`.
- Keep async effects cancellable:
  - If you spawn a fetch in an effect, use `AbortController` and clean up in disposer (`useEffect`/`onDispose`).
  - Guard async callbacks with context validity (or equivalent patterns in the codebase) so disposed components don’t update state.

## Common pitfalls

- Rendering dynamic strings from `.value` directly inside JSX (`{sig.value}`) and expecting updates. Prefer `{sig}` or derived signals.
- Recreating promises every render (causes refetch). Create the promise once per “intent change”, store it in a signal if needed.
- Manual “loading” booleans scattered across components: prefer using `<Async>`/`<Suspense>` boundaries to concentrate logic.

## When unsure

Use MCP to confirm exact props/return shapes for your rEFui version:
- Context7: query “Async component API”, “Suspense API”, “Transition API”, “lazy loader”.

