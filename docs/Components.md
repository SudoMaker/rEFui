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

The child of a `<For>` component can be a **component** or a **function** that returns a renderable node.

-   **Component:** Pass a component function directly. It will receive `item` and `index` as props. This is the recommended approach for better code organization.
-   **Function:** Pass a function that takes `item` and `index` as arguments (destructured from a props object) and returns a node.

Items are tracked by the value of each entry by default, but when you're replacing the whole array by loading it from other sources, provide a `track` prop with the name of the key property in your data objects. You can also set `indexed={true}` to receive a signal containing the item's current index as the second argument to the render function.

**Note**: If you directly modify a non-signal property on an `item` from the list, the UI will not update. For lists with reactive items that need granular updates, use the [`UnKeyed`](#unkeyed) component instead.

```jsx
import { signal, For, $ } from 'refui';

// Define a separate component for list items
const TodoItem = ({ item, index }) => {
	const toggleTodo = () => {
		item.completed.value = !item.completed.value;
	};

	return (R) => (
		<li>
			<span
				style={$(() =>
					item.completed.value ? 'text-decoration: line-through' : ''
				)}
			>
				{$(() => index.value + 1)}. {item.text}
			</span>
			<button on:click={toggleTodo}>
				{$(() => (item.completed.value ? 'Undo' : 'Complete'))}
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

	return (R) => (
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

	return (R) => (
		<ul>
			<For entries={todos}>
				{({ item }) => <li>{item.text}</li>}
			</For>
		</ul>
	);
};
```

#### Exposed Methods

The `<For>` component exposes several methods on its instance that allow you to interact with the list imperatively. You can get a reference to the component instance using the `$ref` prop.

-   `getItem(key)`: Retrieves the original data item associated with a given key. (Only available when `track` is used).
-   `remove(key)`: Removes an item from the list by its key. (Only available when `track` is used).
-   `clear()`: Removes all items from the list.

Here's an example of how to use them:

```jsx
import { signal, For, $ } from 'refui';

const InteractiveList = () => {
    const listRef = signal();
    const items = signal([
        { id: 1, text: 'First' },
        { id: 2, text: 'Second' },
        { id: 3, text: 'Third' },
    ]);

    const removeItem = () => {
        // Remove item with id 2
        listRef.peek()?.remove(2);
    };

    const clearList = () => {
        listRef.peek()?.clear();
    };

    return (R) => (
        <div>
            <For entries={items} track="id" $ref={listRef}>
                {({ item }) => <div>{item.text}</div>}
            </For>
            <button on:click={removeItem}>Remove Second</button>
            <button on:click={clearList}>Clear All</button>
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

For simplicity, you can write functions directly inline without wrapped in a `Fn` tag:

```jsx
const App = ({ condition }) => {
	return (R) => (
		<div>
			Condition is {() => {
				switch (read(condition)) {
					case 'italic':
						return <i>Italic</i>
					case 'bold':
						return <b>Bold</b>
					default:
						return <span>Unknown</span>
				}
			}}
		</div>
	)
}

```

Inline functions are not unwrapped when passed to components, so you can process them within your components before actually being rendered.

**Note**: Although `Fn` is much more efficient when updating than re-rendering the whole tree in other immediate mode frameworks like React, it's still more expensive than signals for rendering texts only. If you want simple conditional text like adding `s`/`es` to plural nouns, just use a computed signal.

#### Advanced Usage: `ctx` and `catch`

The `Fn` component accepts two additional props for more advanced scenarios:

-   `ctx`: A value or signal that is passed as the first argument to the child handler function. This is useful for providing context to the handler without creating closures in the render path.
-   `catch`: A function that gets called if an error is thrown during the rendering of the handler's result. It receives the `error`, the component `name`, and the `ctx` as arguments, allowing you to create robust error boundaries.

Here's how you can use them together:

```jsx
import { Fn, read, signal } from 'refui'

// This component might throw an error
const UserProfile = ({ user }) => (R) => {
  if (!user || !user.name) {
    throw new Error("User name is missing!");
  }
  return <div>Welcome, {user.name}</div>;
};

const App = () => {
  const userSignal = signal({ name: 'John Doe' });

  // A handler to render error states
  const renderError = (R) => (error, name, ctx) => (
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

  return (R) => (
    <Fn ctx={userSignal} catch={renderError(R)} name="UserProfileBoundary">
      {userProfileHandler}
			{/* Alternatively, handleError can be written as the second child of Fn */}
			{renderError(R)}
    </Fn>
  );
};
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

Manages the lifecycle of asynchronous operations. It uses a render-prop pattern, where you provide components or functions as children to render different states (`pending`, `resolved`, `rejected`).

**Props:**

-   `future`: A promise or a function that returns a promise. The promise should resolve to a value.
-   `fallback`: (Optional) A component, function, or node to display while the promise is pending.
-   `catch`: (Optional) A handler for when the promise rejects.

Any other props passed to `<Async>` will be passed through to the `then`, `fallback`, and `catch` handlers.

**Children:**

`<Async>` expects children to be provided in a specific order to handle different states:

1.  **`then` (required):** The first child is a component or function that renders when the promise resolves successfully. It receives a `result` prop with the resolved value, along with any other props passed to `<Async>`.
2.  **`fallback` (optional):** The second child is a component or function to render while the promise is pending. It can also be provided via the `fallback` prop.
3.  **`catch` (optional):** The third child is a handler for when the promise rejects. It receives an `error` prop. It can also be provided via the `catch` prop.

#### Basic Usage with Functions

```jsx
import { Async } from 'refui';

const fetchMessage = () => new Promise(resolve => setTimeout(() => resolve('Data loaded!'), 1000));

const App = () => (R) => (
    <Async
        future={fetchMessage()}
        fallback={() => <p>Loading...</p>}
        catch={({ error }) => <p>Error: {error.message}</p>}
    >
        {({ result }) => <p>Success: {result}</p>}
    </Async>
);
```

#### Usage with Components and Prop-drilling

You can pass components directly as children. Any extra props on `<Async>` will be passed down to them.

```jsx
import { Async } from 'refui';

const SuccessComponent = ({ result, message }) => (R) => (
    <p>{message}: {result}</p>
);

const LoadingComponent = ({ message }) => (R) => (
    <p>{message}</p>
);

const ErrorComponent = ({ error }) => (R) => (
    <p>Failed to load: {error.message}</p>
);

const fetchUser = () => Promise.resolve('John Doe');

const App = () => (R) => (
    <Async
        future={fetchUser()}
        message="User loaded" // This prop is passed down
    >
        {SuccessComponent}
        {LoadingComponent}
        {ErrorComponent}
    </Async>
);
```

#### Automatic Async Components

If a component itself returns a promise (i.e., it's an `async` function), rEFui will automatically wrap it in a boundary similar to `<Async>`. You can provide `fallback` and `catch` props directly to the component invocation.

```jsx
import { signal, Fn } from 'refui';

// An async component that fetches user data
const UserProfile = async ({ userId }) => {
	const response = await fetch(`https://jsonplaceholder.typicode.com/users/${userId}`);
	if (!response.ok) throw new Error('User not found');
	const user = await response.json();

	return (R) => <div>Hello, {user.name}</div>;
};

// Use <Fn> to re-create the component when the ID changes
const App = () => {
    const userId = signal(1);

    return (R) => (
        <div>
            <Fn>
                {() => (
                    <UserProfile
                        userId={userId.value}
                        fallback={() => <div>Loading...</div>}
                        catch={({ error }) => <div>Error: {error.message}</div>}
                    />
                )}
            </Fn>
            <button on:click={() => userId.value++}>Load next</button>
        </div>
    );
};
```

#### Error Handling in Async Components

When a component function is `async`, rEFui automatically creates an async boundary. The `fallback` and `catch` props work directly on the component:

```jsx
// Async component that might fail
const StoryItem = async ({ id }) => {
	const story = await fetchStory(id); // This might throw

	return (R) => (
		<article>
			<h2>{story.title}</h2>
			<p>By {story.author}</p>
		</article>
	);
};

// Usage with error handling
const StoryList = () => {
	const storyIds = signal([1, 2, 3, 4, 5]);

	return (R) => (
		<div>
			<For entries={storyIds}>
				{({ item: id }) => (
					<StoryItem
						id={id}
						fallback={() => <div class="loading">Loading story...</div>}
						catch={({ error }) => (
							<div class="error">
								Failed to load story {id}: {error.message}
								<button on:click={() => window.location.reload()}>
									Retry
								</button>
							</div>
						)}
					/>
				)}
			</For>
		</div>
	);
};
```

> **Important**: When using implicit async components (async functions), the `fallback` and `catch` props are applied **directly to the component invocation**, not to a wrapping `<Async>` component. This makes async error handling much more streamlined.

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

### lazy

Creates a lazy-loaded component that can be dynamically imported and rendered. This is useful for code splitting and performance optimization, allowing components to be loaded only when needed while preserving the current rendering context.

The `lazy` function takes a loader function (typically a dynamic import) and an optional symbol to extract from the loaded module. It returns a function that can be called with additional arguments to render the lazy component.

**Parameters:**

- `loader`: A function that returns a Promise resolving to the module/component
- `symbol` (optional): The symbol to extract from the loaded module (defaults to 'default' for ES modules)

**Returns:** A function that can be called with additional arguments to render the lazy component

#### Basic Usage

```jsx
import { lazy, Fn } from 'refui'

// Create a lazy-loaded component
const LazyComponent = lazy(() => import('./MyComponent.js'))

// Use it in your application
const App = () => (R) => (
	<div>
		<h1>My App</h1>
		<Fn>
			{() => LazyComponent({ message: 'Hello from lazy component!' })}
		</Fn>
	</div>
)
```

#### Loading Specific Exports

```jsx
import { lazy } from 'refui'

// Load a specific named export
const LazyButton = lazy(() => import('./components.js'), 'Button')
const LazyModal = lazy(() => import('./components.js'), 'Modal')

const App = () => (R) => (
	<div>
		<LazyButton text="Click me" />
		<LazyModal isOpen={true} />
	</div>
)
```

#### Dynamic Component Loading

```jsx
import { lazy, signal, Dynamic } from 'refui'

const Dashboard = lazy(() => import('./Dashboard.js'))
const Profile = lazy(() => import('./Profile.js'))
const Settings = lazy(() => import('./Settings.js'))

const App = () => {
	const pages = {
		dashboard: Dashboard,
		profile: Profile,
		settings: Settings
	}

	const currentPage = signal('dashboard')
	const currentComponent = signal(pages.dashboard)

	const switchPage = (page) => {
		currentPage.value = page
		currentComponent.value = pages[page]
	}

	return (R) => (
		<div>
			<nav>
				<button on:click={() => switchPage('dashboard')}>Dashboard</button>
				<button on:click={() => switchPage('profile')}>Profile</button>
				<button on:click={() => switchPage('settings')}>Settings</button>
			</nav>

			<main>
				<Dynamic is={currentComponent} />
			</main>
		</div>
	)
}
```

#### Error Handling with Lazy Components

Lazy components are just async components and can handle loading errors using the `catch` prop directly:

```jsx
import { lazy } from 'refui'

const LazyFeature = lazy(() => import('./FeatureComponent.js'))

const App = () => (R) => (
	<div>
		<LazyFeature
			title="My Feature"
			fallback={() => <div>Loading feature...</div>}
			catch={({ error }) => (
				<div style="color: red; padding: 10px; border: 1px solid red;">
					<h3>Failed to load feature component</h3>
					<p>Error: {error.message}</p>
					<button on:click={() => window.location.reload()}>
						Retry
					</button>
				</div>
			)}
		/>
	</div>
)
```

#### Performance Considerations

The `lazy` helper preserves the current rendering context when loading components, ensuring that reactive signals and other context-dependent features work correctly. This makes it ideal for:

- **Code splitting**: Break large applications into smaller chunks
- **Conditional loading**: Load components only when certain conditions are met
- **Route-based loading**: Load page components as users navigate
- **Feature flags**: Dynamically load features based on user permissions

```jsx
import { lazy, signal, If } from 'refui'

const AdminPanel = lazy(() => import('./AdminPanel.js'))
const UserDashboard = lazy(() => import('./UserDashboard.js'))

const App = () => {
	const isAdmin = signal(false)
	const isLoading = signal(true)

	// Simulate auth check
	setTimeout(() => {
		isAdmin.value = Math.random() > 0.5 // Random admin status
		isLoading.value = false
	}, 1000)

	return (R) => (
		<div>
			<If condition={isLoading}>
				{() => <div>Checking permissions...</div>}
				{() => (
					<If condition={isAdmin}>
						{() => AdminPanel()}
						{() => UserDashboard()}
					</If>
				)}
			</If>
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
			{({ item }) => {
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

### Parse

Efficiently parses and renders text content using a custom parser function. The `Parse` component is optimized with built-in memoization, only re-parsing when the text or parser function changes.

**Props:**

-   `text`: A string or signal containing the text to parse.
-   `parser`: A function that takes `(text, R)` as arguments and returns a renderable node or an array of nodes. The renderer `R` is passed to enable the parser to create DOM elements.

The component automatically handles reactive updates when either the text content or parser function changes, making it ideal for dynamic content parsing scenarios.

```jsx
import { Parse } from 'refui/extras'
import { signal } from 'refui'

// Simple markdown-like parser example
const simpleMarkdownParser = (text, R) => {
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

// Code syntax highlighter parser
const codeParser = (code, R) => {
	// Simple syntax highlighting for keywords
	const keywords = ['function', 'const', 'let', 'var', 'if', 'else', 'return']
	let highlightedCode = code

	keywords.forEach(keyword => {
		const regex = new RegExp(`\\b${keyword}\\b`, 'g')
		highlightedCode = highlightedCode.replace(regex, `<span class="keyword">${keyword}</span>`)
	})

	return R.c('pre', { innerHTML: highlightedCode })
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

	return (R) => (
		<div>
			<h2>Parse Component Demo</h2>

			<div style="border: 1px solid #ccc; padding: 10px; margin: 10px 0;">
				<Parse text={markdownText} parser={currentParser} />
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

#### Advanced Usage: Custom HTML Parser

```jsx
import { Parse } from 'refui/extras'
import { signal } from 'refui'

// HTML-like parser that converts custom tags to components
const customHtmlParser = (text, R) => {
	// Convert [button:text] to actual button elements
	const buttonRegex = /\[button:(.*?)\]/g
	const linkRegex = /\[link:(.*?)\|(.*?)\]/g

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

const CustomHtmlDemo = () => {
	const content = signal(`
		Welcome to our site!

		[button:Click Me]

		Visit our [link:https://example.com|homepage] for more info.

		[button:Another Button]
	`)

	return (R) => (
		<div>
			<h3>Custom HTML Parser</h3>
			<Parse text={content} parser={customHtmlParser} />

			<textarea
				rows="6"
				cols="60"
				value={content}
				on:input={(e) => content.value = e.target.value}
				placeholder="Try editing: [button:Text] or [link:url|text]"
			/>
		</div>
	)
}
```

#### Performance Benefits

The `Parse` component includes automatic memoization that prevents unnecessary re-parsing:

```jsx
import { Parse } from 'refui/extras'
import { signal } from 'refui'

const expensiveParser = (text, R) => {
	console.log('Parser called!') // This will only log when text or parser changes

	// Simulate expensive parsing operation
	const words = text.split(' ')
	return words.map((word, index) =>
		R.c('span', {
			key: index,
			style: `color: hsl(${index * 30}, 70%, 50%);`
		}, word + ' ')
	)
}

const PerformanceDemo = () => {
	const text = signal('Hello world this is a test')
	const counter = signal(0)

	// This counter update won't trigger re-parsing
	setInterval(() => counter.value++, 1000)

	return (R) => (
		<div>
			<p>Counter (doesn't affect parsing): {counter}</p>
			<Parse text={text} parser={expensiveParser} />
			<input
				value={text}
				on:input={(e) => text.value = e.target.value}
				placeholder="Only changing this text will trigger re-parsing"
			/>
		</div>
	)
}
```

**Note:** The parser function should return renderable content that can be handled by the renderer. This can be DOM elements created with `R.c()`, text nodes, or arrays of such elements.
