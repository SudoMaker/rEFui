<p align="center"><img width="200" height="200" src="https://github.com/SudoMaker/rEFui/raw/main/assets/rEFui.svg"/></p>

<h1 align="center">rEFui</h1>

Pronunced as /ɹiːˈfjuːəl/, refuel

The JavaScript framework that refuels your UI projects, across web, native, and embedded.

## Usage

```shell
npm i refui
```

### Web

```jsx
import { signal } from 'refui'
import { createDOMRenderer } from 'refui/dom'

const DOMRenderer = createDOMRenderer()

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

```js
/** @jsx R.c */
/** @jsxFrag R.f */
```

Set these values accordingly to your transpiler configuration, or add the above comments to the top of your JSX file.

## Built-in Components

See [Components](Components.md)

## Renderers

- [DOM](DOMRenderer.md)

## Prebuilt version

You're building your app with a toolchain/compiler/transpiler anyways, so there's no need to provide a prebuilt version.

## License
MIT
