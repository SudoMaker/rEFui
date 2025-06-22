# HTML Renderer

The HTML renderer is designed for server-side rendering (SSR), allowing you to generate static HTML strings from your rEFui components. This is useful for improving initial page load performance and SEO.

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
	return (R) => (
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

## Key Differences from DOM Renderer

- **Output**: It produces an HTML string via the `serialize()` method, not live DOM nodes.
- **Event Handlers**: All event handlers (e.g., `on:click`) are ignored, as there is no interactive DOM environment on the server.
- **Self-Closing Tags**: Tags like `<input>`, `<br>`, and `<img>` are automatically rendered as self-closing. This is configurable during renderer creation.
- **HTML Escaping**: All text content and attribute values are automatically escaped to prevent XSS attacks.
