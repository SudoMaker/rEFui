## Basic Components

### If

Note: `else` prop has higher priority than the second branch, `true` prop has higher priority than `condition` prop

```jsx
import { If } from 'refui'

const App = ({ value }) => {
	return (R) => (
		<If true={value} /*or condition={value}*/ else={() => <span>Condition not met!</span>}>
			{/*if condition is truthy*/ () => <span>Condition met!</span>}
			{/*else*/ () => <span>Condition not met!</span>}
		</If>
	)
}
```

### For

```jsx
import { For } from 'refui'

const App = ({ iterable }) => {
	return (R) => (
		<For entries={iterable}>{(item) => <div>{item.name}</div>}</For>
		// name will not be changed if modified directly on item
	)
}
```

### Fn

The handler itself can also be `signal<Function(Renderer): Node>`

Note: define return renderers outside of the `Fn` scope can reduce re-renders if condition doesn't change its matched result.

```jsx
import { Fn, read } from 'refui'

const App = ({ condition }) => {
	return (R) => (
		<Fn>
			{() => {
				switch (read(condition)) {
					case 123: {
						return () => <div>Condition: 123</div>
					}
					case 456: {
						return () => <div>Condition: 456</div>
					}
					default: {
						return () => <div>Nothing matched!<div>
					}
				}
			}}
		</Fn>
	)
}
```

### Dynamic

Just like any ordinary components but the component itself is a variable/signal

```jsx
import { signal, Dynamic } from 'refui'

const App = () => {
	const currentComponent = signal('button')
	return (R) => (
		<Dynamic
			is={currentComponent}
			on:click={(e) => {
				if (currentComponent.value === 'button') {
					currentComponent.value = 'div'
					return
				}
				currentComponent.value = 'button'
			}}
		>
			Click to change tag!
		</Dynamic>
	)
}
```

or even simpler:

```jsx
import { signal } from 'refui'

const Component1 = (props, ...children) => {
	// ...
}

const Component2 = (props, ...children) => {
	// ...
}

const App = () => {
	const DynamicComponent = signal(Component1)
	return (R) => {
		<DynamicComponent
			on:click={(e) => {
				if (DynamicComponent.value === Component1) {
					DynamicComponent.value = Component2
				} else {
					DynamicComponent.value = Component1
				}
			}}
		>
			Hey Dynamic!
		</DynamicComponent>
	}
}
```

### Async

Just like any ordinary components but the component is asynchronous

```jsx
import { capture, expose } from 'refui'

const AsyncComponent = async ({ apiPath }) => {
	// Capture a method to later run in the previouse context
	const exposeCaptured = capture(expose)

	const resp = await fetch(apiPath)
	const result = await resp.text()

	exposeCaptured({
		result
	})

	return (R) => (
		<div>{result}</div>
	)
}
```

Async components accepts an extra param: `fallback`, which is a render method or a rendered result to be displayed when the component itself isn't ready. Alternativelly, you can use `Async` as a dedicated component:

```jsx
import { Async } from 'refui'
import { AsyncComponent } from './async-component.js'

const App = () => {
	const currentComponent = signal('button')
	return (R) => (
		<AsyncComponent apiPath="some/api" fallback={<div>Loading...</div>} />
	)
}

const AppAlternative = () => {
	const currentComponent = signal('button')
	return (R) => (
		<Async future={AsyncComponent('some/api')} fallback={() => <div>Loading...</div>} />
	)
}
```

## Extra Components

Extra components are located in the `refui/extras` path.

### UnKeyed

Same as `For`, but the prop itself is a signal.

```jsx
import { UnKeyed } from 'refui/extras'
// or
import { UnKeyed } from 'refui/extras/unkeyed.js'

import { derivedExtract } from 'refui'

const App = ({ iterable }) => {
	return (R) => (
		<UnKeyed entries={iterable}>
			{(item) => {
				const { name } = derivedExtract(item)
				return <div>{name}</div> // name will correctly get reactive if it's a signal on item
			}}
		</UnKeyed>
	)
}
```

### Cached

Creates a cache system for efficiently managing and rendering lists of components with reusable component instances.

```jsx
import { createCache } from 'refui/extras'
// or
import { createCache } from 'refui/extras/cache.js'

const ItemTemplate = ({ name, id }) => {
	return (R) => <div>Item: {name} (ID: {id})</div>
}

const App = () => {
	// Create cache with a template component
	const cache = createCache(ItemTemplate)

	// Add initial data
	cache.add(
		{ name: 'Item 1', id: 1 },
		{ name: 'Item 2', id: 2 }
	)

	return (R) => (
		<div>
			<button on:click={() => cache.add({ name: 'New Item', id: Date.now() })}>
				Add Item
			</button>
			<button on:click={() => cache.clear()}>
				Clear All
			</button>

			{/* Render cached components */}
			<cache.Cached />
		</div>
	)
}
```

Cache methods available:
- `add(...data)` - Add new items to the cache
- `replace(newData)` - Replace all data with new array
- `get(index)` - Get data at specific index
- `set(index, data)` - Update data at specific index
- `del(index)` - Delete item at specific index
- `clear()` - Remove all items
- `size()` - Get current cache size
- `getIndex(handler)` - Find index using a handler function

### Render

Renders a component instance that was created separately. Useful for rendering components stored in signals or passed as references.

```jsx
import { Render, createComponent, signal } from 'refui'

const MyComponent = ({ message }) => {
	return (R) => <div>Message: {message}</div>
}

const App = () => {
	// Create a component instance
	const componentInstance = createComponent(MyComponent, { message: 'Hello World!' })

	// Store instance in a signal for dynamic rendering
	const currentInstance = signal(componentInstance)

	return (R) => (
		<div>
			<h1>Rendered Component:</h1>

			{/* Render the component instance */}
			<Render from={componentInstance} />

			{/* Or render from a signal */}
			<Render from={currentInstance} />

			<button on:click={() => {
				// Create and switch to a different instance
				const newInstance = createComponent(MyComponent, { message: 'Updated!' })
				currentInstance.value = newInstance
			}}>
				Update Instance
			</button>
		</div>
	)
}
```

The `Render` component is particularly useful when:
- You need to store component instances for later rendering
- Working with component factories or dynamic component creation
- Managing component lifecycles manually
- Implementing complex component composition patterns

### Portal

Creates a portal system that allows rendering components in different parts of the DOM tree using Inlet/Outlet pattern.

```jsx
import { createPortal } from 'refui/extras'
// or
import { createPortal } from 'refui/extras/portal.js'

const App = () => {
	// Create portal system
	const [Inlet, Outlet] = createPortal()

	return (R) => (
		<div>
			<div>Main content area</div>

			{/* Content will be transported from Inlet to Outlet */}
			<Inlet>
				<div>This content will appear in the outlet!</div>
				<button>Portal Button</button>
			</Inlet>

			<div>Some other content...</div>

			{/* Render portal content here with optional fallback */}
			<Outlet fallback={() => <div>No portal content</div>} />
		</div>
	)
}
```

Multiple Inlets can feed into the same Outlet:

```jsx
const App = () => {
	const [Inlet, Outlet] = createPortal()

	return (R) => (
		<div>
			<Inlet>
				<div>First portal content</div>
			</Inlet>

			<Inlet>
				<div>Second portal content</div>
			</Inlet>

			{/* Both contents will be rendered here */}
			<Outlet />
		</div>
	)
}
```

**Note:** Inlets and Outlets can be passed around as props or hoisted out of component scope for more versatile usage patterns:

```jsx
// Hoist portal creation to module level for global usage
const [GlobalInlet, GlobalOutlet] = createPortal()

// Pass portal components as props
const Layout = ({ Inlet, Outlet }) => {
	return (R) => (
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

	return (R) => (
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
