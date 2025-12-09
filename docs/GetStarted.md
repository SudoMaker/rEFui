# Getting Started

Welcome to rEFui! This guide will walk you through the core concepts and help you build your first reactive application.

## Table of Contents

- [What is rEFui?](#what-is-refui)
- [Core Concepts](#core-concepts)
	- [Signals](#signals)
	- [Components](#components)
	- [Renderers](#renderers)
- [Project Setup](#project-setup)
	- [Configuring JSX](#configuring-jsx)
	- [Best Practices](#best-practices)
- [A Note on Reactivity in JSX](#a-note-on-reactivity-in-jsx)
- [Your First Component](#your-first-component)
	- ["Hello, World!"](#hello-world)
- [Building a Reactive Counter](#building-a-reactive-counter)
- [Working with Lists & Conditionals](#working-with-lists--conditionals)
	- [Conditional Rendering with `If`](#conditional-rendering-with-if)
	- [Rendering Lists with `For`](#rendering-lists-with-for)
- [Next Steps](#next-steps)

## What is rEFui?

rEFui is a lightweight JavaScript library for building user interfaces with a powerful reactive signal system at its core. It's designed to be flexible and performant, allowing you to create dynamic applications with minimal overhead.

Key features include:
- A fine-grained reactive system with **Signals**
- A simple, function-based **Component** model
- A pluggable **Renderer** architecture (DOM, SSR, etc.)
- Flexible **JSX** support without a required compiler

## Core Concepts

### Signals

Signals are the fundamental building blocks of reactivity in rEFui. They are reactive containers for values that automatically notify observers when they change. This allows your UI to update automatically in response to state changes.

> For a deep dive into signals, see the [**Signals Documentation**](Signal.md).

### Components

In rEFui, a component is a function that returns another function (the "render function"). This unique structure allows for maximum flexibility, especially with different renderers. When you use the JSX **automatic runtime** together with the **Reflow** renderer, the runtime wraps plain JSX returns into these factories for you, so you can usually omit the explicit `(R) =>` layer.

```jsx
// Automatic runtime / Reflow style (factory is inferred)
const Greeting = ({ name }) => <h1>Hello, {name}!</h1>;
```

For classic JSX transform or when you need direct access to the renderer object (for example to call `R.createFragment` or other renderer utilities), keep the explicit factory:

```jsx
// Classic transform / explicit render factory
const Greeting = ({ name }) => {
	// The returned function receives the renderer `R`
	return (R) => <h1>Hello, {name}!</h1>;
};
```

> Learn more about built-in components in the [**Components Documentation**](Components.md).

### Renderers

rEFui uses a pluggable renderer system to decouple component logic from the rendering environment. This means you can use the same components to render to the DOM, a string (for SSR), or even a custom target.

- **DOM Renderer**: For building interactive web applications.
- **HTML Renderer**: For server-side rendering (SSR) to generate static HTML.

> See the [**DOM Renderer**](DOMRenderer.md) and [**HTML Renderer**](HTMLRenderer.md) guides for more details.

## Project Setup

To get started, you'll need a project with a modern build tool like Vite, Rollup, or Webpack that can transpile JSX.

### Configuring JSX

rEFui supports both JSX automatic and classic transformation methods. Prefer **Classic Transform** for the best flexibility and **Automatic** runtime for the ease of use.

#### Bun

In your `tsconfig.json`, configure `compilerOptions`:
```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "refui"
  }
}
```


#### Vite (`vite.config.js`)

```javascript
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
	esbuild: {
		jsx: 'automatic',
		jsxImportSource: 'refui'
	},
});
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

> For more details on JSX configuration, see the [**JSX Setup Guide**](JSX.md).

## Best Practices

### Renderer Instance Management

**Create renderer instances once** at your application's entry point (typically `main.js` or `index.js`). Avoid creating multiple renderer instances within components.

```jsx
// ✅ Good: Create renderer once in main.js
import { createDOMRenderer } from 'refui/dom';
import { defaults } from 'refui/browser';

// Single renderer instance
export const renderer = createDOMRenderer(defaults);

// Use throughout your app
renderer.render(document.getElementById('app'), App);
```

```jsx
// ❌ Avoid: Creating renderers in components
const MyComponent = () => {
	// Don't do this - creates unnecessary renderer instances
	const renderer = createDOMRenderer(defaults);

	return <div>Hello</div>;
};
```

### Component Organization

Keep your components focused and reusable. When components grow large, consider breaking them into smaller, composable pieces.

```jsx
// ✅ Good: Small, focused components
const UserName = ({ user }) => <span>{user.name}</span>;
const UserEmail = ({ user }) => <span>{user.email}</span>;

const UserCard = ({ user }) => (
	<div>
		<UserName user={user} />
		<UserEmail user={user} />
	</div>
);
```

## A Note on Reactivity in JSX

rEFui is a **retained mode** renderer. This means JSX templates are evaluated once to create and render the initial UI structure. They are not functions that get re-executed automatically.

Because of this, you cannot place dynamic expressions directly in your JSX and expect them to be reactive.

```jsx
// ❌ This will NOT update when `count` changes
const IncorrectCounter = () => {
	const count = signal(0);

	return (
		<div>
			{/* This expression is evaluated only once! */}
			<p>Count is: {count.value}</p>

			<button on:click={() => count.value++}>Increment</button>
		</div>
	);
};
```

To make expressions reactive, you must wrap them in a computed signal using `$(...)` (an alias for `computed`). This creates a new signal that rEFui can track for updates.

```jsx
// ✅ This will update correctly
import { signal, $ } from 'refui';

const CorrectCounter = () => {
	const count = signal(0);

	// Create a computed signal for the text
	const message = $(() => `Count is: ${count.value}`);

	return (
		<div>
			{/* Use the computed signal here */}
			<p>{message}</p>

			<button on:click={() => count.value++}>Increment</button>
		</div>
	);
};
```

**Key Takeaway**: If you have an expression in JSX that depends on a signal, wrap it in `$(...)` to ensure it updates when the signal's value changes. Simple signal references, like `{count}`, are automatically handled by the renderer.

Inline helper functions follow the same rule. When a function appears inline as a child or prop value, rEFui evaluates it immediately—recursively invoking any returned functions until it resolves to a concrete node. These calls run during render only and do not subscribe to signals, so prefer explicit signals or computed wrappers for reactive behavior.

## Your First Component

Let's create and render a "Hello, World!" component to the DOM.

### "Hello, World!"

**index.html:**
```html
<!DOCTYPE html>
<html>
<body>
	<div id="app"></div>
	<script type="module" src="index.jsx"></script>
</body>
</html>
```

**index.jsx:**
```jsx
import { createDOMRenderer } from 'refui/dom';
import { defaults } from 'refui/browser';

// 1. Create a DOM renderer instance
const renderer = createDOMRenderer(defaults);

// 2. Define your component
const App = () => {
	return <h1>Hello, World!</h1>;
};

// 3. Render the component to a DOM element
renderer.render(
	document.getElementById('app'),
	App
);
```

## Building a Reactive Counter

Now, let's introduce state with signals to create an interactive counter.

**index.jsx:**
```jsx
import { createDOMRenderer } from 'refui/dom';
import { defaults } from 'refui/browser';
import { signal } from 'refui';

// 1. Create renderer
const renderer = createDOMRenderer(defaults);

// 2. Define the Counter component
const Counter = () => {
	// Create a reactive signal with an initial value of 0
	const count = signal(0);

	// The component's UI will automatically update when `count` changes
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

// 3. Render the component
renderer.render(
	document.getElementById('app'),
	Counter
);
```

## Working with Lists & Conditionals

rEFui provides built-in components to handle common UI patterns like conditional rendering and loops.

### Conditional Rendering with `If`

The `<If>` component renders content based on a condition.

```jsx
import { signal, If, $ } from 'refui';

const LoginStatus = () => {
	const isLoggedIn = signal(false);

	return (
		<div>
			<If condition={isLoggedIn}>
				{() => <p>Welcome back!</p>}
				{() => <p>Please log in.</p>}
			</If>

			<button on:click={() => isLoggedIn.value = !isLoggedIn.value}>
				{$(() => (isLoggedIn.value ? 'Logout' : 'Login'))}
			</button>
		</div>
	);
};
```

### Rendering Lists with `For`

The `<For>` component efficiently renders and updates lists of items. You can provide a function as a child that receives the `item` and returns a renderable node.

For a more dynamic example, checkout [For](Components.md#for).

```jsx
import { signal, For } from 'refui';

const TodoList = () => {
	const todos = signal([
		{ text: 'Learn rEFui' },
		{ text: 'Build an app' },
		{ text: 'Profit' },
	]);

	return (
		<ul>
			<For entries={todos}>
				{({ item }) => <li>{item.text}</li>}
			</For>
		</ul>
	);
};
```

### Handling Asynchronous Operations with `Async`

The `<Async>` component simplifies handling promises. You provide it a `future` (a promise) and children to render for the `pending`, `resolved`, and `error` states.

```jsx
import { Async } from 'refui';

// A mock API call that resolves after 1 second
const fetchUser = () => new Promise((resolve) => {
	setTimeout(() => resolve({ name: 'John Doe' }), 1000);
});

const UserProfile = () => {
	const userPromise = fetchUser();

	return (
		<Async
			future={userPromise}
			fallback={() => <p>Loading user...</p>}
			catch={({ error }) => <p>Error: {error.message}</p>}
		>
			{({ result: user }) => <p>Welcome, {user.name}!</p>}
		</Async>
	);
};
```

## Next Steps

You've now learned the basics of rEFui! To continue your journey, explore the detailed documentation:

- [**Signals**](Signal.md): Master the reactive system.
- [**Components**](Components.md): Discover all built-in components.
- [**DOM Renderer**](DOMRenderer.md): Learn about DOM-specific features.
- [**HTML Renderer**](HTMLRenderer.md): Get started with server-side rendering.
- [**JSX Setup**](JSX.md): Advanced JSX configurations.
- [**API Reference**](API.md): Explore the full rEFui API.
