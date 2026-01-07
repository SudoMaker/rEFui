---
title: Extra Components
description: Advanced components for specific use cases like lists, portals, and caching.
weight: 45
---

# Extra Components

Extra components for more advanced scenarios are located in the `refui/extras` path.

## UnKeyed

Similar to [`For`](basic.md#for), but optimized for lists where individual items contain reactive signals. `UnKeyed` efficiently updates only the parts of the DOM that change, making it ideal for dynamic lists.

```jsx
import { UnKeyed } from 'refui/extras'
import { derivedExtract } from 'refui'

const App = ({ reactiveList }) => {
	return (
		<UnKeyed entries={reactiveList}>
			{({ item }) => {
				// derivedExtract ensures that we react to changes in the 'name' signal
				const { name } = derivedExtract(item)
				return <div>{name}</div>
			}}
		</UnKeyed>
	)
}
```

## Cached

Provides a cache system for efficiently managing and rendering lists of components with reusable instances. This is useful for long lists where performance is critical.

```jsx
import { createCache } from 'refui/extras'

// 1. Define a template component for items in the cache
const ItemTemplate = ({ name, id }) => <div>Item: {name} (ID: {id})</div>;

const App = () => {
	// 2. Create a cache instance with the template
	const cache = createCache(ItemTemplate)

	// 3. Add initial data
	cache.add(
		{ name: 'Item 1', id: 1 },
		{ name: 'Item 2', id: 2 }
	)

	return (
		<div>
			<button on:click={() => cache.add({ name: 'New Item', id: Date.now() })}>
				Add Item
			</button>
			<button on:click={() => cache.clear()}>Clear All</button>

			{/* 4. Render the cached components */}
			<cache.Cached />
		</div>
	)
}
```

**Cache API**:
- `add(...data)`: Adds new items.
- `replace(newData)`: Replaces all items with a new array.
- `get(index)`: Retrieves the item at a specific index.
- `set(index, data)`: Updates the item at a specific index.
- `del(index)`: Deletes the item at a specific index.
- `clear()`: Removes all items.
- `size()`: Returns the number of items in the cache.
- `getIndex(handler)`: Finds the index of an item using a handler function.

## Portal

Creates a portal using an `Inlet`/`Outlet` pattern, allowing you to render components in a different part of the DOM tree.

`createPortal()` returns a pair `[Inlet, Outlet]`:

- `Inlet`: transports its children to the outlet. Children can be plain nodes, functions that return render functions, or other abstract components.
- `Outlet`: renders everything accumulated from `Inlet`s, and accepts an optional `itemRenderer` prop (or signal of such). When provided, `itemRenderer` receives `{ item }` and should return a renderable value (commonly a render function). By default, `itemRenderer` behaves like `({ item }) => item`, which is useful when you want to portal arbitrary components or fragments as-is.

```jsx
import { createPortal } from 'refui/extras'

const App = () => {
	const [Inlet, Outlet] = createPortal()

	return (
		<div>
			<header>
				{/* The Outlet will render content sent from the Inlet */}
				<Outlet fallback={() => <div>Default Header</div>} />
			</header>

			<main>
				<div>Main content area</div>
				{/* The Inlet transports its children to the Outlet */}
				<Inlet>
					<h1>This title will appear in the header!</h1>
				</Inlet>
			</main>
		</div>
	)
}
```

You can customize how each inlet contribution renders by providing an `itemRenderer` to the outlet:

```jsx
import { createHTMLRenderer } from 'refui/html'

const htmlRenderer = createHTMLRenderer()

const [Inlet, Outlet] = createPortal()

const App = () => (
	<div>
		<header>
			<Outlet
				itemRenderer={({ item }) => (
					<li class="header-item">
						{htmlRenderer.serialize(htmlRenderer.createElement(item))}
					</li>
				)}
				fallback={() => <div>Default Header</div>}
			/>
		</header>

		<Inlet>
			<span>First</span>
		</Inlet>
		<Inlet>
			<span>Second</span>
		</Inlet>
	</div>
)
```

**Note:** Inlets and Outlets can be passed around as props or hoisted out of component scope for more versatile usage patterns:

```jsx
// Hoist portal creation to module level for global usage
const [GlobalInlet, GlobalOutlet] = createPortal()

// Pass portal components as props
const Layout = ({ Inlet, Outlet }) => {
	return (
		<div class="layout">
			<header>
				<Outlet fallback={() => <div>Default Header</div>} />
			</header>
			<main>Content goes here</main>
		</div>
	)
}

const App = () => {
	const [HeaderInlet, HeaderOutlet] = createPortal()

	return (
		<div>
			<Layout Inlet={HeaderInlet} Outlet={HeaderOutlet} />

			{/* This will render in the layout header */}
			<HeaderInlet>
				<h1>Dynamic Header Title</h1>
			</HeaderInlet>
		</div>
	)
}
```

## defineCustomElement(name, component, options?)

Wrap a rEFui component as a Web Component. Call with a renderer context (`defineCustomElement.call(renderer, ...)`) or bind once (`const wc = defineCustomElement.bind(renderer)`).

- `name`: Custom element tag name.
- `component`: rEFui component template to render.
- `options`:
	- `mode`: Shadow DOM mode (`'open' | 'closed'`, default `'open'`)
	- `attrs`: Attribute names mapped to signal-backed props on the element instance.
	- `slots`: Named slots exposed as props (each becomes an R slot placeholder).
	- `defaultSlot`: Whether to inject the default `<slot>` (default `true`).
	- `base`: Base class (default `HTMLElement`).
	- `extends`: Built-in extension name for customized built-ins.
	- `cssText`: CSS text adopted into the shadow root.
	- `styleSheets`: Additional `CSSStyleSheet`s to adopt.

```javascript
import { createDOMRenderer } from 'refui/dom'
import { defineCustomElement } from 'refui/extras'

const R = createDOMRenderer()
const Hello = ({ name }) => () => <p>Hello, {name}</p>

const wc = defineCustomElement.bind(R)
wc('hello-card', Hello, { attrs: ['name'] })
```

## Parse

Efficiently parses and renders text content (or any structured source) using a custom parser function. The `Parse` component wires a parser into your component tree and memoizes the render boundary so that it only swaps when the parser function identity changes.

**Props:**

- `source`: A value passed verbatim to your parser. It can be a string, a signal, or any other type your parser understands. When you pass a signal, call `read(source)` inside the returned render function to access its current value and opt into reactivity.
- `parser`: Either a parser function, or a signal that resolves to a parser function. The parser is called as `parser({ source, onAppend }, ...children)` and should return a render function (or any other renderable shape). When `parser` is a signal, `Parse` memoizes the underlying render function and only recreates it when the signal's value changes.
- `expose` (optional): A callback that receives an object with an `append` function. The parser can call `onAppend(append)` to register an `append` handler; `Parse` will then expose that handler to the parent via `expose({ append })`. This is useful for incremental or streaming parsing, where the parent pushes new chunks into the parser over time.

Because the render function returned by your parser runs in a tracked scope, any signals you read inside it (for example the `source` signal itself) will cause the output to update when they change, making `Parse` ideal for dynamic content parsing scenarios.

```jsx
import { Parse } from 'refui/extras'
import { signal, read } from 'refui'

// Simple markdown-like parser example
const simpleMarkdownParser = ({ source }) => {
	return (R) => {
		const text = read(source)

		// Convert **bold** to <strong> tags
		const boldRegex = /\*\*(.*?)\*\*/g
		const parts = text.split(boldRegex)

		const elements = parts.map((part, index) => {
			if (index % 2 === 1) {
				// Odd indices are the bold content
				return R.c('strong', null, part)
			}
			return part
		})

		return elements
	}
}

// Code syntax highlighter parser
const codeParser = ({ source }) => {
	return (R) => {
		const code = read(source)

		// Simple syntax highlighting for keywords
		const keywords = ['function', 'const', 'let', 'var', 'if', 'else', 'return']
		let highlightedCode = code

		keywords.forEach(keyword => {
			const regex = new RegExp(`\b${keyword}\b`, 'g')
			highlightedCode = highlightedCode.replace(regex, `<span class="keyword">${keyword}</span>`)
		})

		return R.c('pre', { innerHTML: highlightedCode })
	}
}

const App = () => {
	const markdownText = signal('This is **bold text** and this is normal.')
	const codeText = signal('function hello() {\n  const message = "Hello World"\n  return message\n}')
	const currentParser = signal(simpleMarkdownParser)

	const switchParser = () => {
		currentParser.value = currentParser.value === simpleMarkdownParser
			? codeParser
			: simpleMarkdownParser

		markdownText.value = currentParser.value === codeParser
			? codeText.value
			: 'This is **bold text** and this is normal.'
	}

	return (
		<div>
			<h2>Parse Component Demo</h2>

			<div style="border: 1px solid #ccc; padding: 10px; margin: 10px 0;">
				<Parse source={markdownText} parser={currentParser} />
			</div>

			<button on:click={switchParser}>
				Switch Parser (Markdown ↔ Code)
			</button>

			<div style="margin-top: 20px;">
				<textarea
					rows="4"
					cols="50"
					value={markdownText}
					on:input={(e) => markdownText.value = e.target.value}
					placeholder="Edit the text to see live parsing..."
				/>
			</div>
		</div>
	)
}
```

### Advanced Usage: Custom HTML Parser

```jsx
import { Parse } from 'refui/extras'
import { signal, read } from 'refui'

// HTML-like parser that converts custom tags to components
const customHtmlParser = ({ source }) => {
	return (R) => {
		const text = read(source)

		// Convert [button:text] to actual button elements
		const buttonRegex = /\ \[button:(.*?)\]/g
		const linkRegex = /\ \[link:(.*?)\|(.*?)\]/g

		let result = text

		// Replace button syntax
		result = result.replace(buttonRegex, (match, buttonText) => {
			return `<button onclick="alert('${buttonText} clicked!')">${buttonText}</button>`
		})

		// Replace link syntax
		result = result.replace(linkRegex, (match, url, linkText) => {
			return `<a href="${url}" target="_blank">${linkText}</a>`
		})

		return R.c('div', { innerHTML: result })
	}
}

const CustomHtmlDemo = () => {
	const content = signal(`
		Welcome to our site!

		[button:Click Me]

		Visit our [link:https://example.com|homepage] for more info.

		[button:Another Button]
	`)

	return (
		<div>
			<h3>Custom HTML Parser</h3>
			<Parse source={content} parser={customHtmlParser} />

			<textarea
			ows="6"
				cols="60"
				value={content}
				on:input={(e) => content.value = e.target.value}
				placeholder="Try editing: [button:Text] or [link:url|text]"
			/>
		</div>
	)
}
```

### Performance Benefits

The `Parse` component includes automatic memoization that prevents unnecessary re-parsing:

```jsx
import { Parse } from 'refui/extras'
import { signal, read } from 'refui'

const expensiveParser = ({ source }) => {
	return (R) => {
		const text = read(source)

		console.log('Parser called!') // This will only log when `text` changes

		// Simulate expensive parsing operation
		const words = text.split(' ')
		return words.map((word, index)
			R.c('span', {
				key: index,
				style: `color: hsl(${index * 30}, 70%, 50%);`
			}, word + ' ')
		)
	}
}

const PerformanceDemo = () => {
	const text = signal('Hello world this is a test')
	const counter = signal(0)

	// This counter update won't trigger re-parsing because the parser only reads `text`
	setInterval(() => counter.value++, 1000)

	return (
		<div>
			<p>Counter (doesn't affect parsing): {counter}</p>
			<Parse source={text} parser={expensiveParser} />
			<input
				value={text}
				on:input={(e) => text.value = e.target.value}
				placeholder="Only changing this text will trigger re-parsing"
			/>
		</div>
	)
}
```

**Caveat (signals inside parser body):** When you pass `parser` as a signal to `<Parse>`, the parser function itself runs in a tracked scope similar to `<Fn>`. Do not create a new signal and immediately read it in the parser body, or updates to that signal can retrigger the parser to run again, creating a new signal, making the updated value useless. Prefer to:

- Create long-lived signals outside the parser, or
- Allocate signals inside the returned render function (`(R) => ...`) and mutate them from event handlers or other effects,

so that reactive updates are driven from stable owners instead of from the parser control body.

**Note:** The parser function should return renderable content that can be handled by the renderer. This can be DOM elements created with `R.c()`, text nodes, or arrays of such elements.

### Streaming / incremental parsing with `expose` and `onAppend`

For streaming or incremental parsing scenarios (for example, log viewers or progressively loaded content), `Parse` lets the parser register an `append` handler, which is then exposed to the parent:

- Inside the parser, call `onAppend(append)` with a function that knows how to incorporate new chunks into your internal state.
- In the parent, pass an `expose` prop to receive that `append` function and call it whenever new data arrives.

```jsx
import { Parse } from 'refui/extras'
import { signal, read } from 'refui'

// Parser that accumulates text chunks and renders them as a log
const streamingParser = ({ source, onAppend }) => {
	const content = signal(read(source) ?? '')

	// Register an append handler that the parent can call
	onAppend((chunk) => {
		content.value += chunk
	})

	return (
		<pre style="background: #111; color: #0f0; padding: 8px;">
			{content}
		</pre>
	)
}

const StreamingLogDemo = () => {
	const initial = signal('Booting...\n')
	const api = signal(null)

	return (
		<div>
			<Parse
				source={initial}
				parser={streamingParser}
			expose={({ append }) => {
					// Save the append function so we can call it later
					api.value = { append }
				}}
			/>

			<button on:click={() => api.value?.append('New line\n')}>
				Append line
			</button>
		</div>
	)
}
```

In this pattern, the parser owns the state (`content`), and the parent drives updates by calling the exposed `append` function. Because `content` is a signal, the rendered output updates automatically as new chunks arrive.
