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

### Reflow Renderer

The classic transform ships with a special renderer at `refui/reflow` (re-exported from `refui`) that provides a renderer-agnostic JSX runtime. Use it to author pure application logic without binding it to a specific renderer. Prefer exporting pure components from these modules; low-level host elements are available but reduce portability, so keep them inside narrow platform-specific branches.

Reflow is useful when you're sharing logic between multiple platforms that share same basic app logics, so you can focus on these logic without be distracted by nuanced platform specific UI logics, like animations, styling etc.

Reflow mode only supports the classic JSX transform; if your project uses the automatic runtime, compile the modules that rely on reflow separately with the classic pragma configuration.

Reflow renderer surfaces a module-level `R`, but the render function still receives its own `R` argument at render time. The parameter shadows the outer reference, so they do not interfere; only toolchains that mishandle shadowing (notably some SWC-based runtimes) may run into trouble, in which case isolate those modules or swap to the automatic transform without using Reflow mode.

Configure your bundler to inject `R` like this:

```js
// vite.config.js
import { defineConfig } from 'vite'
import refurbish from 'refurbish/vite'

export default defineConfig({
  plugins: [refurbish()],
  esbuild: {
    jsxFactory: 'R.c',
    jsxFragment: 'R.f',
    jsxInject: `import { R } from 'refui/reflow'`
  }
})
```

```js
// webpack.config.js
import webpack from 'webpack'

export default {
	// ... other configurations
	plugins: [
		// ... other plugins
		new webpack.ProvidePlugin({
			R: ['refui/reflow', 'R']
		})
	]
}
```

```jsx
import { signal, useAction, read, watch, onDispose } from 'refui'
// R is auto injected by your bundler, or you can do it manually
// import { R } from 'refui/reflow'
// Or import directly from 'refui'

const platform = globalThis.RUNTIME_PLATFORM ?? 'browser'

export const CounterDisplay = ({ count }) => {
	if (platform === 'browser') return (R) => <span>{count}</span>
	if (platform === 'nativescript') return (R) => <text>{count}</text>
	if (platform === 'cheesedom') return (R) => <text>{count}</text>

	if (platform === 'breadboard') {
		const display = new LED('max7219')
		watch(() => {
			display.setText(read(count).toString(10))
		})

		onDispose(() => {
			display.close()
		})
	}

	return null
}

export const CounterBtn = ({ onIncrement }) => {
	let lastInc = 0
	const debounced = () => {
		const now = Date.now()
		if (now - lastInc < 100) return
		lastInc = now
		onIncrement()
	}

	if (platform === 'browser') return (R) => <button on:click={debounced}>+</button>
	if (platform === 'nativescript') return (R) => <button on:tap={debounced}><text>+</text></button>
	if (platform === 'cheesedom') return (R) => <object on:clicked={debounced}><text>+</text></object>

	if (platform === 'breadboard') {
		const gpio = GPIO.open('A1', 'input')
		gpio.on('edge_up', onIncrement)

		onDispose(() => {
			gpio.close()
		})
	}

	return null
}

export const App = () => {
	const count = signal(0)
	const [whenIncrement, increment] = useAction()

	whenIncrement(() => {
		count.value += 1
	})

	return (
		<>
			<CounterDisplay count={count} />
			<CounterBtn onIncrement={increment} />
		</>
	)
}
```

Reflow assumes components stay stateless at declaration time, so inline functions are evaluated immediately and recursively until a non-function value is produced. Treat them as utility helpers; they do not become reactive computations.

Because the helper focuses on render-agnostic logic, `$ref` bindings only resolve reliably for concrete DOM elements in browser output (and comparable host nodes elsewhere). `$ref` still works for components, but in v0.8.0+ you should pass per-component `expose` callbacks to publish handles explicitly. Child components ought to namespace the values they expose to avoid collisions. As component references are not strictly retained in reflow mode, prefer explicit wiring through props and signals where possible.

Expect a small performance overhead when running in development with reflow enabled because the runtime tracks additional metadata, while production builds skip instance allocation and execute functional components as plain functions for better throughput.

## Automatic Runtime

This approach uses a single, globally defined renderer. While slightly easier to set up, it is less flexible than the classic transform.

Since v0.8.0, both `refui/jsx-runtime` and `refui/jsx-dev-runtime` automatically bind to the Reflow renderer, so you can start writing JSX as soon as your bundler is configured—no manual `wrap()` call required. Use this mode when targeting toolchains like [MDX](https://mdxjs.com/), [SWC](https://github.com/swc-project/swc/issues/10553), or runtimes such as [Deno](https://github.com/denoland/deno/issues/29584) that cannot inject the classic pragma.

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

### Rendering

With the runtime already pointing at Reflow, you just create whichever host renderer you want to mount with and call its `render` method. No additional setup is necessary for `.jsx` / `.tsx` modules.

Because Reflow is renderer-agnostic, component bodies authored in automatic-mode JSX can inline host tags without explicitly returning render factories—the runtime wraps them for you. Just ensure the host renderer you eventually mount (e.g. the DOM renderer) provides implementations for the tags you're emitting.

**Example (`main.js`):**

```javascript
import { createDOMRenderer } from 'refui/dom'
import { defaults } from 'refui/browser'
import App from './App.jsx' // Your root component

const R = createDOMRenderer(defaults)
const root = document.getElementById('app')

R.render(root, App)
```

Need to override the renderer globally (for example, to plug in a custom host)? Call `wrap(newRenderer)` explicitly and both the production and dev runtimes will switch away from Reflow.

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
