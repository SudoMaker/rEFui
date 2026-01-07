---
title: API Reference
description: Complete reference for all core APIs in rEFui.
weight: 40
---

# API Reference

This document covers the core APIs available in rEFui. All APIs are exported directly from the `refui` package unless otherwise specified.

> **Note**: For detailed information about rEFui's reactive system and signals, see the [Signals documentation](../concepts/signals.md). All signal APIs are exported directly from the `refui` package.

> **Note**: For built-in components (If, For, Dynamic, Async, etc.), see the [Components documentation](../concepts/components.md).

## Component APIs

Examples in this section favor the **JSX automatic runtime + Reflow** style, where components simply return JSX:

```jsx
const Comp = (props) => <div />
```

Under the hood, the runtime wraps these into render factories for you. When you are using the classic JSX transform or need direct access to the renderer object, you can always write the equivalent explicit factory:

```jsx
const Comp = (props) => (R) => <div />
```

The APIs below behave the same in both cases; only the authoring style differs.

### `createComponent(template, props?, ...children)`

Creates a component instance from a template.

**Parameters:**
- `template`: Component function. With the automatic runtime it usually returns JSX; with the classic transform it returns a render function `(R) => node`.
- `props`: Optional props object to pass to the component
- `...children`: Child elements or components

**Returns:** Component instance

```jsx
import { createComponent } from 'refui';

const MyComponent = ({ name }) => <div>Hello, {name}!</div>;

// Create component instance
const instance = createComponent(MyComponent, { name: 'World' });

// Can be used with Render component
const App = () => <Render from={instance} />;
```

### `render(instance, renderer)`

Renders a component instance using the specified renderer.

**Parameters:**
- `instance`: Component instance created with `createComponent`
- `renderer`: Renderer instance (DOM, HTML, etc.)

**Returns:** Rendered node or element

```jsx
import { createComponent, render } from 'refui';
import { createDOMRenderer } from 'refui/dom';

const renderer = createDOMRenderer();
const instance = createComponent(MyComponent, { name: 'World' });
const node = render(instance, renderer);
```

### `dispose(instance)`

Disposes of a component instance and cleans up its resources.

**Parameters:**
- `instance`: Component instance to dispose

```jsx
import { createComponent, dispose } from 'refui';

const instance = createComponent(MyComponent);

// Later, when component is no longer needed
dispose(instance);
```

### `Component`

The base Component class. Generally, you should use `createComponent` instead of instantiating this directly.

```jsx
import { Component } from 'refui';

// Direct instantiation (not recommended)
const instance = new Component(MyTemplate, props, ...children);
```

## Renderer APIs

### `createRenderer(nodeOps, rendererID?)`

Creates a custom renderer with the specified node operations.

**Parameters:**
- `nodeOps`: Object containing node manipulation functions
- `rendererID`: Optional unique identifier for the renderer

**Returns:** Renderer instance

See also: [Custom Renderer guide](../guides/custom-renderer.md) for the full `nodeOps` contract, signal-aware text/prop handling, and platform tips.

```jsx
import { createRenderer } from 'refui';

const customRenderer = createRenderer({
	isNode: (node) => /* check if node */,
	createNode: (tag) => /* create element */,
	createTextNode: (text) => /* create text node */,
	createAnchor: (text) => /* create anchor/comment */,
	createFragment: () => /* create fragment */,
	removeNode: (node) => /* remove node */,
	appendNode: (parent, ...children) => /* append children */,
	insertBefore: (node, ref) => /* insert before reference */,
	setProps: (node, props) => /* set properties */
});
```

### `Fragment` (Symbol)

Symbol used to represent fragments in JSX. Available as `R.f` in classic JSX transform.

```jsx
// In JSX
<>
	<div>First</div>
	<div>Second</div>
</>

// Equivalent to
R.c(Fragment, null,
	R.c('div', null, 'First'),
	R.c('div', null, 'Second')
)
```

### `renderer.macros` (DOM renderer)

When you create a DOM renderer, it exposes a mutable `macros` object. Keys in this object correspond to macro names used by the `m:` directive, and values are handlers with the signature `(node, value) => void`. You can seed this object when calling `createDOMRenderer` or mutate it later.

### `renderer.useMacro({ name, handler })` (DOM renderer)

Registers a macro handler on the DOM renderer. The handler receives the element and the bound value and should take care of subscribing to signals if it needs to react to changes.

```jsx
renderer.useMacro({
	name: 'autofocus',
	handler(node, value) {
		if (!value) return
		node.focus()
	}
})

// Later in JSX (automatic runtime style)
const Input = () => <input type="text" m:autofocus />
```

## Context & Lifecycle APIs

### `capture(fn)`

Captures the current rendering context and returns a new function. When this new function is called later (e.g., inside a promise `then`), it executes the original function `fn` within the captured context, ensuring it can interact with signals and other reactive APIs correctly. If the originating component has already been disposed, the captured function runs with an inert context, allowing guards that depend on `getCurrentSelf()` or similar APIs to detect teardown.

**Parameters:**
- `fn`: Function to wrap with the current context.

**Returns:** A new function that will execute in the captured context.

```jsx
import { capture, getCurrentSelf, signal } from 'refui';

const Inspector = () => {
	const self = getCurrentSelf();
	const status = signal('pending');

	// Capture getCurrentSelf for later calls.
	const getSelf = capture(getCurrentSelf);

	(async () => {
		await new Promise((resolve) => setTimeout(resolve, 1000));
		const current = getSelf();
		if (!current) {
			// Component was disposed before the timeout completed.
			return;
		}
		status.value = 'resolved';
	})();

	return <div>Status: {status}</div>;
};
```

If the component gets disposed(usually unmounted) before the timeout resolves, `getSelf()` returns `null`, preventing the deferred callback from mutating state that no longer has a live context.

Think of `capture` (and the lower-level `freeze`) as rEFui's equivalent of `AsyncContext`: they carry the current component context across promises, timers, or other deferred callbacks—until the owning instance disposes, at which point the captured function reports `null` so you can bail out safely.

### `snapshot()`

Creates a snapshot of the current rendering context that can be used to run functions later.

**Returns:** Function that can execute other functions in the captured context

```jsx
import { snapshot, getCurrentSelf } from 'refui';

const MyComponent = () => {
	const snap = snapshot();
	const self = getCurrentSelf()

	setTimeout(() => {
		// Run function in the original context
			snap(() => {
				console.log('Should be true while mounted:', self === getCurrentSelf());
			});
		}, 1000);

	return <div>Component</div>;
};
```

### `contextValid`

Boolean flag exported from `refui/signal` that indicates whether the current reactive scope is still active. Async helpers such as `<Async>` check this value to avoid rendering after their parent component has disposed. Inside deferred callbacks, guard on `contextValid` (or capture it through `freeze`/`capture`) before mutating signals or DOM.

## Scheduling Helpers

### `createDefer(deferrer?)`

Creates a deferral wrapper around a reactive computation. Returns a function that accepts `(handler, onAbort?)` and produces a signal. The handler runs only after the deferrer fires; call `commit(finalValue)` inside the handler to publish the result. The handler may return a cleanup disposer for subsequent runs. The `deferrer` defaults to a cancellable wrapper around `nextTick`, but you can pass `requestIdleCallback`, `queueMicrotask`, or any function that invokes the provided callback later **as long as it returns a disposer (function)**—wrap timer/idle APIs that return handles:

```javascript
const idle = (cb) => {
  const id = requestIdleCallback(cb)
  return () => cancelIdleCallback(id)
}
```

Dependency tracking works like `computed`: dependencies are registered only from the synchronous part of `handler`. Any reads after `await`/promise resolution are not tracked unless executed inside a frozen/captured context (`freeze`, `capture`, `snapshot`). This makes `createDefer` fit for async fetches—grab dependencies up front, await work, then `commit` the result.

Typical async fetch pattern

```javascript
const loadUser = createDefer(idle)((commit) => {
	const id = userId.value      // track dependency synchronously
	return (async () => {
		const res = await fetch(`/api/users/${id}`)
		commit(await res.json())
	})()
})
```

### `deferred`

Prebuilt helper using the default cancellable nextTick deferrer. Equivalent to `createDefer()` when you don't need custom scheduling.

```javascript
import { deferred } from 'refui'

const me = deferred(async (commit) => {
	const res = await fetch('/api/me')
	commit(await res.json())
})
```

### `createSchedule(deferrer, onAbort?)`

Batches updates and flushes them together after the provided `deferrer` runs. Useful for timeslicing UI work or coalescing rapid signal writes. The `deferrer` must follow the same contract as `createDefer` (invoke the callback later and return a disposer), so wrap timer/idle APIs.

```javascript
import { createSchedule, signal } from 'refui'

const idle = (cb) => {
  const id = requestIdleCallback(cb)
  return () => cancelIdleCallback(id)
}

const stage = createSchedule(idle)
const src = signal(0)
const staged = stage(src)

src.value = 1
src.value = 2
// staged.value stays undefined (or its last flushed value) until the idle callback runs; then it becomes 2
```

## Extras

### `defineCustomElement(name, component, options?)`

Wraps a rEFui component as a Web Component. Must be called with a renderer context (`defineCustomElement.call(renderer, ...)`) or a bound function (`const wc = defineCustomElement.bind(renderer)`).

- `name`: Custom element tag name.
- `component`: rEFui component template to render.
- `options`:
	- `mode`: Shadow DOM mode (`'open' | 'closed'`, default `'open'`).
	- `attrs`: Attribute names exposed as signal-backed props.
	- `slots`: Named slots exposed as props.
	- `defaultSlot`: Whether to inject the default `<slot>` (default `true`).
	- `base`: Base class (default `HTMLElement`).
	- `extends`: Customized built-in extension name (`is=`).
	- `cssText`: CSS text adopted into the shadow root.
	- `styleSheets`: Extra `CSSStyleSheet`s to adopt.

```javascript
import { defineCustomElement } from 'refui/extras'
import { createDOMRenderer } from 'refui/dom'

const R = createDOMRenderer()
const wc = defineCustomElement.bind(R)

const Hello = ({ name }) => () => <p>Hello, {name}</p>

wc('hello-card', Hello, { attrs: ['name'] })
```

### `props.expose(values)` (v0.8.0+)

Starting with v0.8.0, rEFui no longer provides a global `expose` helper. Components that need to share imperative handles now opt in by accepting an `expose` prop from their parent. When the parent supplies a callback, call `expose(values)` inside the child to publish any signals, methods, or metadata. Because the callback is a regular closure, you can invoke it later—even after awaits or timers—without extra helpers.

**Parameters:**
- `values`: Object containing the handles you want to make available to the parent component.

```jsx
import { signal } from 'refui';

const ChildComponent = ({ expose }) => {
	const count = signal(0);
	const increment = () => count.value++;

	expose?.({ count, increment });

	return <div>Count: {count}</div>;
};

const ParentComponent = () => {
	const childApi = signal(null);

	return (
		<div>
			<ChildComponent expose={(api) => { childApi.value = api; }} />
			<button on:click={() => childApi.value?.increment()}>
				Increment from parent
			</button>
		</div>
	);
};
```

> **Note:** In v0.8.0+, the `expose` callback is already closed over the right context, so you can call it later without wrapping it in `capture`.

### `getCurrentSelf()`

Gets the current component instance within a component's execution context.

**Returns:** Current component instance or `undefined`

```jsx
import { getCurrentSelf, onDispose } from 'refui';

const MyComponent = () => {
	const self = getCurrentSelf();

	onDispose(() => {
		console.log('Component disposed:', self);
	});

	return <div>Component</div>;
};
```

## Component References

### `$ref` Prop

The `$ref` prop is a special prop that allows you to get a reference to the rendered DOM element or component instance. It works with both HTML elements and custom components.

**Supported Types:**
- **Signal**: The element/component will be assigned to `$ref.value`
- **Function**: The function will be called with the element/component as an argument

```jsx
import { signal } from 'refui';

const MyComponent = () => {
	// Using signal for ref
	const buttonRef = signal();
	const divRef = signal();

	// Using function for ref
	const handleInputRef = (inputElement) => {
		console.log('Input element:', inputElement);
		inputElement.focus();
	};

	const focusButton = () => {
		buttonRef.value?.focus();
	};

	return (
		<div $ref={divRef}>
			<input $ref={handleInputRef} type="text" />
			<button $ref={buttonRef} on:click={focusButton}>
				Focus me programmatically
			</button>
		</div>
	);
};
```

**Component References (v0.8.0+):**
When used with custom components, pass an `expose` prop to receive a stable handle from the child:

```jsx
import { signal } from 'refui';

const Counter = ({ expose }) => {
	const count = signal(0);
	const increment = () => count.value++;
	const decrement = () => count.value--;

	expose?.({ count, increment, decrement });

	return (
		<div>
			<p>Count: {count}</p>
			<button on:click={increment}>+</button>
			<button on:click={decrement}>-</button>
		</div>
	);
};

const App = () => {
	const counterApi = signal(null);

	const reset = () => {
		counterApi.value?.count.value = 0;
	};

	const addTen = () => {
		const api = counterApi.value;
		if (!api) return;
		for (let i = 0; i < 10; i++) {
			api.increment();
		}
	};

	return (
		<div>
			<Counter expose={(api) => { counterApi.value = api; }} />
			<button on:click={reset}>Reset</button>
			<button on:click={addTen}>Add 10</button>
		</div>
	);
};
```

**Function-based References:**
Useful for immediate setup or when you don't need to store the reference:

```jsx
const setupCanvas = (canvas) => {
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = 'blue';
	ctx.fillRect(0, 0, 100, 100);
};

const CanvasComponent = () => (
	<canvas
		$ref={setupCanvas}
		width="200"
		height="200"
	/>
);
```

**Error Handling:**
In development mode, `$ref` will throw an error if you pass an invalid type (not a signal or function):

```jsx
// ❌ This will throw an error in development
<div $ref="invalid-string" />

// ❌ This will also throw an error in development
<div $ref={42} />

// ✅ These are valid
<div $ref={signal()} />
<div $ref={(el) => console.log(el)} />
```

> **⚠️ Important Note - Dynamic Components & HMR**
>
> In signal-based auto dynamic components, the `$ref` value is **not equal** to the return value from `createComponent()` or `renderer.render()`.
>
> **In development mode with HMR enabled:**
> - **Always use `$ref`** to get component references - don't rely on return values from `createComponent()` or `renderer.render()`
> - **Only use the return value when manually disposing** a rendered component, as it properly cleans up side effects from the dynamic wrapper
> - This behavior difference doesn't cause issues in production mode
>
> ```jsx
> import { signal, createComponent } from 'refui';
>
> const MyComponent = () => <div>Hello</div>;
>
> // ❌ Don't rely on this in dev mode with HMR
> const instance = createComponent(MyComponent);
>
> // ✅ Always use $ref for component access
> const componentRef = signal();
>
> const App = () => (
>   <div>
>     <MyComponent $ref={componentRef} />
>     <button on:click={() => {
>       // ✅ Use $ref value for interactions
>       console.log('Component:', componentRef.value);
>
>       // ❌ Don't use instance directly in dev/HMR
>       // console.log('Instance:', instance);
>     }}>
>       Log Component
>     </button>
>   </div>
> );
>
> // ✅ Only use return value for manual disposal
> const cleanup = () => {
>   dispose(instance); // This cleans up dynamic wrapper side effects
> };
> ```

## Utility Functions

### Reflow Runtime Helpers

`refui/reflow` exports helpers for tagging and detecting host nodes when using the Reflow runtime.

#### `markNode(node)`

Marks a host node so Reflow treats it as an already-created node (instead of trying to interpret it as a component or value). Use this when you construct nodes manually or pass through nodes from another renderer. This is especially important for array-based node representations; otherwise the JSX automatic runtime may treat them as child arrays. The HTML renderer already marks its nodes for you.

#### `isNode(value)`

Returns `true` when a value has been marked with `markNode`. Use this to detect host nodes in custom utilities. If you are writing your own renderer, ensure `nodeOps.isNode` recognizes your node shape so the runtime doesn't misinterpret nodes as arrays.

### Renderer Instance Methods

When you create a renderer (DOM, HTML, etc.), it provides these utility methods:

#### `renderer.createElement(tag, props?, ...children)`

Creates an element using the renderer. Alias: `renderer.c`

**Parameters:**
- `tag`: HTML tag string or component function
- `props`: Properties object
- `...children`: Child elements

```jsx
// Available as R.c in JSX
const element = renderer.createElement('div', { class: 'container' }, 'Hello');
```

#### `renderer.createFragment(name?)`

Creates a fragment for grouping elements.

**Parameters:**
- `name`: Optional name for debugging

```jsx
const fragment = renderer.createFragment('MyFragment');
renderer.appendNode(fragment, element1, element2);
```

#### `renderer.ensureElement(value)`

Ensures a value is a valid element, converting supported inputs into nodes and resolving lazy constructs.

**Behavior:**
- Functions are called repeatedly with the renderer until they return a non-function value.
- Promises/thenables are wrapped in an internal `<Async>` boundary and rendered.
- Arrays are handled as follows:
	- `[]` → `null` (nothing to render).
	- `[single]` → normalized as if you passed `single` directly.
	- `[a, b, ...]` → wrapped in a fragment with each entry normalized.
- `null`, `undefined`, or existing nodes are returned as-is.
- All other values are turned into text nodes via `renderer.text`.

**Parameters:**
- `value`: Value to convert (node, function, promise, array, primitive, etc.)

**Returns:** Element, fragment, or text node

```jsx
const textNode = renderer.ensureElement('Hello World');
const fromFn = renderer.ensureElement(() => 'Deferred');
const unchanged = renderer.ensureElement(existingElement);
```

#### `renderer.text(content)`

Creates a text node from a value or signal. Non-string values are coerced with `String(...)`; `undefined`/`null` become an empty string.

**Parameters:**
- `content`: Text content; can be a primitive value or a signal of such

```jsx
import { signal } from 'refui';

const message = signal('Hello');
const textNode = renderer.text(message); // Reactive text node
const staticNumber = renderer.text(42);  // Renders `42` as text
```

#### `renderer.normalizeChildren(children)`

Normalizes an array of children, flattening arrays and converting values to elements using the same rules as `renderer.ensureElement`.

**Behavior:**
- Flattens nested arrays and fragments.
- Coalesces adjacent primitive values into a single text node.
- Converts signals into reactive text nodes.
- Resolves function and promise children into elements.
- Stringifies plain objects using `JSON.stringify` (falling back to `String` when needed).

**Parameters:**
- `children`: Array of child elements

**Returns:** Normalized array of elements

```jsx
const normalized = renderer.normalizeChildren([
	'text',
	123,
	signal('reactive text'),
	['nested', 'array'],
	() => 'from function',
	element
]);
```

### Static Components and HMR Helpers

rEFui uses a lightweight notion of “static” components for framework-level primitives and HMR integration.

#### `markStatic(component)`

Marks a function component as static/abstract. Static components may be called directly by the renderer (bypassing `createComponent` in some cases) and are treated as leaf nodes by the HMR system.

```js
import { markStatic } from 'refui/utils'

function MyPrimitive(props, ...children) {
	// low-level wrapper logic
	return (R) => /* render something via renderer R */
}

markStatic(MyPrimitive)
```

You generally don’t need this in application code; it’s intended for building primitives like `Fn`, `For`, `If`, `Dynamic`, `Async`, `Render`, and extras such as `Parse`, `UnKeyed`, or `createPortal`’s components.

#### `isStatic(component)`

Returns `true` if a component was previously marked with `markStatic`. This is used internally by the renderer and HMR to detect abstract components.

#### `renderer.render(target, component, props?, ...children)`

Renders a component and appends it to a target element.

**Parameters:**
- `target`: Target element to render into
- `component`: Component function
- `props`: Optional props
- `...children`: Optional children

**Returns:** Component instance

```jsx
const instance = renderer.render(
	document.getElementById('app'),
	MyComponent,
	{ name: 'World' }
);
```

### Node Manipulation Methods

#### `renderer.appendNode(parent, ...children)`

Appends child nodes to a parent element.

```jsx
renderer.appendNode(parent, child1, child2, child3);
```

#### `renderer.insertBefore(node, reference)`

Inserts a node before a reference node.

```jsx
renderer.insertBefore(newNode, existingNode);
```

#### `renderer.removeNode(node)`

Removes a node from its parent.

```jsx
renderer.removeNode(nodeToRemove);
```

### Fragment Utilities

#### `renderer.isFragment(node)`

Checks if a node is a fragment.

**Returns:** Boolean

```jsx
if (renderer.isFragment(node)) {
	console.log('This is a fragment');
}
```

## Advanced Usage Examples

### Custom Renderer Implementation

```jsx
import { createRenderer } from 'refui';

// Example: Console renderer that logs structure
const consoleOps = {
	isNode: (node) => typeof node === 'object' && node.type,
	createNode: (tag) => ({ type: 'element', tag, children: [], props: {} }),
	createTextNode: (text) => ({ type: 'text', content: text }),
	createAnchor: (text) => ({ type: 'anchor', content: text }),
	createFragment: () => ({ type: 'fragment', children: [] }),
	removeNode: (node) => console.log('Remove:', node),
	appendNode: (parent, ...children) => {
		parent.children.push(...children);
		console.log('Append to:', parent.tag, children);
	},
	insertBefore: (node, ref) => console.log('Insert before:', node, ref),
	setProps: (node, props) => {
		Object.assign(node.props, props);
		console.log('Set props:', node.tag, props);
	}
};

const consoleRenderer = createRenderer(consoleOps, 'console');
```

### Component with Cleanup

```jsx
import { onDispose, getCurrentSelf } from 'refui';

const TimerComponent = () => {
	const self = getCurrentSelf();

	const interval = setInterval(() => {
		console.log('Tick from:', self);
	}, 1000);

	onDispose(() => {
		clearInterval(interval);
		console.log('Timer cleanup');
	});

	return <div>Timer running...</div>;
};
```

### Async Component with Context

This example demonstrates how to create a reusable async component that fetches data and notifies the parent by calling the per-component expose callback.

```jsx
import { Async, signal, $, read } from 'refui';

// 1. The async component itself. It fetches data and resolves with a render function.
const DataLoader = async ({ url, expose }) => {
	try {
		const response = await fetch(read(url));
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

		const data = await response.json();
		expose?.({ data });

		// Resolve with the component to render on success
		return <pre>{JSON.stringify(data, null, 2)}</pre>;

	} catch (error) {
		expose?.({ error });
		const message = error instanceof Error ? error.message : String(error);

		// Resolve with the component to render on failure
		return <div>Error: {message}</div>;
	}
};

// 2. The parent component that uses the async component.
const App = () => {
	const currentUrl = signal('https://jsonplaceholder.typicode.com/todos/1');
	const loaderState = signal({ data: null, error: null });

	const handleExpose = (payload) => {
		const prev = loaderState.value;
		loaderState.value = { ...prev, ...payload };
	};

	return  (
		<div>
			<Async
				future={DataLoader({ url: currentUrl, expose: handleExpose })}
				fallback={() => <div>Loading...</div>}
			/>

			<hr />
			<button on:click={() => currentUrl.value = `https://jsonplaceholder.typicode.com/todos/${Math.ceil(Math.random() * 10)}`}>
				Load Random Todo
			</button>

			<h4>Loader State:</h4>
			<p>Error: {$(() => {
				const error = loaderState.value.error;
				if (!error) return 'None';
				return error.message ?? String(error);
			})}</p>
			<p>Data: {$(() => loaderState.value.data ? JSON.stringify(loaderState.value.data, null, 2) : 'Pending')}</p>
		</div>
	);
};
```

This API reference covers all the core functionality available in rEFui. For reactive state management, refer to the [Signals documentation](../concepts/signals.md), and for built-in components, see the [Components documentation](../concepts/components.md).
