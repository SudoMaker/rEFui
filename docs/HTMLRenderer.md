# HTML Renderer

The HTML renderer is designed for server-side rendering (SSR), allowing you to generate static HTML strings from your rEFui components. This is useful for improving initial page load performance and SEO.

> **Note**: For detailed information about rEFui's reactive system and signals, see the [Signals documentation](Signal.md).

## Initial Setup

To get started, create an instance of the HTML renderer. Unlike the DOM renderer, it typically doesn't require any special presets, but you can configure options like `selfClosingTags`.

```javascript
import { createHTMLRenderer } from 'refui/html';

// Create the renderer
const renderer = createHTMLRenderer();
```

## Usage with JSX

Just like with the DOM renderer, you can use JSX with the HTML renderer. For detailed instructions on how to set up JSX, please see the [JSX Setup Guide](JSX.md). The recommended **Classic Transform** is fully supported.

## "Hello, World!" Example

Here is a complete example of rendering a component to an HTML string.

```jsx
import { createHTMLRenderer } from 'refui/html';
import { signal } from 'refui';

// 1. Create renderer
const renderer = createHTMLRenderer();

// 2. Define a component that accepts a renderer (R)
const App = () => {
	const name = signal('World');
	return (
		<>
			<h1>Hello, {name}!</h1>
			<p>This is rendered on the server.</p>
		</>
	);
}

// 3. Render the component to a variable
const rendered = renderer.createElement(App);

// 4. Serialize the output to an HTML string
const htmlString = renderer.serialize(rendered);

console.log(htmlString);
// Output: <h1>Hello, World!</h1><p>This is rendered on the server.</p>
```

## Server-Side Rendering with Dynamic Data

The HTML renderer works seamlessly with signals for server-side rendering:

```jsx
import { createHTMLRenderer } from 'refui/html';
import { signal, computed } from 'refui';

const renderer = createHTMLRenderer();

const UserProfile = ({ userId }) => {
	// These would typically be fetched from a database
	const user = signal({
		name: 'John Doe',
		email: 'john@example.com',
		posts: 42
	});

	const displayName = computed(() =>
		user.value.name || 'Anonymous User'
	);

	return (
		<div class="user-profile">
			<h1>{displayName}</h1>
			<p>Email: {user.value.email}</p>
			<p>Posts: {user.value.posts}</p>
		</div>
	);
};

// Render to HTML
const rendered = renderer.createElement(UserProfile, { userId: 123 });
const html = renderer.serialize(rendered);

console.log(html);
// Output: <div class="user-profile"><h1>John Doe</h1><p>Email: john@example.com</p><p>Posts: 42</p></div>
```

## Working with Lists and Conditional Rendering

```jsx
import { For, If } from 'refui';

const BlogPost = ({ title, content, published }) => (
	<article>
		<h2>{title}</h2>
		<If condition={published}>
			{() => <p>{content}</p>}
			{() => <p><em>This post is not yet published.</em></p>}
		</If>
	</article>
);

const BlogIndex = () => {
	const posts = signal([
		{ id: 1, title: 'First Post', content: 'Hello world!', published: true },
		{ id: 2, title: 'Draft Post', content: 'Work in progress...', published: false }
	]);

	return (
		<div>
			<h1>My Blog</h1>
			<For entries={posts} track="id">
				{({ item }) => (
					<BlogPost
						title={item.title}
						content={item.content}
						published={item.published}
					/>
				)}
			</For>
		</div>
	);
};
```

## Raw HTML (unsafe)

By default, the HTML renderer escapes text and attribute values. For trusted markup, use `renderer.rawHTML` to insert unescaped HTML. It accepts a tagged template literal and keeps embedded signals reactive.

```jsx
import { createHTMLRenderer } from 'refui/html';
import { signal, nextTick } from 'refui';

const renderer = createHTMLRenderer();
const content = signal('<strong>Hello</strong>');

const node = renderer.rawHTML`<div class="content">${content}</div>`;
await nextTick();

const html = renderer.serialize(node);
// Output: <div class="content"><strong>Hello</strong></div>
```

**Caveat (scripts):** If you render `<script>` content via normal JSX (e.g., `<script>{code}</script>`), the renderer will escape the content, producing unusable scripts after serialization. Use `rawHTML` when you need to emit script bodies as-is.

```jsx
import { createHTMLRenderer } from 'refui/html';
import { signal, nextTick } from 'refui';

const renderer = createHTMLRenderer();
const code = signal('console.log("hi")');

// JSX escapes script content
const escaped = renderer.createElement('script', null, code);
const escapedHtml = renderer.serialize(escaped);
// Output: <script>console.log(&quot;hi&quot;)</script>

// rawHTML emits the script body as-is
const raw = renderer.rawHTML`<script>${code}</script>`;
await nextTick();
const rawHtml = renderer.serialize(raw);
// Output: <script>console.log("hi")</script>
```

Only use `rawHTML` with trusted content. It does not escape markup and can introduce XSS if you pass untrusted strings. This includes injecting `<script>` tags—treat it as a direct HTML escape hatch.

## Key Differences from DOM Renderer

- **Output**: It produces an HTML string via the `serialize()` method, not live DOM nodes.
- **Event Handlers**: All event handlers (e.g., `on:click`) are ignored, as there is no interactive DOM environment on the server.
- **Self-Closing Tags**: Tags like `<input>`, `<br>`, and `<img>` are automatically rendered as self-closing. This is configurable during renderer creation.
- **HTML Escaping**: All text content and attribute values are automatically escaped to prevent XSS attacks.
- **Signal Handling**: Signals are evaluated once during rendering and their current values are included in the output HTML. No reactivity is maintained in the static output.

## Signal Evaluation in SSR

During server-side rendering, signals are resolved to their current values:

```jsx
import { signal, computed } from 'refui';

const ServerComponent = () => {
	const count = signal(42);
	const doubled = computed(() => count.value * 2);

	// These values are evaluated once during rendering
	return (
		<div>
			<p>Count: {count}</p>        {/* Renders as: Count: 42 */}
			<p>Doubled: {doubled}</p>    {/* Renders as: Doubled: 84 */}
		</div>
	);
};
```

The HTML output will contain the static values, not the reactive bindings. For client-side hydration, you would need to recreate the reactive state on the client.

**Note**: any changes made to an existing signal will only take effect after the current tick. Call `await nextTick()` (or `nextTick(callback)`) before serializing again to pick up the new value.
