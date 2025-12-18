# FAQ

Common questions and quick answers about rEFui’s performance, rendering targets, and toolchains.

## How do I keep performance high in data‑intensive apps?
rEFui is fine‑grained: signals track exactly the dependencies they touch, so unaffected subtrees don’t re-render. Prefer storing state in signals close to where it’s read, and rely on built-in tracking instead of manual memoization. Use `For`/`UnKeyed` for lists to avoid diffing, and `createCache` for reusable heavy fragments. Reach for `memo` only when you need to reuse a large subtree across multiple parents (similar to Vue’s keep-alive), not for routine updates.

## Do I need React-style hooks or a VDOM?
No. rEFui is retained-mode with signals. Effects (`watch`, `useEffect`) run off tracked dependencies; there’s no reconciliation loop or hook ordering rules. JSX returns render functions that operate directly on renderer nodes.

## Are there logic shorthands for common boolean patterns?
Yes. Signals expose helpers: `inverse`, `and`, `or`, `choose`, `select`, etc. Example: `const enabled = signal(true); const disabled = enabled.inverse();` or `const status = isReady.choose('ready', 'pending')`. These return signals, so they stay reactive without manual wiring.

## How do I target a non-browser environment?
Prefer using a DOM shim over writing a renderer from scratch. Drop in [undom-ng](https://github.com/ClassicOldSong/undom-ng) to supply a DOM layer, then reuse the DOM renderer. Examples:
- NativeScript: [DOMiNATIVE](https://github.com/SudoMaker/nativescript-dom-ng) builds on undom-ng.
- Embedded/desktop: the upcoming Resonance runtime ships DOM bindings for LVGL and Dear ImGui; its FFI plus undom-ng lets you wire other native UIs.

If you must write a renderer, implement `createRenderer(nodeOps)` mapping your platform primitives to `isNode`, `createNode`, `createTextNode`, `createFragment`, `appendNode`, `insertBefore`, `removeNode`, and `setProps`.

## How do I set up esbuild for JSX?
- Classic pragma: `esbuild src/main.jsx --bundle --outfile=dist/bundle.js --jsx-factory=R.c --jsx-fragment=R.f` (or via JS API with the same options). Use when you want per-file renderer swapping or Reflow classic patterns.
- Automatic runtime: `esbuild src/main.jsx --bundle --outfile=dist/bundle.js --jsx=automatic --jsx-import-source=refui`. Use for the default Reflow binding and simpler ergonomics.

## When should I use classic JSX vs automatic?
Classic: when you need per-file renderer swapping, explicit access to `R`, or custom pragmas. Automatic: default for most apps; pairs with Reflow and works with MDX/SWC toolchains.

## Does Suspense track deferred/scheduled work?
No. Suspense tracks async components and `<Async>` boundaries. Work queued with `createDefer`/`createSchedule` does not trigger Suspense fallbacks.

## Can I just write async components?
Yes. An `async` component that returns a promise is wrapped like `<Async>` automatically; you can still pass `fallback`/`catch` props. Combine with `Suspense` for grouped loading states.

## What renderer should I pick to start?
Use the DOM renderer for browsers, the HTML renderer for SSR, and Reflow when you want renderer-agnostic logic or to swap renderers later. For new projects, Vite + automatic JSX is the fastest path; switch to classic JSX when you need explicit renderer control.

## How do I avoid stale derived values?
Effects/computed signals flush at the end of the tick. Use `nextTick`/`await nextTick()` to read freshly derived values after mutations; use `tick()` only when you need manual flushing.

## How do I share imperative handles?
Pass an `expose` prop to children; inside the child call `expose({ api… })`. This replaces the older global expose pattern and stays stable across async boundaries.

## How do I portal content across the tree?
Use `createPortal()` from `refui/extras`; it returns `[Inlet, Outlet]`. Render `<Inlet>` where you produce content and `<Outlet>` where you consume it. Portals are renderer-agnostic. With Reflow renderer, you can even input from a DOM renderer and output to a HTML renderer, and vise versa.

## How does HMR work?
Use the `refurbish` plugin (Vite/Webpack/Rspack). Components are retained; state survives reloads. You don’t need `import.meta.hot` boilerplate in components.

## What if I need templated strings as signals?
Use `tpl\`...\`` from `refui/signal` to build a reactive string; it tracks embedded expressions automatically.
