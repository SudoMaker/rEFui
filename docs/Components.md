# Components

rEFui provides a set of built-in components to handle common UI patterns like conditional rendering, loops, and asynchronous operations. These are the building blocks for creating dynamic and reactive user interfaces.

> **Note**: For detailed information about rEFui's reactive system and signals, see the [Signals documentation](Signal.md).

A core concept in rEFui is that a component ultimately behaves like a function that accepts `props` and `children`, and produces a render function. With the JSX **automatic runtime** together with the **Reflow** renderer (the default for most apps), you usually author components as plain JSX factories:

```jsx
const MyComponent = (props, ...children) => <div>Hello rEFui!</div>
```

Under the classic JSX transform or when you need direct access to the renderer object, you can spell out the render function explicitly:

```jsx
const MyComponent = (props, ...children) => (R) => <div>Hello rEFui!</div>
```

> **Note on JSX Runtimes**
>
> While rEFui supports different JSX transforms, the preferred approach for maximum flexibility is the **Classic Transform**. This pattern allows you to swap or wrap renderers on a per-component basis. But for generic usage, automatic transform can cover most scenarios. For a detailed guide on setting up both Classic and Automatic runtimes, see the [JSX Setup documentation](JSX.md). In this guide, we'll default to Automatic runtime for the ease of usage and alignment to most other JSX based frameworks like `React` and `Solid.js`.

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

### For

Renders a list of items from a signal that resolves to an array (or any value exposing the signal interface like `.value` and `.trigger()`). `For` is reactive to the list change itself, with a highly optimized reconcile algorithm that only executes the least necessary steps to update the list. Passing a plain array renders a static snapshot; updates and the imperative helpers require a reactive signal.

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

#### Exposed Methods

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

### Fn

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

#### Advanced Usage: `ctx` and `catch`

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

### Dynamic

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

### Async

Manages the lifecycle of asynchronous operations. It uses a render-prop pattern, where you provide components or functions as children to render different states (`pending`, `resolved`, `rejected`).

**Props:**

-   `future`: A promise or a function that returns a promise. The promise should resolve to a value.
-   `fallback`: (Optional) A component, function, or node to display while the promise is pending.
-   `catch`: (Optional) A handler for when the promise rejects.
-   `suspensed`: (Optional, default `true`) When `true` and no `fallback` is provided, the async task is accumulated into the nearest `<Suspense>` boundary. Set to `false` to render immediately without joining Suspense.
-   `onLoad`: (Optional) Runs before the resolved value is committed; can be `async`. Its return value is ignored—use it only for side effects or to await work that should finish before display.

Any other props passed to `<Async>` will be passed through to the `then`, `fallback`, and `catch` handlers.

**Children:**

`<Async>` expects children to be provided in a specific order to handle different states:

1.  **`then` (required):** The first child is a component or function that renders when the promise resolves successfully. It receives a `result` prop with the resolved value, along with any other props passed to `<Async>`.
2.  **`fallback` (optional):** The second child is a component or function to render while the promise is pending. It can also be provided via the `fallback` prop.
3.  **`catch` (optional):** The third child is a handler for when the promise rejects. It receives an `error` prop. It can also be provided via the `catch` prop.

> **Note:** If the parent component unmounts before the awaited promise settles, the runtime sets `contextValid` to `false`. In that case the async boundary skips rendering the resolved value, preventing work from running against a disposed instance.

#### Basic Usage with Functions

```jsx
import { Async } from 'refui';

const fetchMessage = () => new Promise(resolve => setTimeout(() => resolve('Data loaded!'), 1000));

const App = () => (
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

const SuccessComponent = ({ result, message }) => <p>{message}: {result}</p>;

const LoadingComponent = ({ message }) => <p>{message}</p>;

const ErrorComponent = ({ error }) => <p>Failed to load: {error.message}</p>;

const fetchUser = () => Promise.resolve('John Doe');

const App = () => (
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

### Suspense

Wraps one or more children and renders a fallback while any nested async work (including `<Async>` or async components) is still pending. It also supports an error handler and an optional `onLoad` hook that runs after all children resolve.

**Props:**

- `fallback`: Shown while pending (component/function/renderable or signal).
- `catch`: Error handler when any child rejects.
- `onLoad`: Called once when the initial batch resolves (can be `async`). Its return value is ignored; use it to block display until your work finishes (e.g., exit animations, logging).
- Additional props are forwarded to fallback/catch handlers.

**Children:** Renderables to show once resolved. If multiple children are provided, they resolve as a group.

**Behavior notes:**
- Async components that specify their own `fallback` render that fallback immediately and are **not** accumulated by the surrounding `<Suspense>`.
- `<Suspense>` coordinates the initial async work only; subsequent async loads triggered later inside the boundary will not be suspended automatically.
- When *not* using the Reflow renderer (e.g., custom renderer with classic JSX), wrap children in a function so they accumulate correctly inside `<Suspense>`. With Reflow or the default automatic JSX runtime, you can pass children directly.
- Suspense watches async components and `<Async>` boundaries; deferred/scheduled signals (`createDefer`/`createSchedule`) are not tracked and won't trigger the fallback.

```jsx
import { Suspense } from 'refui'

const Profile = ({ id }) => <Async future={fetch(`/api/user/${id}`).then((r) => r.json())}>{({ result }) => <p>{result.name}</p>}</Async>

const App = () => (
	<Suspense fallback={() => <p>Loading profile…</p>} catch={({ error }) => <p>Failed: {error.message}</p>}>
		<Profile id={42} />
	</Suspense>
)

// Using onLoad side-effects
(
<Suspense onLoad={() => console.log('all done')} fallback={() => <Spinner />}>
	<Async future={doWork()}>{({ result }) => <ResultView data={result} />}</Async>
</Suspense>
)

// Non-Reflow/custom renderer: wrap children to accumulate
(
<Suspense fallback={() => <p>Loading…</p>}>
	{() => <Async future={loadData()}>{({ result }) => <p>{result}</p>}</Async>}
</Suspense>
)

// Async component example: can be awaited directly
const UserCard = async ({ id }) => {
	const res = await fetch(`/api/users/${id}`)
	const user = await res.json()
	return () => <div>{user.name}</div>
}

(
<Suspense fallback={() => <p>Loading user…</p>}>
	<UserCard id={123} />
</Suspense>
)
```

### Transition

Swaps views with an async handoff. Provide a child render function that receives a `state` object; Transition wraps it in `Suspense`, manages pending/enter/leave flags, and blocks commit until `onLoad` finishes.

**Props:**
- `data`: Optional shared object passed into every `state.data`.
- `fallback`: Optional initial render before the first view commits.
- `loading`: Optional `Signal<boolean>` to mirror loading state (must be a signal if provided).
- `pending`: Optional `Signal<boolean>` to mirror pending swaps (must be a signal if provided).
- `catch`: Optional error handler for the inner suspense.
- `onLoad`: Optional async hook run before committing the new view; return value is ignored. Signature `(state, hasCurrent, swap) => void|Promise<void>`. Call `swap()` to commit manually.
- `name`: Optional display name (default `"Transition"`).

**Child (required):** `(state) => renderable`

`state` includes: `loading`, `pending`, `leaving`, `entered`, `entering`, and a shared `data` object.

**Note:** Additional props are *not* forwarded; everything you need is provided via `state`, `onLoad`, and the child render function.
**Note:** If `state.loading` is true when `onLoad` runs, Transition is still preparing the fallback render.

**Caveat:** `onLoad` runs before the pending view is committed. Calling `swap()` manually is optional—if you don’t call it, Transition commits automatically after `onLoad` returns.

```jsx
import { Transition, signal, lazy } from 'refui'

const ViewA = ({ viewRef, ...props }) => <div $ref={viewRef} {...props}>A</div>
const ViewB = ({ viewRef, ...props }) => <div $ref={viewRef} {...props}>B</div>
const LazyView = lazy(() => import('./LazyModule'))
const AsyncView = async ({ viewRef, ...props }) => {
	const data = await fetch('/api/data').then((r) => r.json())
	return <div $ref={viewRef} {...props}>{data.title}</div>
}

const current = signal(ViewA)
const pending = signal(false)
const loading = signal(false)
const transitionData = { viewName: 'page' }
const nextEl = signal(null)

const App = () => (
	<Transition
		pending={pending}
		loading={loading}
		data={transitionData}
		fallback={(state) => (
			<div
					class:entering={state.entering}
					class:leaving={state.leaving}
					class:entered={state.entered}
			>Loading...</div>
		)}
		onLoad={async (state, hasCurrent, swap) => {
			// If we have a previous view, await its exit animation
			if (hasCurrent) {
				await new Promise((r) => setTimeout(r, 200)) // simulate exit animation
			}
			// If we're still preparing fallback, skip entrance wiring
			if (state.loading.value) return

			// Commit manually (or integrate with View Transition API)
			const vt = document.startViewTransition?.(swap)
			if (vt) {
				await vt.updateCallbackDone
			} else {
				await swap()
			}

			// Mark entered when the enter animation ends
			setTimeout(() => state.entered.set(true), 200) // simulate enter animation done
		}}
	>
		{(state) => {
			const Next = current.value
			return (
				<Next
					class:entering={state.entering}
					class:leaving={state.leaving}
					class:entered={state.entered}
					class:pending={state.pending}
					style:viewTransitionName={state.data.viewName}
					viewRef={nextEl} // Next forwards viewRef -> DOM $ref
				/>
			)
		}}
	</Transition>
)

// Trigger swaps
current.value = ViewB
current.value = LazyView // works with lazy() components; pending toggles until resolve
current.value = AsyncView // also works with async components
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

	return <div>Hello, {user.name}</div>;
};

// Use <Fn> to re-create the component when the ID changes
const App = () => {
	const userId = signal(1);

	return (
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

	return (
		<article>
			<h2>{story.title}</h2>
			<p>By {story.author}</p>
		</article>
	);
};

// Usage with error handling
const StoryList = () => {
	const storyIds = signal([1, 2, 3, 4, 5]);

	return (
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

### memo

Provides component-scoped memoization for functions that should only run once during an instance's lifetime. Call `memo` inside a component to capture the current rendering context, then reuse the returned function to access the cached result without re-running the original logic.

**Parameters:**

- `fn`: A function that produces the value you want to cache. It is executed the first time the memoized wrapper runs.

**Returns:** A function that, when called, returns the cached result from the initial invocation.

#### Usage Notes

- The wrapped function runs at most once per parent function evaluation. Subsequent calls return the cached value.
- The captured context ensures that any signals read during the first execution are tracked correctly, and `onDispose` handlers registered inside `fn` are tied to the component lifecycle.
- Because the value never re-computes automatically, avoid reading reactive data inside `fn` if you expect it to change. Use signals or derived values outside of `memo` when you need updates.
- Call `memo` inline inside the component factory or inside the returned render function. Hoisting `memo` outside the component will capture the wrong context and break caching. If you prefer to prepare helpers up front, use the provided `useMemo` wrapper and invoke it inside the component.
- When the memoized value creates components or side effects, the cached instance stays reactive even if you temporarily detach it from the renderer. Cleanup registered inside `fn` is recorded on the captured context, so release references or trigger disposal when the instance is no longer needed.
- Once the owning component disposes, the memoized wrapper no longer has a live context; calling it after teardown behaves like an untracked function call.

Unlike React or Solid, `memo` here captures the current reactive context and defers execution until the returned function is actually run (for example when a conditional branch is selected). This allows inline usage inside JSX-style control flow without introducing dedicated hooks.

#### Inline Branching Example

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

#### `useMemo` Wrapper Example

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

### lazy

Creates a lazy-loaded component that can be dynamically imported and rendered. This is useful for code splitting and performance optimization, allowing components to be loaded only when needed while preserving the current rendering context.

The `lazy` function takes a loader function (typically a dynamic import) and an optional identifier to extract from the loaded value. The loader may resolve either to a component function or to a module-like object:

- If the resolved value is a function and no identifier is provided, that function is used directly as the component.
- Otherwise, `lazy` looks up `resolved[identifier ?? 'default']` on the loaded module and uses that export.

If the loader cannot produce a component (for example, the requested export is missing or resolves to `null`/`undefined`), the lazy wrapper rejects with a `SyntaxError`. You can handle this via the lazy component's `fallback`/`catch` props in the same way as other async components.

It returns a function that can be called with additional arguments to render the lazy component.

**Parameters:**

- `loader`: A function that returns a Promise resolving to the module/component
- `ident` (optional): The export key to extract from the loaded module (defaults to `'default'` when the loader returns a module object)

**Returns:** A function that can be called with additional arguments to render the lazy component

#### Basic Usage

```jsx
import { lazy, Fn } from 'refui'

// Create a lazy-loaded component
const LazyComponent = lazy(() => import('./MyComponent.js'))

// Use it in your application
const App = () => (
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

const App = () => (
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

	return (
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

const App = () => (
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

	return (
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

### Cached

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

### Portal

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

### defineCustomElement(name, component, options?)

Wrap a rEFui component as a Web Component. Call with a renderer context (`defineCustomElement.call(renderer, ...)`) or bind once (`const wc = defineCustomElement.bind(renderer)`).

- `name`: Custom element tag name.
- `component`: rEFui component template to render.
- `options`:
	- `mode`: Shadow DOM mode (`'open' | 'closed'`, default `'open'`).
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

### Parse

Efficiently parses and renders text content (or any structured source) using a custom parser function. The `Parse` component wires a parser into your component tree and memoizes the render boundary so that it only swaps when the parser function identity changes.

**Props:**

-   `source`: A value passed verbatim to your parser. It can be a string, a signal, or any other type your parser understands. When you pass a signal, call `read(source)` inside the returned render function to access its current value and opt into reactivity.
-   `parser`: Either a parser function, or a signal that resolves to a parser function. The parser is called as `parser({ source, onAppend }, ...children)` and should return a render function (or any other renderable shape). When `parser` is a signal, `Parse` memoizes the underlying render function and only recreates it when the signal's value changes.
-   `expose` (optional): A callback that receives an object with an `append` function. The parser can call `onAppend(append)` to register an `append` handler; `Parse` will then expose that handler to the parent via `expose({ append })`. This is useful for incremental or streaming parsing, where the parent pushes new chunks into the parser over time.

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
			const regex = new RegExp(`\\b${keyword}\\b`, 'g')
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

#### Advanced Usage: Custom HTML Parser

```jsx
import { Parse } from 'refui/extras'
import { signal, read } from 'refui'

// HTML-like parser that converts custom tags to components
const customHtmlParser = ({ source }) => {
	return (R) => {
		const text = read(source)

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
import { signal, read } from 'refui'

const expensiveParser = ({ source }) => {
	return (R) => {
		const text = read(source)

		console.log('Parser called!') // This will only log when `text` changes

		// Simulate expensive parsing operation
		const words = text.split(' ')
		return words.map((word, index) =>
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

#### Streaming / incremental parsing with `expose` and `onAppend`

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

## Hot Module Replacement

rEFui supports HMR via the refurbish plugin. This preserves component state during edits and avoids manual boilerplate.

Vite setup:

```js
// vite.config.js
import { defineConfig } from 'vite'
import refurbish from 'refurbish/vite'

export default defineConfig({
	plugins: [refurbish()],
	esbuild: { jsxFactory: 'R.c', jsxFragment: 'R.f' }
})
```

Tips:
- Use `$ref` to access component instances during dev/HMR; wrappers can change return values from `createComponent()`/`renderer.render()`.
- Use the return value mainly for `dispose(instance)` when you render manually.
- See refurbish docs for webpack and advanced options.
