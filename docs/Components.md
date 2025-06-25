# Components

rEFui provides a set of built-in components to handle common UI patterns like conditional rendering, loops, and asynchronous operations. These are the building blocks for creating dynamic and reactive user interfaces.

> **Note**: For detailed information about rEFui's reactive system and signals, see the [Signals documentation](Signal.md).

A core concept in rEFui is that a component is a function that accepts `props` and `children`, and returns a render function. This render function receives the renderer `R` and returns a node to be displayed.

```jsx
const MyComponent = (props, ...children) => (R) => <div>Hello rEFui!</div>
```

> **Note on JSX Runtimes**
>
> While rEFui supports different JSX transforms, the preferred approach for maximum flexibility is the **Classic Transform**. This pattern allows you to swap or wrap renderers on a per-component basis. For a detailed guide on setting up both Classic and Automatic runtimes, see the [JSX Setup documentation](JSX.md).

## Basic Components

These components are available directly from the `refui` package.

### If

Conditionally renders content based on a `condition` or `true` prop. Works with both static values and reactive signals.

**Note**: The `else` prop has higher priority than providing a second child function for the `else` case. The `true` prop has higher priority than the `condition` prop.

```jsx
import { If, signal, $ } from 'refui'

// With reactive signals
const App = () => {
	const isLoggedIn = signal(false);
	const userName = signal('John');

	return (R) => (
		<div>
			<If condition={isLoggedIn}>
				{() => <span>Welcome back, {userName}!</span>}
				{() => <span>Please log in to continue.</span>}
			</If>

			<button on:click={() => isLoggedIn.value = !isLoggedIn.value}>
				{$(() => isLoggedIn.value ? 'Logout' : 'Login')}
			</button>
		</div>
	);
};

// Using the 'else' prop for cleaner syntax
const AppAlternative = ({ value }) => {
	return (R) => (
		<If
			condition={value}
			else={() => <span>Condition is false.</span>}
		>
			{() => <span>Condition is true!</span>}
		</If>
	)
}
```

### For

Renders a list of items from an array or a signal of an array. `For` is reactive to the list change itself, with a highly optimized reconcile algorithm that only executes the least necessary steps to update the list.

Items are tracked by the value of each entry by default, but when you're replacing the whole array by loading it from other sources, provide a `track` prop with the name of the key property in your data objects. You can also set `indexed={true}` to receive a signal containing the item's current index as the second argument to the render function.

**Note**: If you directly modify a non-signal property on an `item` from the list, the UI will not update. For lists with reactive items that need granular updates, use the [`UnKeyed`](#unkeyed) component instead.

```jsx
import { signal, For, $ } from 'refui';

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
    // We don't need to recreate the whole array
    // You can just modify the current one and trigger an update manually instead
    todos.value.push(newTodo);
    todos.trigger();
    newTodoText.value = ''
  };

  const toggleTodo = (completed) => {
    completed.value = !completed.value;
  };

  return (R) => (
    <div>
			<input value={newTodoText} on:input={(e) => { newTodoText.value = e.target.value }} />
      <button on:click={addTodo}>Add Todo</button>
      <ul>
        <For entries={todos} indexed={true}>
          {(item, index) => {
            return (
              <li>
                <span
                  style={$(() =>
                    item.completed.value ? 'text-decoration: line-through' : ''
                  )}
                >
                  {$(() => index + 1)}. {item.text}
                </span>
                <button on:click={() => toggleTodo(item.completed)}>
                  {$(() => (item.completed.value ? 'Undo' : 'Complete'))}
                </button>
              </li>
            );
          }}
        </For>
      </ul>
    </div>
  );
};
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

**Advanced Usage - Dynamic Components with Props:**

```jsx
import { signal, derivedExtract, Dynamic } from 'refui';

const Card = ({ title, color = 'white' }) => (R) => (
	<div style={`background: ${color}; padding: 20px; border-radius: 8px;`}>
		<h3>{title}</h3>
	</div>
);

const Alert = ({ message, type = 'info' }) => (R) => (
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

	return (R) => (
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

	return (R) => (
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

### Async

Manages the lifecycle of asynchronous components by accepting a `future` prop, which should be a promise that resolves to a renderable component. While the promise is pending, it shows a `fallback` UI.

**Important**: The `future` prop is **not** reactive. To re-run the async operation with new inputs, you must create a new component instance by re-rendering the `<Async>` component. A common pattern is to wrap it in a component that controls its lifecycle, like `<Fn>`.

```jsx
import { Async, signal, Fn } from 'refui'

// An async component that fetches user data
const UserProfile = async ({ userId }) => {
	const response = await fetch(`https://jsonplaceholder.typicode.com/users/${userId}`);
	const userData = await response.json();

	return (R) => (
		<div>
			<h2>{userData.name}</h2>
			<p>Email: {userData.email}</p>
		</div>
	);
};

// Use <Fn> to re-create the <Async> component when the user ID changes
const App = () => {
	const currentUserId = signal(1);

	return (R) => (
		<div>
			<Fn>
				{() => () =>
					<Async
						future={UserProfile({ userId: currentUserId.value })}
						fallback={() => <div>Loading user...</div>}
					/>
				}
			</Fn>
			<button on:click={() => currentUserId.value++}>
				Load Next User ({currentUserId})
			</button>
		</div>
	);
};
```

#### Async Components with `capture` and `expose`

To create an async component that can communicate with its context (e.g., expose its internal state), you need `capture`.

`capture` records the current rendering context. When you call the captured function later (like after a promise resolves), it runs within that original context, allowing it to interact correctly with signals and other reactive APIs.

```jsx
import { capture, expose } from 'refui'

const DataFetcher = async ({ url }) => {
	// `capture` records the current render context so `expose` works correctly later.
	const exposeCaptured = capture(expose);

	try {
		const response = await fetch(url);
		const data = await response.json();

		// Expose the final data. This runs in the original context.
		exposeCaptured({ data });

		// The promise resolves with the final render function
		return (R) => <pre>{JSON.stringify(data, null, 2)}</pre>;

	} catch (error) {
		exposeCaptured({ error });
		return (R) => <div>Error: {error.message}</div>;
	}
};
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
