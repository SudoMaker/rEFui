# DOM Renderer

This document provides a guide on how to set up and use the rEFui DOM renderer for building reactive web applications.

> **Note**: For detailed information about rEFui's reactive system and signals, see the [Signals documentation](Signal.md).

## Initial Setup

First, you need to create a renderer instance. We provide a default setup for browsers for convenience.

```javascript
import { createDOMRenderer } from 'refui/dom';
import { defaults } from 'refui/browser';

// Create the renderer with browser defaults
const renderer = createDOMRenderer(defaults);
```

## Usage with JSX

For instructions on how to set up JSX, please see the [JSX Setup Guide](JSX.md). It covers both the preferred **Classic Transform** and the **Automatic Runtime**.

## "Hello, World!" Example (Classic Transform)

Here is a complete example of rendering a component to the DOM using the preferred classic transform. You will first need to [configure your build tool](JSX.md#classic-transform-preferred).

**index.html:**
```html
<!DOCTYPE html>
<html>
<body>
	<div id="app"></div>
	<script src="index.js"></script>
</body>
</html>
```

**index.js:**
```jsx
import { createDOMRenderer } from 'refui/dom';
import { defaults } from 'refui/browser';

// 1. Create renderer
const renderer = createDOMRenderer(defaults);

// 2. Define a component that accepts a renderer (R)
const App = () => <h1>Hello, World!</h1>;

// 3. Render the component to a DOM element
renderer.render(document.getElementById('app'), App);
```

## Reactive Components with Signals

rEFui's power comes from its reactive signal system. Here's an example with interactive state:

> **Note on Expressions**: Because rEFui is a retained-mode renderer, you only need to wrap expressions that dereference `.value` or perform inline computations in a computed signal (`$()`) to keep them reactive.
>
> - `<div>Count: {count}</div>` - **Correct**: Passing the signal itself keeps it reactive.
> - `<div>{$(() => `Count is ${count.value}`)}</div>` - **Correct**: Wrap computed strings or `.value` access.
> - `<div>Count is {count.value}</div>` - **Incorrect**: Dereferencing `.value` inline is evaluated once and will not update.

If you know a value will never change after the initial render, you can pass a plain literal—or even `signal.value`—so the renderer keeps it static and skips wiring a subscription.

```jsx
import { createDOMRenderer } from 'refui/dom';
import { defaults } from 'refui/browser';
import { signal } from 'refui';

const renderer = createDOMRenderer(defaults);

const Counter = () => {
	// Create a reactive signal
	const count = signal(0);

	return (
		<div>
			<h1>Count: {count}</h1>
			<button on:click={() => count.value++}>
				Increment
			</button>
			<button on:click={() => count.value--}>
				Decrement
			</button>
		</div>
	);
};

renderer.render(document.getElementById('app'), Counter);
```

## Working with Props

Components can receive props that can be signals or regular values:

```jsx
import { signal, read } from 'refui';

const Greeting = ({ name, count }) => {
	return (
		<div>
			<h1>Hello, {name}!</h1>
			<p>You have {count} messages</p>
		</div>
	);
};

const App = () => {
	const userName = signal('John');
	const messageCount = signal(5);

	return (
		<div>
			<Greeting name={userName} count={messageCount} />
			<button on:click={() => userName.value = 'Jane'}>
				Change Name
			</button>
			<button on:click={() => messageCount.value++}>
				Add Message
			</button>
		</div>
	);
};
```

## Setting Attributes and Properties

The DOM renderer automatically handles the difference between DOM properties and HTML attributes:

- **Props** are set as DOM object properties by default
- **Attributes** should use the `attr:` prefix
- Props containing `-` are treated as attributes automatically
- You can force a prop by using the `prop:` prefix
- Boolean values toggle the property/attribute on and off
- **Signal values** are automatically unwrapped and kept reactive

Usage: `attr:attribute-to-be-set="value"`

Example:
```jsx
import { signal } from 'refui';

const MyComponent = () => {
	const isChecked = signal(false);
	const tooltipText = signal('Hello');
	const customValue = signal('test');

	return (
		<>
			{/* Reactive attribute */}
			<input type="checkbox" attr:checked={isChecked}/>

			{/* Data attributes (automatic) */}
			<div data-tooltip={tooltipText}/>

			{/* Force as property */}
			<div prop:myWeirdProp={customValue}/>

			{/* Static values */}
			<input type="text" placeholder="Enter text"/>
		</>
	);
};
```

### Conditional Class Application

When using the browser preset, you can use the `class:` directive to conditionally apply CSS classes. This is much more direct than complex conditional expressions.

```jsx
import { signal } from 'refui';

const NavigationItem = ({ href, children, currentPath }) => {
	const isActive = currentPath.eq(href);
	const isHovered = signal(false);

	return (
		<a
			href={href}
			class:active={isActive}           // Apply 'active' class conditionally
			class:hover={isHovered}           // Apply 'hover' class conditionally
			on:mouseenter={() => isHovered.value = true}
			on:mouseleave={() => isHovered.value = false}
		>
			{children}
		</a>
	);
};

// You can combine multiple conditional classes
const StatusCard = ({ status, isLoading }) => {
	const isError = status.eq('error');
	const isSuccess = status.eq('success');

	return (
		<div
			class="card"                      // Static class
			class:loading={isLoading}         // Conditional: loading state
			class:error={isError}             // Conditional: error state
			class:success={isSuccess}         // Conditional: success state
		>
			Status: {status}
		</div>
	);
};
```

> **Note**: The `class:` directive is available when using the browser preset (`refui/browser`). For more information about presets and directives, see the [Presets documentation](Presets.md#browser).

> **Tailwind CSS tip**: Tailwind’s scanner only picks up class names that appear inside literal `class="..."` attributes. Keep your full utility list in the static `class` attribute, then layer `class:` toggles for conditional pieces. For example, `class="card text-sm error"` plus `class:error={isError}` ensures Tailwind sees `card`, `text-sm`, and `error` while still letting you flip the class on and off at runtime.

## Macro Directives (`m:`)

Macro directives let you attach reusable DOM behaviors to elements by prefixing a prop with `m:`. When the renderer sees `m:macroName`, it looks up a handler registered on the renderer and calls it with the element and the value you passed.

### Registering a macro

You can provide macros when creating the renderer, or register them later with `renderer.useMacro`. Handlers are responsible for managing reactive values themselves.

```javascript
import { createDOMRenderer } from 'refui/dom'
import { defaults } from 'refui/browser'
import { bind, nextTick } from 'refui/signal'

const renderer = createDOMRenderer({
	...defaults,
	macros: {
		tooltip(node, value) {
			bind(function(text) {
				node.setAttribute('aria-label', text ?? '')
			}, value)
		}
	}
})

renderer.useMacro({
	name: 'autofocus',
	handler(node, value) {
		if (!value) return
		nextTick(function() {
			node.focus()
		})
	}
})
```

### Using macros in JSX

After the renderer knows about a macro, you can opt-in from JSX with the `m:` directive. JSX boolean syntax (`m:autofocus`) passes `true`; you can also pass signals or other values that your handler understands.

```jsx
const Field = ({ helperText }) => (
	<div class="field" m:tooltip={helperText}>
		<input type="text" m:autofocus />
	</div>
)
```

Because the macro handler receives the raw value, use `bind` or `isSignal` inside the handler when you need reactive updates.

Keep macros for behaviors that genuinely repeat across components. When a DOM tweak only appears in one place, inline it inside the component instead—doing so keeps reviews and refactors straightforward.

## Event Handling

The DOM renderer provides a flexible event system that works seamlessly with signals.

Usage: `on[-option-moreOptions]:eventName={handler}`

Examples:

- Simple click with signal updates
```jsx
import { signal } from 'refui';

const Counter = () => {
	const count = signal(0);
	return (
		<button on:click={() => count.value++}>
			Clicked {count} times
		</button>
	);
};
```

- Click once
```jsx
<button on-once:click={() => alert('Clicked!')}>Click me!</button>
```

- Passive events for performance
```jsx
<div on-passive:scroll={() => {/* do some time consuming operations */}}>{longContent}</div>
```

- Multiple options
```jsx
<div on-capture-passive:click={() => alert('Clicked!')}><button>Click me!</button></div>
```

- Working with event objects and signals
```jsx
const SearchInput = () => {
	const query = signal('');
	const results = signal([]);

	return (
		<input
			type="text"
			value={query}
			on:input={(event) => {
				query.value = event.target.value;
				// Trigger search logic here
			}}
			placeholder="Search..."
		/>
	);
};
```

## Presets

We provide presets for conveinence.

### Browser

- Check [here](Presets.md#browser)
