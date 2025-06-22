# Components

rEFui provides a set of built-in components to handle common UI patterns like conditional rendering, loops, and asynchronous operations. These are the building blocks for creating dynamic and reactive user interfaces.

A core concept in rEFui is that a component is a function that accepts `props` and `children`, and returns a render function. This render function receives the renderer `R` and returns a node to be displayed.

```jsx
const MyComponent = (props, ...children) => (R) => <div>Hello rEFui!</div>
```

> [!INFO]
> **Note on JSX Runtimes**
>
> While rEFui supports different JSX transforms, the preferred approach for maximum flexibility is the **Classic Transform**. This pattern allows you to swap or wrap renderers on a per-component basis. For a detailed guide on setting up both Classic and Automatic runtimes, see the [JSX Setup documentation](JSX.md).

## Basic Components

These components are available directly from the `refui` package.

### If

Conditionally renders content based on a `condition` or `true` prop.

**Note**: The `else` prop has higher priority than providing a second child function for the `else` case. The `true` prop has higher priority than the `condition` prop.

```jsx
import { If } from 'refui'

const App = ({ value }) => {
	return (R) => (
		// Using the 'else' prop for the falsy case
		<If true={value} else={() => <span>Condition is false.</span>}>
			{/* Rendered if 'condition' is truthy */}
			{() => <span>Condition is true!</span>}
		</If>
	)
}

const AppAlternative = ({ value }) => {
	return (R) => (
		// Using a second child function for the falsy case
		<If condition={value}>
			{() => <span>Condition is true!</span>}
			{() => <span>Condition is false.</span>}
		</If>
	)
}
```

### For

Renders a list of items from an array or a signal of an array. `For` is reactive to the list change itself, with a highly optimized reconcile algorithm that only executes the least necessary steps to update the list.

For keyed and performant rendering of dynamic lists, provide a `track` prop with the name of the key property in your data objects. You can also set `indexed={true}` to receive a signal containing the item's current index as the second argument to the render function.

**Note**: If you directly modify a property on an `item` from the list, the UI will not update. For lists with reactive items that need granular updates, use the [`UnKeyed`](#unkeyed) component instead.

```jsx
import { For, signal, read } from 'refui'

const App = () => {
	const list = signal([
		{ id: 1, text: 'First' },
		{ id: 2, text: 'Second' },
	]);

	return (R) => (
		<ul>
			<For entries={list} track="id" indexed={true}>
				{(item, index) => <li>Item {read(index) + 1}: {item.text}</li>}
			</For>
		</ul>
	)
}
```

### Fn

Executes a function that returns a render function (`(R) => Node`). This is useful for complex conditional logic that doesn't neatly fit into an [`If`](#if) component. `Fn` is also the building block for all other built-in components except for [`For`](#for).

**Performance Tip**: Define the returned render functions outside the `Fn` scope to prevent them from being recreated on every render cycle.

```jsx
import { Fn, read } from 'refui'

const renderA = (R) => <div>Condition: 123</div>
const renderB = (R) => <div>Condition: 456</div>
const renderDefault = (R) => <div>Nothing matched!</div>

const App = ({ condition }) => {
	return (R) => (
		<Fn>
			{() => {
				switch (read(condition)) {
					case 123:
						return renderA
					case 456:
						return renderB
					default:
						return renderDefault
				}
			}}
		</Fn>
	)
}
```

### Dynamic

Renders a component that can change over time. The component can be specified as a string (for HTML tags) or a component function, which can be wrapped in a signal for dynamic updates.

```jsx
import { signal, Dynamic } from 'refui'

const Component1 = (props, ...children) => (R) => <div {...props}>{children}</div>
const Component2 = (props, ...children) => (R) => <button {...props}>{children}</button>

const App = () => {
	const DynamicComponent = signal(Component1)
	return (R) => (
		<DynamicComponent
			on:click={() => {
				DynamicComponent.value =
					DynamicComponent.value === Component1 ? Component2 : Component1
			}}
		>
			Click to change component!
		</DynamicComponent>
	)
}
```

You can also use the `<Dynamic>` component with the `is` prop for the same effect:

```jsx
const App = () => {
	const currentComponent = signal('button') // 'button' or 'div'
	return (R) => (
		<Dynamic
			is={currentComponent}
			on:click={() => {
				currentComponent.value = currentComponent.value === 'button' ? 'div' : 'button'
			}}
		>
			Click to change tag!
		</Dynamic>
	)
}
```

### Async

Manages the lifecycle of asynchronous components, showing a fallback UI while the component is loading. You can either use the `<Async>` component to wrap a promise that resolves to a component, or add a `fallback` prop directly to your async component invocation.

```jsx
import { Async } from 'refui'
import { MyAsyncComponent } from './MyAsyncComponent.js' // Assuming this is an async component

// Option 1: Using the <Async> component
const App = () => {
	return (R) => (
		<Async future={MyAsyncComponent({ api: 'some/path' })} fallback={() => <div>Loading...</div>} />
	)
}

// Option 2: Using the fallback prop directly
const AppAlternative = () => {
	return (R) => (
		<MyAsyncComponent api="some/path" fallback={<div>Loading...</div>} />
	)
}
```

To create an async component, define a function that returns a promise. Inside, you can perform async operations and use `capture` to bring in functions from the parent context.

```jsx
import { capture, expose } from 'refui'

const MyAsyncComponent = async ({ api }) => {
	// `capture` allows a function from the parent's rendering context to be
	// called from within the async component. `expose` is one such function
	// that lets the async component pass data back out once resolved.
	const exposeCaptured = capture(expose)

	const resp = await fetch(api)
	const result = await resp.text()

	exposeCaptured({ result })

	return (R) => <div>{result}</div>
}
```

### Render

Renders a component instance that was created separately using `createComponent`. This is useful for manually managing component lifecycles or rendering components stored in signals.

```jsx
import { Render, createComponent, signal } from 'refui'

const MyComponent = ({ message }) => {
	return (R) => <div>Message: {message}</div>
}

const App = () => {
	const componentInstance = createComponent(MyComponent, { message: 'Hello World!' })
	const currentInstance = signal(componentInstance)

	return (R) => (
		<div>
			<h1>Rendered Component:</h1>
			<Render from={currentInstance} />

			<button on:click={() => {
				const newInstance = createComponent(MyComponent, { message: 'Updated!' })
				currentInstance.value = newInstance
			}}>
				Update Instance
			</button>
		</div>
	)
}
```

## Extra Components

Extra components for more advanced scenarios are located in the `refui/extras` path.

### UnKeyed

Similar to [`For`](#for), but optimized for lists where individual items contain reactive signals. `UnKeyed` efficiently updates only the parts of the DOM that change, making it ideal for dynamic lists.

```jsx
import { UnKeyed } from 'refui/extras'
import { derivedExtract } from 'refui'

const App = ({ reactiveList }) => {
	return (R) => (
		<UnKeyed entries={reactiveList}>
			{(item) => {
				// derivedExtract ensures that we react to changes in the 'name' signal
				const { name } = derivedExtract(item)
				return <div>{name}</div>
			}}
		</UnKeyed>
	)
}
```

### Cached

Provides a cache system for efficiently managing and rendering lists of components with reusable instances. This is useful for long lists where performance is critical.

```jsx
import { createCache } from 'refui/extras'

// 1. Define a template component for items in the cache
const ItemTemplate = ({ name, id }) => {
	return (R) => <div>Item: {name} (ID: {id})</div>
}

const App = () => {
	// 2. Create a cache instance with the template
	const cache = createCache(ItemTemplate)

	// 3. Add initial data
	cache.add(
		{ name: 'Item 1', id: 1 },
		{ name: 'Item 2', id: 2 }
	)

	return (R) => (
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

### Portal

Creates a portal using an `Inlet`/`Outlet` pattern, allowing you to render components in a different part of the DOM tree.

```jsx
import { createPortal } from 'refui/extras'

const App = () => {
	const [Inlet, Outlet] = createPortal()

	return (R) => (
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
