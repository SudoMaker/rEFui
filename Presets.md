## Browser

- [Source](src/presets/browser.js)

Presets for browsers, with pre-defined tag namespaces (especially for SVG) and several preset attributes.

Use with DOM renderer.

### Usage
```js
import { createDOMRenderer } from 'refui/dom'
import { defaults } from 'refui/browser'

export default const Renderer = createDOMRenderer(defaults)
```
