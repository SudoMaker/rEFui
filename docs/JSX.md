# JSX Setup

This document explains how to configure your project to use JSX with rEFui.

Like Solid.js, rEFui is a [Retained Mode](https://en.wikipedia.org/wiki/Retained_mode) renderer, but unlike Solid.JS, rEFui does not rely on a specific compiler for JSX, you can just use any existing transpilers and choose between two JSX transformation methods: **Classic Transform** (preferred) and **Automatic Runtime**.

> **Note**: For detailed information about rEFui's reactive system and signals, see the [Signals documentation](Signal.md).

## Table of Contents

- [Classic Transform (Preferred)](#classic-transform-preferred)
- [Automatic Runtime](#automatic-runtime)
- [Hot Module Replacement](#hot-module-replacement)

## Classic Transform (Preferred)

This is the recommended approach as it provides the most flexibility, allowing you to use different renderers on a per-component basis. To use it, you need to configure your transpiler (like Babel or esbuild) to use the classic JSX runtime and specify the pragma.

With this setup, your components should be functions that accept a renderer `R` and return the element tree.

**Please note**, rEFui does not require JSX inject for the classic transform. The render factory is passed through `R` in runtime.

### Configuration

#### Babel

In your `.babelrc.json`:
```json
{
  "presets": [
    [
      "@babel/preset-react",
      {
        "runtime": "classic",
        "pragma": "R.c",
        "pragmaFrag": "R.f"
      }
    ]
  ]
}
```

#### Vite

In your `vite.config.js`, configure esbuild's JSX options:
```javascript
// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
  esbuild: {
    jsxFactory: 'R.c',
    jsxFragment: 'R.f',
  },
})
```

#### File-level Pragma Comments

If you don't want to configure your build tool, you can add pragma comments to the top of your JSX files:
```jsx
/** @jsx R.c */
/** @jsxFrag R.f */

// Your component code here
```

## Automatic Runtime

This approach uses a single, globally defined renderer. While slightly easier to set up, it is less flexible than the classic transform.

JSX runtime is essential when using rEFui together with some third party generators like [MDX](https://mdxjs.com/) or compilers like [SWC](https://github.com/swc-project/swc/issues/10553), or runtimes like [Deno](https://github.com/denoland/deno/issues/29584), since they lack the ability to correctly transform JSXClassic that passes the JSX factory via parameters.

### Setup

To use it, you first need to configure your build tool (like Vite, Rollup with Babel, or webpack) to use rEFui's runtime.

#### Vite (`vite.config.js`)

```javascript
import { defineConfig } from 'vite'

export default defineConfig({
	esbuild: {
		jsx: 'automatic',
		jsxImportSource: 'refui', // This tells Vite/esbuild where to find the runtime
	},
})
```

#### Babel (`.babelrc.json`)

```json
{
	"presets": [
		[
			"@babel/preset-react",
			{
				"runtime": "automatic",
				"importSource": "refui"
			}
		]
	]
}
```

### Initialization

Once your build tool is configured, you need to initialize the runtime with a renderer in your application's entry point. The `wrap` function from the runtime connects it to your chosen renderer (e.g., the `DOMRenderer`).

**Example (`main.js`):**

```javascript
import { createDOMRenderer } from 'refui/dom'
import { defaults } from 'refui/presets/browser'
import { wrap } from 'refui/jsx-runtime'
import App from './App.jsx' // Your root component

// 1. Create a renderer instance
const R = createDOMRenderer(defaults)

// 2. Initialize the JSX runtime with the renderer
wrap(R)

// 3. Render your application
const root = document.getElementById('app')
R.render(root, App)
```

Now, any `.jsx` or `.tsx` file will be automatically transformed to use the initialized runtime, so you don't need any special imports to write JSX.

## Hot Module Replacement

For development, use **refurbish** HMR plugin to provide fast, reliable hot module replacement for your components.

### Why refurbish?

refurbish is specifically designed for rEFui's component model and handles the complexity of HMR automatically. You don't need to add `import.meta.hot` checks or other HMR boilerplate to your components.

### Quick Setup

Install refurbish:

```bash
npm install -D refurbish
```

Add to your `vite.config.js`:

```javascript
import { defineConfig } from 'vite';
import refurbish from 'refurbish/vite';

export default defineConfig({
	plugins: [refurbish()],
	esbuild: {
		jsxFactory: 'R.c',
		jsxFragment: 'R.f',
	},
});
```

That's it! Your rEFui components will now hot-reload during development, preserving component state and providing instant feedback.

> **Learn More**: Visit the [refurbish repository](https://github.com/SudoMaker/refurbish) for Webpack configuration and advanced options.
