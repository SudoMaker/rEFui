# Project Triage (when rEFui is just a dependency)

Use this file when you cannot rely on reading rEFui’s source or local docs and must infer the correct usage from the consuming project.

## 1) Determine JSX mode (this decides component shape)

### Automatic runtime

Look for any of:
- Vite/esbuild config: `jsx: 'automatic'` and `jsxImportSource: 'refui'`
- TypeScript/Bun: `jsxImportSource: "refui"` with `jsx: "react-jsx"`
- Babel: `@babel/preset-react` with `"runtime": "automatic"` and `"importSource": "refui"`

Typical component style:
- `const Comp = (props) => <div />`

### Classic transform

Look for any of:
- Vite/esbuild config: `jsxFactory: 'R.c'` and `jsxFragment: 'R.f'`
- File pragmas: `/** @jsx R.c */` and `/** @jsxFrag R.f */`

Typical component style:
- `const Comp = (props, ...children) => (R) => <div />`

If the codebase already has a consistent style, match it; do not “upgrade” JSX mode during unrelated changes.

## 2) Determine renderer target (this decides imports/directives)

### Browser UI (interactive)
- Look for `createDOMRenderer(...)` or imports from `refui/dom`.
- Expect directives: `on:*` for events; `class:*`/`style:*` when using the browser preset; `attr:*`/`prop:*` for attribute/prop forcing; `m:*` for macros.

### SSR/SSG (string output)
- Look for `createHTMLRenderer(...)` or imports from `refui/html`.
- Expect `.serialize(...)` usage.
- Event handlers won’t run; output is static.

### Reflow (renderer-agnostic logic)
- Look for imports from `refui/reflow` or build config injecting `R` from `refui/reflow`.
- Expect logic-centric components; host elements might be used sparingly.

## 3) Determine “browser preset” flavor (naming changes across versions)

Some projects import defaults from:
- `refui/browser` (common in newer versions)
- `refui/presets/browser` (common in older versions)

Prefer the existing import style already used in the project.

## 4) Determine rEFui version

Why it matters: minor releases can shift available helpers or recommended patterns.

Best signals:
- `package.json` dependency version for `refui`
- lockfile (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`)
- TypeScript types (if present) under the installed package

If behavior differs from assumptions, treat the project’s usage as canonical and adapt.

## 5) Quick pitfall scan

Run the audit script on the project root:
- `node scripts/refui-audit.mjs <path>` (run from inside the installed skill folder)

Then validate fixes against the retained-mode rules in `references/reactivity-pitfalls.md`.
