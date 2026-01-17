# Overlays & Content: Portals, Parse, Custom Elements

Use this file when implementing: modals, popovers, toasts, tooltips, context menus, “render elsewhere in the DOM”, rich HTML rendering, or web components integration.

## 1) Portals / Teleport (“render this subtree somewhere else”)

Prefer rEFui’s portal primitive when:
- A subtree must visually/structurally live under `document.body` (or another mount) while logically owned by a component.
- You need correct disposal (unmount should remove portal content automatically).

Typical API shape:
- `createPortal()` from `refui/extras` returns `[Inlet, Outlet]` (names may differ by version).
  - Render `<Inlet>` where content is produced.
  - Render `<Outlet>` where content is consumed.

Practical patterns:
- App-level portal host: put `<Outlet>` near the end of `body`.
- Feature-level usage: keep `[Inlet, Outlet]` close to where the feature lives (so it’s easy to reason about disposal).

When portals aren’t available (or version mismatch):
- Fall back to a DOM macro (`m:*`) that appends/removes nodes in `document.body`, but keep it narrowly scoped and disposable.

## 2) Overlays (modal/popover/toast) best practices

- Prefer a dedicated component that controls:
  - visibility signal
  - focus management
  - escape key handling / click-outside
  - scroll locking
- Implement shared DOM behaviors via macros:
  - `m:focusTrap`, `m:clickOutside`, `m:scrollLock` (names are yours)
- Keep event listeners in `useEffect` with cleanup or macro handlers with cleanup.
- If you need “imperative handle” access to overlay internals, expose via `expose` callback prop (v0.8.0+ pattern).

## 3) Rich HTML rendering (trusted/untrusted)

### Parse component (browser DOM)

Prefer `Parse` (from `refui/extras/parse.js`, name/path may vary) when:
- You have trusted-ish HTML that must be turned into DOM nodes (e.g., sanitized content).
- You need to map/transform tags to rEFui nodes while keeping reactivity manageable.

Guidance:
- Treat it as an escape hatch; sanitize if content is user-controlled.
- Keep parsing outside hot paths; cache results when possible.

### HTML renderer raw HTML (SSR/SSG)

If you render to string (`refui/html`):
- Use `rawHTML` only for trusted content (it bypasses escaping; XSS risk).
- Remember that normal JSX inside `<script>` gets escaped; raw HTML is the correct tool when you truly need literal script bodies.

## 4) Custom Elements / Web Components

Prefer `defineCustomElement` (from `refui/extras` / extras module) when:
- You want to ship a component as a standards-based custom element.
- You need framework-agnostic embedding.

Guidance:
- Keep the element boundary small; treat it like a micro-app root.
- Keep external API as attributes/properties and events; internally map them to signals.

## When unsure

Use MCP to confirm the exact import paths and signatures for your rEFui version:
- Context7: query “createPortal”, “Portal component”, “Parse component”, “defineCustomElement”.

