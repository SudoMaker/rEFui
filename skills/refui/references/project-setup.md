# Project Setup (default: JSX automatic + JavaScript)

Use this file when the user asks to start a new rEFui project, or when the repo has no existing build setup.

## First: ask two questions (and only these)

1. Package manager: `npm`, `pnpm`, `yarn`, or `bun`?
2. Language: JavaScript or TypeScript?

Do **not** ask which runtime they use. If the user explicitly says “use Bun” / “use Deno” / “use Node”, adapt commands accordingly.

If the user doesn’t specify, default to:
- Package manager: `npm`
- Language: JavaScript
- JSX mode: automatic runtime
- Install `refui` from npm (latest)

## Recommended default toolchain: Vite (pure JS)

### 1) Scaffold

Choose the command based on package manager:

- npm: `npm create vite@latest my-refui-app -- --template vanilla`
- pnpm: `pnpm create vite my-refui-app --template vanilla`
- yarn: `yarn create vite my-refui-app --template vanilla`
- bun: `bunx create-vite my-refui-app --template vanilla`

Then:

- `cd my-refui-app`

### 2) Install dependencies

- npm: `npm i refui` and (recommended for HMR) `npm i -D refurbish`
- pnpm: `pnpm add refui` and `pnpm add -D refurbish`
- yarn: `yarn add refui` and `yarn add -D refurbish`
- bun: `bun add refui` and `bun add -d refurbish`

### 3) Configure JSX automatic runtime for rEFui

Create or edit `vite.config.js`:

- Add `esbuild.jsx = 'automatic'`
- Add `esbuild.jsxImportSource = 'refui'`
- If using refurbish, add the plugin (Vite) and keep the rest minimal.

Minimal example shape:
- `import { refurbish } from 'refurbish/vite'`
- `export default { plugins: [refurbish()], esbuild: { jsx: 'automatic', jsxImportSource: 'refui' } }`

### Template files (JS + JSX automatic)

Use these minimal files as a known-good starting point.

`vite.config.js`:
```js
import { defineConfig } from 'vite'
import { refurbish } from 'refurbish/vite'

export default defineConfig({
	plugins: [refurbish()].filter(Boolean),
	esbuild: {
		jsx: 'automatic',
		jsxImportSource: 'refui',
	},
})
```

`index.html`:
```html
<!doctype html>
<html>
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>rEFui</title>
	</head>
	<body>
		<div id="app"></div>
		<script type="module" src="/src/main.jsx"></script>
	</body>
</html>
```

`src/main.jsx`:
```jsx
import { createDOMRenderer } from 'refui/dom'
import { defaults } from 'refui/browser'
import App from './App.jsx'

const renderer = createDOMRenderer(defaults)
const root = document.getElementById('app')
renderer.render(root, App)
```

`src/App.jsx`:
```jsx
import { signal } from 'refui'

export default function App() {
	const count = signal(0)
	return (
		<div>
			<h1>Hello, rEFui</h1>
			<button on:click={() => count.value++}>
				Count: {count}
			</button>
		</div>
	)
}
```

### 4) Rename entry files to JSX

Vite’s vanilla template uses `src/main.js`. Switch it to JSX:

- Rename `src/main.js` → `src/main.jsx`
- Update `index.html` script to point to `/src/main.jsx`

### 5) Create the rEFui entry (DOM renderer)

In `src/main.jsx`:

- Create the renderer once:
  - `import { createDOMRenderer } from 'refui/dom'`
  - `import { defaults } from 'refui/browser'` (if the project already uses `refui/presets/browser`, match it)
  - `const renderer = createDOMRenderer(defaults)`
- Render a root component:
  - `renderer.render(document.getElementById('app'), App)`

In `index.html`, ensure there is a root element:
- `<div id="app"></div>`

### 6) Create `src/App.jsx`

Default component style for automatic runtime:
- `export default function App() { const count = signal(0); return <button on:click={() => count.value++}>{count}</button> }`

Key correctness rule:
- Don’t write `{count.value}` in JSX expecting updates; pass `{count}` or derive with `computed/$/t`.

### 7) Run it

- npm: `npm run dev`
- pnpm: `pnpm dev`
- yarn: `yarn dev`
- bun: `bun run dev`

## Minimal file layout (JS)

Use this as the target state when setting up by hand:

- `index.html`: has `<div id="app"></div>` and `<script type="module" src="/src/main.jsx"></script>`
- `vite.config.js`: enables `jsxImportSource: 'refui'` and `jsx: 'automatic'` (and optionally refurbish)
- `src/main.jsx`: creates the DOM renderer once and calls `render(...)`
- `src/App.jsx`: exports the root component

## TypeScript variant (only if user chose TS)

- Use Vite TS template (`vanilla-ts`) if starting fresh, or add TS later.
- Ensure JSX runtime is configured (choose one approach, do not mix):
  - **Vite/esbuild**: keep `vite.config.ts` with `jsx: 'automatic'` and `jsxImportSource: 'refui'`.
  - **TypeScript**: set `tsconfig.json` with `"jsx": "react-jsx"` and `"jsxImportSource": "refui"`.
- Use `.tsx` files for JSX.

## If the user requests classic JSX transform instead

Only switch to classic when asked, or when the repo already uses it.

Classic setup guidelines:
- Configure `jsxFactory: 'R.c'` and `jsxFragment: 'R.f'` in the transpiler.
- If you want Reflow classic mode, inject `import { R } from 'refui/reflow'` (bundler-level injection).

## What to ask next (after the two questions)

Once package manager + language are confirmed, ask for:
- App type: browser SPA, SSR/SSG, or “logic-only” (Reflow)
- Whether they want HMR via `refurbish` (recommended for browser dev)
