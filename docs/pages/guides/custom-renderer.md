---
title: Custom Renderers
description: Guide to implementing renderers for novel platforms.
weight: 33
---

# Custom Renderers

Build rEFui renderers for novel platforms: map your platform’s primitives to the small `nodeOps` interface and let signals drive updates. Prefer reusing a DOM shim (`undom-ng`) when possible; write a renderer only when you need platform-specific behavior. If your platform already exposes a DOM-like API, you can often reuse `createDOMRenderer` with a custom `doc`.

## When to write one
- Your platform exposes node-like handles but no DOM (e.g., terminal UI, canvas scene graph, native UI toolkit).
- You need custom prop/event normalization or lifecycle hooks that differ from the DOM renderer.

## If you already have a DOM-like API
- Supply a `doc` that implements `createElement`, `createElementNS`, `createTextNode`, `createComment`, `createDocumentFragment`, and event methods.
- Call `createDOMRenderer({ doc, rendererID, namespaces, tagNamespaceMap, tagAliases, propAliases, onDirective, macros })`.
- You inherit the DOM renderer’s behavior: signal-aware text nodes/props, event normalization (passive/once fallbacks), namespaces, aliases, and macros.

## Minimal interface (`nodeOps`)
Implement these methods and pass them to `createRenderer(nodeOps)`:

- `isNode(value): boolean`
- `createNode(tag): Node`
- `createTextNode(text): Node`
- `createAnchor(name?): Node` (used for comment/placeholder anchors)
- `createFragment(name?): Fragment` (can be a lightweight grouping/anchor)
- `isFragment(value): boolean`
- `expandFragment(fragment): Array<Node | Fragment>` flatten a connected fragment into anchor + children + anchor; see built-in renderer for behavior
- `removeNode(node|fragment)`
- `appendNode(parent, ...children)`
- `insertBefore(node, ref)`
- `setProps(node|fragment, props: Record<string, unknown>)`

`setProps` is called with the full props object; make it idempotent. Normalize events, styles, and platform-specific attributes here. Clean up in `removeNode` when needed. When a prop value is a signal, subscribe and update the native prop/handler on change (see DOM/HTML renderers).

## Rendering flow
1) `const R = createRenderer(nodeOps)`  
2) `R.render(root, App)` or use JSX (classic: `jsxFactory: 'R.c'`, `jsxFragment: 'R.f'`; automatic: `jsxImportSource: 'refui'`).  
3) Signals drive retained updates; only touched nodes call `setProps`/append/remove.

## Fragments
If the platform lacks fragments, create an anchor node or manage an array of children; implement `isFragment` and `createFragment` accordingly. `appendNode`/`insertBefore` should handle fragments by flattening or delegating.

## Props and events
- Events: detect keys like `on:click` or normalize your own; attach/detach listeners in `setProps`.
- Styles: map objects/strings to platform styling APIs.
- Refs: `$ref` receives your node/handle; ensure it’s stable.
- Text/props reactivity: follow DOM/HTML renderers—subscribe when values are signals so text/content/props update automatically.

## Suggested structure
```js
import { createRenderer } from 'refui'

const nodeOps = {
	isNode: (n) => !!n && n.type === 'node',
	createNode: (tag) => platformCreate(tag),
	createTextNode(text) {
		// mirror DOM/HTML behavior: if text is a signal, subscribe
		if (isSignal(text)) {
			const n = platformCreateText('')
			text.connect(() => platformSetText(n, String(peek(text) ?? '')))
			return n
		}
		return platformCreateText(String(text ?? ''))
	},
	createAnchor: () => platformCreateComment(''),
	createFragment: () => platformCreateFragment(),
	removeNode: platformRemove,
	appendNode(parent, ...kids) { kids.forEach(k => platformAppend(parent, k)) },
	insertBefore(node, ref) { platformInsertBefore(node, ref) },
	setProps(node, props) { platformSetProps(node, props) },
	isFragment: (n) => n && n.type === 'fragment'
}

export const R = createRenderer(nodeOps)
```

## Prefer shims when available
- DOM-like APIs: [undom-ng](https://github.com/ClassicOldSong/undom-ng)
- NativeScript: [DOMiNATIVE](https://github.com/SudoMaker/nativescript-dom-ng)
- Embedded/desktop: Resonance runtime (LVGL/Dear ImGui) + undom-ng

## Debugging tips
- Log every `nodeOps` call initially (like the console renderer example) to verify ordering.
- Ensure `setProps` handles prop removal (unset handlers/styles).
- If updates don’t appear, check `isNode`/`isFragment` guards—they gate all tree ops.
