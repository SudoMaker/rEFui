## Browser

- [Source](src/presets/browser.js)

Presets for browsers, with pre-defined tag namespaces (especially for SVG) and several preset attributes.

Use with DOM renderer.

### Usage
```js
import { createDOMRenderer } from 'refui/dom'
import { defaults } from 'refui/browser'

export const renderer = createDOMRenderer(defaults)
```

### Directives

The browser preset includes `style:` and `class:` directives for convenience.

#### `style:`
Allows setting individual CSS properties directly as props.

```jsx
const MyComponent = () => (R) => (
	<div style:color="red" style:fontSize="16px">
		This text will be red.
	</div>
);
```

#### `class:`
Toggles a CSS class based on a boolean value, which is useful for reactive states.

```jsx
import { signal } from 'refui';

const MyComponent = () => {
	const isActive = signal(false);

	return (R) => (
		<>
			<button on:click={() => (isActive.value = !isActive.value)}>
				Toggle Active
			</button>
			<div class:active={isActive}>
				This div's "active" class is toggled by the button.
			</div>
		</>
	);
};
```
