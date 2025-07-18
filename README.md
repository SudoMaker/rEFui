<p align="center"><img width="200" height="200" src="https://github.com/SudoMaker/rEFui/raw/main/assets/rEFui.svg"/></p>

<h1 align="center">rEFui</h1>

Pronunced as /ɹiːˈfjuːəl/, refuel

The [Retained Mode](https://en.wikipedia.org/wiki/Retained_mode) JavaScript framework that refuels your UI projects, across web, native, and embedded, with built-in [HMR support](#hot-module-replacement).

## Usage

```shell
npm i refui
```

### Web

[Playground](https://stackblitz.com/edit/refui-starter-template?file=src%2Fapp.jsx)

[Hacker News Demo](https://github.com/ClassicOldSong/refui-hackernews-demo)

```jsx
import { signal } from 'refui'
import { createDOMRenderer } from 'refui/dom'
import { defaults } from 'refui/browser'

const DOMRenderer = createDOMRenderer(defaults)

const App = () => {
	const count = signal(0)
	const increment = () => {
		count.value += 1
	}

	return (R) => (
		<>
			<h1>Hello, rEFui</h1>
			<button on:click={increment}>Click me! Count is {count}</button>
		</>
	)
}

DOMRenderer.render(document.body, App)

```

### Native

by using [DOMiNATIVE](https://github.com/SudoMaker/dominative) alongside with [NativeScript](https://nativescript.org/)

[DEMO](https://stackblitz.com/edit/refui-nativescript?file=app%2Fapp.jsx)

```jsx
import { Application } from '@nativescript/core'
import { document } from 'dominative'
import { signal } from 'refui'
import { createDOMRenderer } from 'refui/dom'

const DOMRenderer = createDOMRenderer({doc: document})

const App = () => {
	const count = signal(0)
	const increment = () => {
		count.value += 1
	}
	return (R) => (
		<>
			<actionbar title="Hello, rEFui!"></actionbar>
			<stacklayout>
				<label>You have taapped {count} time(s)</label>
				<button class="-primary" on:tap={increment}>Tap me!</button>
			</stacklayout>
		</>
	)
}

DOMRenderer.render(document.body, App)

const create = () => document

Application.run({ create })
```

### Embedded

by using CheeseDOM alongside with Resonance

```jsx
import { document } from 'cheesedom'
import { signal, t } from 'refui'
import { createDOMRenderer } from 'refui/dom'

const DOMRenderer = createDOMRenderer({doc: document})

const App = () => {
	const count = signal(0)
	const increment = () => {
		count.value += 1
	}
	return (R) => (
		<>
			<label attr:centered y={-20}>rEFui + Resonance</label>
			<button attr:centered y={20} on:clicked={increment}>
				<label attr:centered>{t`Count is ${count}`}</label>
			</button>
		</>
	)
}

DOMRenderer.render(document, App)
```

## JSX configurations

For detailed instructions on configuring JSX for your project, please see the [JSX Setup Guide](docs/JSX.md).

## Hot Module Replacement

rEFui comes with built-in HMR support, but still requires a plugin for the packager to inject a minimal portion of boilerplate code to make it work while developing.

For more details, checkout [refurbish](https://github.com/SudoMaker/refurbish)

## Built-in Components

See [Components](docs/Components.md)

## Renderers

- [DOM](docs/DOMRenderer.md): `refui/dom`
- [HTML](docs/HTMLRenderer.md): `refui/html`

## Prebuilt version

You're building your app with a toolchain/compiler/transpiler anyways, so there's no need to provide a prebuilt version.

## CDN

You can use rEFui directly in modern browsers without building. Define your import map like this:

```html
<script type="importmap">
	{
		"imports": {
			"refui": "https://esm.run/refui",
			"refui/dom": "https://esm.run/refui",
			"refui/browser": "https://esm.run/refui",
			"htm": "https://esm.run/htm"
		}
	}
</script>
<script type="module" src="main.js"></script>
```

Then in your `main.js`:

```js
import { createDOMRenderer } from 'refui/dom';
import { defaults } from 'refui/browser';
import htm from 'htm';

const { render, createElement } = createDOMRenderer(defaults);

const html = htm.bind(createElement);

const App = () => {
	return html`<h1>Hello World!</h1>`
}

render(document.body, App)
```

[Live Example](https://stackblitz.com/edit/refui-htm-demo)

**Note**: please **DON'T** add and use `refui/signal` to import maps separately when importing from `esm.run`, as ESM module resolution will treat the signal imported from `refui/signal` differently from imported internally by `refui`/`refui/dom` or other modules, since `esm.run` will transform the imports to their internal CDN path, that will break signal handling within rEFui. When using `unpkg.com`, it doesn't transform the imports so you'll need to add every exports from `refui` manually to the import map.

## License
MIT
