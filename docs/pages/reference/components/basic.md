---
title: Basic Components
description: Core control flow components like If, For, Fn, Dynamic.
weight: 43
---

# Basic Components

These components are available directly from the `refui` package.

## If

Conditionally renders content based on a `condition` or `true` prop. Works with both static values and reactive signals.

**Note**: The `else` prop has higher priority than providing a second child function for the `else` case. The `true` prop has higher priority than the `condition` prop.

```jsx
import { If, signal, $ } from 'refui'

// With reactive signals
const App = () => {
	const isLoggedIn = signal(false);
	const userName = signal('John');

	return (
		<div>
			<If condition={isLoggedIn}>
				{() => <span>Welcome back, {userName}!</span>}
				{() => <span>Please log in to continue.</span>}
			</If>

			<button on:click={() => isLoggedIn.value = !isLoggedIn.value}>
				{isLoggedIn.choose('Logout', 'Login')}
			</button>
		</div>
	);
};

// Using the 'else' prop for cleaner syntax
const AppAlternative = ({ value }) => {
	return (
		<If
			condition={value}
			else={() => <span>Condition is false.</span>}
		>
			{() => <span>Condition is true!</span>}
		</If>
	)
}
```

## For

Renders a list of items from a signal that resolves to an array (or any value exposing the signal interface like `.value` and `.trigger()`). `For` is reactive to the list change itself, with a highly optimized reconcile algorithm that only executes the least necessary steps to update the list. Passing a plain array renders a static snapshot; updates and the imperative helpers require a reactive signal.

The child of a `<For>` component can be a **component** or a **function** that returns a renderable node.

-   **Component:** Pass a component function directly. It will receive `item` and `index` as props. This is the recommended approach for better code organization.
-   **Function:** Pass a function that takes `item` and `index` as arguments (destructured from a props object) and returns a node.

Items are tracked by the value of each entry by default, but when you're replacing the whole array by loading it from other sources, provide a `track` prop with the name of the key property in your data objects. You can also set `indexed={true}` to receive a signal containing the item's current index as the second argument to the render function.

**Note**: If you directly modify a non-signal property on an `item` from the list, the UI will not update. For lists with reactive items that need granular updates, use the [`UnKeyed`](../reference/components/extras.md#unkeyed) component instead.

```jsx
import { signal, For, $ } from 'refui';

// Define a separate component for list items
const TodoItem = ({ item, index }) => {
	const toggleTodo = () => {
		item.completed.value = !item.completed.value;
	};

	return (
		<li>
			<span
				style:textDecoration={item.completed.choose('line-through', 'unset')}
			>
				{$(() => index.value + 1)}. {item.text}
			</span>
			<button on:click={toggleTodo}>
				{item.completed.choose('Undo', 'Complete')}
			</button>
		</li>
	);
};

export const TodoList = () => {
	const newTodoText = signal('');
	const todos = signal([
		{ text: 'Learn rEFui', completed: signal(false) },
		{ text: 'Build an app', completed: signal(false) },
	]);

	const addTodo = () => {
		const newTodo = {
			text: newTodoText.peek(),
			completed: signal(false),
		};
		todos.value.push(newTodo);
		todos.trigger();
		newTodoText.value = ''
	};

	return (
		<div>
			<input value={newTodoText} on:input={(e) => { newTodoText.value = e.target.value }} />
			<button on:click={addTodo}>Add Todo</button>
			<ul>
				<For entries={todos} indexed={true}>
					{TodoItem}
				</For>
			</ul>
		</div>
	);
};

// Alternatively, you can use an inline function for simpler cases:
const SimpleTodoList = () => {
	const todos = signal([
		{ id: 1, text: 'Learn rEFui' },
		{ id: 2, text: 'Build an app' },
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

### Exposed Methods

The `<For>` component exposes several methods via its optional `expose` prop (v0.8.0+), allowing you to interact with the list imperatively.

-   `getItem(key)`: Retrieves the original data item associated with a given key. (Only available when `track` is used).
-   `remove(key)`: Removes an item from the list by its key. (Only available when `track` is used).
-   `clear()`: Removes all items from the list.

Here's an example of how to use them:

```jsx
import { signal, For, $ } from 'refui';

const InteractiveList = () => {
	const listApi = signal(null);
	const items = signal([
		{ id: 1, text: 'First' },
		{ id: 2, text: 'Second' },
		{ id: 3, text: 'Third' },
	]);

	const removeItem = () => {
		// Remove item with id 2
		listApi.value?.remove(2);
	};

	const clearList = () => {
		listApi.value?.clear();
	};

	return (
		<div>
			<For
				entries={items}
				track="id"
				expose={(api) => { listApi.value = api; }}
			>
				{({ item }) => <div>{item.text}</div>}
			</For>
			<button on:click={removeItem}>Remove Second</button>
			<button on:click={clearList}>Clear All</button>
		</div>
	);
};
```

## Fn

Executes a function that returns a render function (`(R) => Node`). This is useful for complex conditional logic that doesn't neatly fit into an [`If`](#if) component. `Fn` is also the building block for all other built-in components except for [`For`](#for). The `R` parameter can be omitted when using Reflow renderer.

**Performance Tip**: Define the returned render functions outside the `Fn` scope to prevent them from being recreated on every render cycle.

```jsx
import { Fn, read } from 'refui'

const renderA = (R) => <div>Condition: 123</div>
const renderB = (R) => <div>Condition: 456</div>
const renderDefault = (R) => <div>Nothing matched!</div>

const App = ({ condition }) => {
	return (
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

Inline helper functions that you place directly in JSX are evaluated immediately—rEFui keeps calling the returned value with renderer object as the only parameter until it resolves to a concrete node. Because this evaluation happens synchronously during render, no reactive tracking is established. Use them only for constant branches or to invoke pure helpers. When you need the branching to respond to signals, keep the logic inside `<Fn>` or derive a computed signal instead.

**Caveat (signals inside `Fn`):** Avoid creating a new signal and immediately reading it inside the `Fn` handler body itself (the function you pass as `<Fn>{handler}</Fn>`). That handler runs in a tracked reactive scope; if it allocates a signal and then updates it elsewhere, it can schedule itself again, creating a new signal without the update and making the updated value useless. Instead, create signals either:

- Outside the `Fn` (e.g. in the parent component), or
- Inside the render function that the handler returns (`(R) => ...`),

so that updates happen from stable reactive owners rather than from the `Fn` control body.

**Note**: Although `Fn` is much more efficient when updating than re-rendering the whole tree in other immediate mode frameworks like React, it's still more expensive than signals for rendering texts only. If you want simple conditional text like adding `s`/`es` to plural nouns, just use a computed signal.

### Advanced Usage: `ctx` and `catch`

The `Fn` component accepts two additional props for more advanced scenarios:

-   `ctx`: A value or signal that is passed as the first argument to the child handler function. This is useful for providing context to the handler without creating closures in the render path.
-   `catch`: A function that gets called if an error is thrown during the rendering of the handler's result. It receives the `error`, the component `name`, and the `ctx` as arguments, allowing you to create robust error boundaries.

Here's how you can use them together:

```jsx
import { Fn, read, signal } from 'refui'

// This component might throw an error
const UserProfile = ({ user }) => {
	if (!user || !user.name) {
	throw new Error("User name is missing!");
	}
	return <div>Welcome, {user.name}</div>;
};

const App = () => {
	const userSignal = signal({ name: 'John Doe' });

	// A handler to render error states
	const renderError = (error, name, ctx) => (
	<div style="color: red;">
		<p>Oops! Something went wrong in "{name}":</p>
		<p><b>{error.message}</b></p>
		<p>Context when error occurred:</p>
		<pre>{JSON.stringify(read(ctx), null, 2)}</pre>
	</div>
	);

	// The handler function passed to <Fn>. It receives the context.
	const userProfileHandler = (user) => UserProfile({ user });

	setTimeout(() => userSignal.value = { name: null }, 2000); // Simulate an error condition

	return (
	<Fn ctx={userSignal} catch={renderError} name="UserProfileBoundary">
		{userProfileHandler}
		{renderError}
		{/* Alternatively, handleError can be written as the second child of Fn */}
	</Fn>
	);
};
```

## Dynamic

Renders a component that can change over time. The component can be specified as a string (for HTML tags) or a component function, which can be wrapped in a signal for dynamic updates.

**Advanced Usage - Dynamic Components with Props:**

```jsx
import { signal, derivedExtract, Dynamic } from 'refui';

const Card = ({ title, color = 'white' }) => (
	<div style={`background: ${color}; padding: 20px; border-radius: 8px;`}>
		<h3>{title}</h3>
	</div>
);

const Alert = ({ message, type = 'info' }) => (
	<div style={`border: 2px solid ${type === 'error' ? 'red' : 'blue'}; padding: 10px;`}>
		{message}
	</div>
);

const DynamicDemo = () => {
	const currentComponent = signal(Card);

	// Use a single signal for all props
	const props = signal({
		title: 'My Card',
		color: 'lightblue',
		message: 'This is an alert!',
		type: 'info'
	});

	const switchComponent = () => {
		currentComponent.value = currentComponent.value === Card ? Alert : Card;
	};

	// Create individual reactive signals for each prop
	const { title, color, message, type } = derivedExtract(props);

	return (
		<div>
			<Dynamic
				is={currentComponent}
				title={title}
				color={color}
				message={message}
				type={type}
			/>
			<button on:click={switchComponent}>Switch Component</button>
		</div>
	);
};
```

You can also use the `<Dynamic>` component with the `is` prop for the same effect:

```jsx
const ComponentSwitcher = () => {
	const currentTag = signal('button');
	const message = signal('Click to change tag!');

	return (
		<div>
			<Dynamic
				is={currentTag}
				on:click={() => {
					currentTag.value = currentTag.value === 'button' ? 'div' : 'button';
					message.value = `Now I'm a ${currentTag.value}!`;
				}}
				style="padding: 10px; border: 1px solid #ccc; margin: 5px;"
			>
				{message}
			</Dynamic>

			<p>Current element: &lt;{currentTag}&gt;</p>
		</div>
	);
};
```

## Render

Renders a component instance that was created separately using `createComponent`. This is useful for manually managing component lifecycles or rendering components stored in signals.

```jsx
import { Render, createComponent, signal } from 'refui'

const MyComponent = ({ message }) => <div>Message: {message}</div>;

const App = () => {
	const componentInstance = createComponent(MyComponent, { message: 'Hello World!' })
	const currentInstance = signal(componentInstance)

	return (
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
};
```

## memo

Provides component-scoped memoization for functions that should only run once during an instance's lifetime. Call `memo` inside a component to capture the current rendering context, then reuse the returned function to access the cached result without re-running the original logic.

**Parameters:**

- `fn`: A function that produces the value you want to cache. It is executed the first time the memoized wrapper runs.

**Returns:** A function that, when called, returns the cached result from the initial invocation.

### Usage Notes

- The wrapped function runs at most once per parent function evaluation. Subsequent calls return the cached value.
- The captured context ensures that any signals read during the first execution are tracked correctly, and `onDispose` handlers registered inside `fn` are tied to the component lifecycle.
- Because the value never re-computes automatically, avoid reading reactive data inside `fn` if you expect it to change. Use signals or derived values outside of `memo` when you need updates.
- Call `memo` inline inside the component factory or inside the returned render function. Hoisting `memo` outside the component will capture the wrong context and break caching. If you prefer to prepare helpers up front, use the provided `useMemo` wrapper and invoke it inside the component.
- When the memoized value creates components or side effects, the cached instance stays reactive even if you temporarily detach it from the renderer. Cleanup registered inside `fn` is recorded on the captured context, so release references or trigger disposal when the instance is no longer needed.
- Once the owning component disposes, the memoized wrapper no longer has a live context; calling it after teardown behaves like an untracked function call.

Unlike React or Solid, `memo` here captures the current reactive context and defers execution until the returned function is actually run (for example when a conditional branch is selected). This allows inline usage inside JSX-style control flow without introducing dedicated hooks.

### Inline Branching Example

```jsx
import { memo, signal, If, $ } from 'refui'

const ToggleMessage = () => {
	const isOpen = signal(false)

	return (
		<div>
			<button on:click={() => isOpen.value = !isOpen.value}>
				{isOpen.choose('Hide', 'Show')} details
			</button>

			<If condition={isOpen}>
				{memo(() => <p class="details">Detailed view created once</p>)}
				{memo(() => <p class="summary">Summary created once</p>)}
			</If>
		</div>
	)
}
```

### `useMemo` Wrapper Example

The exported `useMemo` helper builds a wrapper you can invoke inside the component to obtain the memoized branch. This is useful when you want to reuse the same memo across multiple render positions.

Each call to `useMemo` returns a function; invoke that function inside your component so the enclosed `memo` call captures the correct reactive context.

```jsx
import { useMemo, signal, If, $ } from 'refui'

const renderDetails = useMemo((R) => <p class="details">Detailed view created once</p>)

const renderSummary = useMemo((R) => <p class="summary">Summary created once</p>)

const ToggleMessage = () => {
	const isOpen = signal(false)

	return (
		<div>
			<button on:click={() => isOpen.value = !isOpen.value}>
				{isOpen.choose('Hide', 'Show')} details
			</button>

			<If condition={isOpen}>
				{renderDetails()}
				{renderSummary()}
			</If>
		</div>
	)
}
```
