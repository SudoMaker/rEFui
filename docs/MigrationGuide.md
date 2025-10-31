# Migration & QA Guide

Transitioning from other reactive UI libraries to rEFui usually raises the same set of questions. This guide captures the most common ones for teams coming from React, Solid, or Vue, focusing on three key areas:

- **Signals & scheduling** — how rEFui's fine-grained reactivity differs from hook/state or proxy-based models.
- **JSX handling** — what changes in the compiler/pragmas and how retained-mode rendering alters component shapes.
- **Lifecycle & render mode** — how retained nodes, disposers, and renderer scopes compare with the frameworks you may already know.

Use the sections below as a migration checklist or as an FAQ during onboarding.

## Core Differences At A Glance

- **Retained mode renderer**: Components return factory functions `(R) => ...` so the renderer can reuse DOM nodes. There is no virtual DOM diffing or template patching stage.
- **Signals everywhere**: Props, children, and derived values must remain signals to stay reactive. Plain expressions need wrapping with `$(() => ... )`, `tpl`, or a derived helper.
- **Pure asynchronous scheduling**: Signals flush on the async tick queue to minimize redundant DOM work. This "real workload" optimization can underperform in synthetic benchmarks that expect synchronous updates, but keeps production UIs fast.
- **Toolchain agnostic**: Any JSX-capable transpiler—Babel, esbuild, SWC, TypeScript—or even runtime JSX alternatives like HTM can drive rEFui. There’s no framework-specific compiler step, aligning with rEFui’s philosophy of using readily available tools to reach optimal performance.
- **Tick-based scheduling**: Signal updates batch until the end of the current microtask. Use `nextTick`/`tick` when you need to observe post-update values.
- **Macro/Directive split**: Built-in directives (`class:`, `style:`) live in presets. Custom behaviors attach through `m:` macros registered on the renderer.
- **Lifecycle scopes**: `onDispose`, `watch`, and component scopes line up with rEFui's retained fragments, not hook rules or template scopes.

---

## Coming From React

**Q: Does `signal()` replace `useState`, and can I read the new value immediately?**  
`signal()` stores are synchronous setters, but side effects run at the next tick. Reading `count.value` right after assignment gives the new value, yet computed signals and watchers flush later. Use `nextTick`/`tick` before relying on downstream derived updates.

**Q: Should I move all `useEffect` calls into `watch`?**  
`watch(fn)` covers most `useEffect` scenarios. It auto-tracks dependencies and returns a disposer, similar to the cleanup function pattern. For one-off setup with teardown, pair it with `onDispose`. There are no dependency arrays; rEFui tracks signals automatically.

**Q: Where do refs live?**  
Instead of `useRef`, pass a signal or callback to `$ref`. The renderer writes the live DOM node, and reactive code can observe it. There is no mutable `.current` API; treat the ref as another signal.

**Q: How do I replicate memoization (`useMemo`/`useCallback`)?**  
Signals and computed helpers obviate most manual memoization. When you need a derived value without subscription, use `untrack`. If you must memoize non-reactive work, use plain closures; there is no hook-order constraint.

**Q: What changes in JSX?**  
Classic transform mode expects `/** @jsx R.c */` and component factories returning `(R) => <div/>`. The automatic runtime (via `refui/jsx-runtime`) hides that factory parameter and—since v0.8.0—defaults to the Reflow renderer, so you rarely need to call `wrap()` yourself. In that automatic/Reflow setup you can author components that look like they return raw JSX, but ensure the concrete renderer you mount (DOM, HTML, etc.) can actually create the tags you emit. The architecture remains retained-mode, so in classic transform you still return a render function rather than raw children.

**Q: How does lifecycle differ?**  
There are no mount/update/unmount phases. A component's render factory runs once, and effects tie onto signals. `onDispose` fires when the retained fragment is removed. Think of it like `useEffect` cleanup without dependency arrays.

---

## Coming From Solid

**Q: Are `signal`, `computed`, and `watch` direct drop-ins for `createSignal`, `createMemo`, and `createEffect`?**  
The semantics are close, but rEFui batches effects at tick boundaries by default. You may need `nextTick` or `tick` when porting logic that assumed Solid's synchronous recomputation. `watch` is eager and runs once immediately (configurable via `runImmediate` when using `signal.connect`).

**Q: Do I still need `on` helpers?**  
Use `.touch()` to depend on a signal without reading it, or chain helpers like `.choose`/`.and` for branching logic. Most `on` patterns map cleanly to these helpers.

**Q: How are lifecycles scoped?**  
`onDispose` corresponds to Solid's `onCleanup`, tied to the current computation scope. Because rEFui components return retained render factories, make sure cleanup lives inside that returned closure or inside effects created within it.

**Q: JSX differences?**  
Solid components return JSX nodes directly. rEFui classic components return `(R) => <...>` functions so the renderer can control node creation. If you migrate, wrap former Solid component bodies inside the returned function and convert expressions to signals if needed.

**Q: Render mode and hydration?**  
Both frameworks are fine-grained, but Solid compiles templates into DOM operations ahead of time. rEFui stays runtime-retained, so macros (`m:`) and directives (`class:`) execute per node instead of the compile stage. When porting Solid custom directives, register macros on the DOM renderer.

---

## Coming From Vue

**Q: Does `signal` map to `ref`, and how do I create writable computed values?**  
Yes—`signal` behaves like a Vue `ref`. For derived values use `computed(() => ...)`. Writable computed refs can be implemented with `signal(source, compute)` or by composing `.choose`/`.select` helpers.

**Q: How does `watch` compare to Vue's `watch` vs `watchEffect`?**  
`watch(fn)` behaves like `watchEffect` with eager execution. To mimic lazy watchers (`watch(source, cb, { immediate: false })`) call use `connect([...sources], effect, false)`.

**Q: Where is `nextTick` used?**  
`nextTick` resembles Vue's DOM-flush tick, but it only guarantees that signal effects have run. If you need to observe rendered DOM, pair it with `$ref` signals or schedule logic inside the renderer's macros.

**Q: How do I replace template refs and directives?**  
Templates become JSX with either the classic pragma or automatic runtime. Template refs become `$ref` or signal props. Directives map to `class:`/`style:` presets or `m:` macros you register on the renderer. Convert Vue's `v-if`/`v-for` to `<If>`/`<For>` components from `refui/components`.

**Q: Lifecycle hooks?**  
Vue's `onMounted`/`onUnmounted` become effects plus `onDispose`. Remember that rEFui disposes scopes when the retained fragment leaves the tree; there is no separate before/after update hook—reactive signals drive everything.

---

## Coming From Svelte

**Q: Are signals the same as Svelte stores or `$:` declarations?**  
Signals cover both writable stores and reactive statements. Unlike Svelte's synchronous compile-time updates, rEFui batches signal work asynchronously to collapse redundant DOM writes. Expect the same end result but plan for `nextTick` when you need values after a mutation.

**Q: How do I migrate `$:` reactive blocks or `derived` stores?**  
Turn `$:` blocks into `watch` effects or `computed` signals. If the block mutated local state, model that state as a signal and update it inside `watch`. Derived stores become `computed` or helpers like `.select`.

**Q: What replaces `onMount`, `afterUpdate`, and `onDestroy`?**  
`watch` handles `onMount`/`afterUpdate` patterns—effects run once immediately and then on dependency changes. Use `onDispose` for cleanup previously handled by `onDestroy`. rEFui skips dedicated post-update hooks; if you need DOM access, rely on `$ref` plus `nextTick`.

**Q: How do I port two-way bindings like `bind:value`?**  
Model the value as a signal and wire listeners manually (`on:input` plus assignment) or register an `m:` macro for repeated patterns. Because components return render factories, you can share binding helpers by exporting functions that take signals and return event handlers.

**Q: Svelte optimizes compiled templates — does rEFui keep up?**
Svelte precomputes DOM operations; rEFui opts for runtime retention with asynchronous batching. Microbenchmarks that toggle thousands of nodes may favor Svelte, but rEFui's scheduler aggressively skips no-op DOM writes, making real-world UI updates competitive. Profile with real interactions rather than synthetic loops.

---

## JSX & Renderer Checklist

- **Choose a JSX strategy**: Prefer the classic transform if you want per-component renderers (`(R) => ...`). Use the automatic runtime only when tooling cannot inject `R` (MDX, SWC, Deno). Configure `jsxFactory`/`jsxFragment` or `jsxImportSource` accordingly.
- **Map components to retained factories**: Every component should export a function returning `(R) => ...`. Convert existing React/Solid/Vue bodies by wrapping the prior JSX in that returned closure.
- **Audit expressions**: Any inline computed value (string interpolation, ternaries, etc.) must be a signal. Wrap complex expressions with `$(() => ...)`, `tpl\`...\`` or established derived helpers.
- **Register macros**: Port custom DOM directives (e.g., Vue directives, Solid custom directives) using `renderer.useMacro({ name, handler })` and reference them via `m:name` in JSX.
- **Lifecycle**: Replace hook lifecycle code with `watch`, `useEffect`, and `onDispose`. Ensure cleanups live inside the component render factory scope.

---

## Additional Resources

- [Signals](Signal.md) — deep dive into batching, helpers, and utilities like `nextTick` and `bind`.
- [Components](Components.md) — retained component patterns (`<If>`, `<For>`, `<Async>`), useful while replacing template syntax from other frameworks.
- [DOM Renderer](DOMRenderer.md) — covers directives, events, and macro registration referenced in this guide.
- [JSX Setup](JSX.md) — configuration for classic vs automatic runtimes, required when adjusting build pipelines during migration.
