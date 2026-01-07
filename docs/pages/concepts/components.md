---
title: Components
description: Understanding rEFui's component model.
weight: 21
---

# Components

In rEFui, a component is a function that returns another function (the "render function"). This unique structure allows for maximum flexibility, especially with different renderers. When you use the JSX **automatic runtime** together with the **Reflow** renderer (the default for most apps), you usually author components as plain JSX factories:

```jsx
const MyComponent = (props, ...children) => <div>Hello rEFui!</div>
```

Under the classic JSX transform or when you need direct access to the renderer object, you can spell out the render function explicitly:

```jsx
const MyComponent = (props, ...children) => (R) => <div>Hello rEFui!</div>
```

> **Note on JSX Runtimes**
>
> While rEFui supports different JSX transforms, the preferred approach for maximum flexibility is the **Classic Transform**. This pattern allows you to swap or wrap renderers on a per-component basis. But for generic usage, automatic transform can cover most scenarios. For a detailed guide on setting up both Classic and Automatic runtimes, see the [JSX Setup documentation](../guides/jsx-setup.md). In this guide, we'll default to Automatic runtime for the ease of usage and alignment to most other JSX based frameworks like `React` and `Solid.js`.

rEFui provides a set of built-in components to handle common UI patterns like conditional rendering, loops, and asynchronous operations.

- [Basic Components](../reference/components/basic.md) (`If`, `For`, `Fn`, `Dynamic`, `Render`, `memo`)
- [Async Components](../reference/components/async.md) (`Async`, `Suspense`, `Transition`, `lazy`)
- [Extra Components](../reference/components/extras.md) (`UnKeyed`, `Cached`, `Portal`, `Parse`, `defineCustomElement`)