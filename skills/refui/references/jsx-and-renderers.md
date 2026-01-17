# JSX Modes and Renderers (decision guide)

Use this file when you need to choose the correct component shape, JSX config, and renderer wiring for an existing codebase.

## Step 1: Identify JSX mode

### Automatic runtime (common in modern rEFui apps)

Typical config clues:
- Vite/esbuild: `jsx: 'automatic'` and `jsxImportSource: 'refui'`
- TypeScript/Bun: `jsxImportSource: "refui"` with `jsx: "react-jsx"`

Author components like:
- `const Comp = (props) => <div />`

Mount like:
- Create a host renderer (DOM/HTML/custom).
- Call `renderer.render(root, App)` (DOM) or `renderer.serialize(node)` (HTML).

Notes:
- Since rEFui v0.8.0+, the automatic runtime binds to Reflow by default; you usually do not need to call `wrap()` unless you need to override the global renderer.

### Classic transform (preferred when you want per-file renderer swapping)

Typical config clues:
- `jsxFactory: 'R.c'` and `jsxFragment: 'R.f'`
- File-level pragmas: `/** @jsx R.c */` and `/** @jsxFrag R.f */`

Author components like:
- `const Comp = (props, ...children) => (R) => <div />`

Notes:
- This style makes it explicit that you’re returning a render factory `(R) => ...`.
- Avoid mixing component authoring styles within the same repo unless the repo intentionally does so.

## Step 2: Pick the renderer (what are we rendering to?)

### DOM renderer (interactive browser UI)

- Create: `createDOMRenderer(defaults)` from `refui/dom` + `refui/browser` (or `refui/presets/browser` in older repos)
- Use directives/events:
  - `on:*` for events (plus `on-once:*`, `on-passive:*`, `on-capture:*`)
  - `class:*` / `style:*` directives when using the browser preset
  - `attr:*` for attributes (especially SVG) and `prop:*` to force property writes
  - `m:*` for macros registered on the renderer

### HTML renderer (SSR/SSG)

- Create: `createHTMLRenderer()` from `refui/html`
- Render: `renderer.createElement(App, props)` then `renderer.serialize(node)`
- Events are ignored (no DOM); signals resolve to their current values at render time.
- Use `rawHTML` only with trusted strings.

### Reflow runtime (renderer-agnostic logic)

Use Reflow when you want to author logic without binding it to a host renderer.

Common patterns:
- Automatic runtime (default): JSX runtime targets Reflow already.
- Classic transform: inject `R` from `refui/reflow` (e.g., via Vite `jsxInject`) so `R.c`/`R.f` exist in scope.

Interop note:
- If you manually construct host nodes (or pass through nodes from another renderer), mark them with `markNode` from `refui/reflow` so the runtime doesn’t treat arrays as child lists.

