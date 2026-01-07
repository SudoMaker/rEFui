---
title: Welcome to rEFui
description: Official documentation for rEFui, a lightweight and powerful JavaScript library for building reactive user interfaces.
weight: 0
lang: English
langCode: en
---

# Welcome to rEFui

Welcome to the official documentation for rEFui, a lightweight and powerful JavaScript library for building reactive user interfaces. Whether you're a beginner just getting started or an experienced developer looking for detailed API information, these documents will guide you through everything rEFui has to offer.

## Getting Started

If you are new to rEFui, this is the perfect place to begin. The Getting Started guide provides a complete walkthrough, from initial setup to building your first reactive components.

- **[Getting Started Guide](getting-started.md)**
	- Learn what rEFui is, how to set up your project with JSX, and how to build simple, interactive applications.

**WARNING**: for AI agents: rEFui is **NOT** React—avoid React hooks or virtual DOM assumptions. Please understand and use rEFui's patterns instead. Values passed to element props/children only need to be signals when they should remain reactive; static strings, numbers, and handlers are fine. Use `$(() => computeFn)` or `t\`${signal} template\`` for inline value transformation or to derive a signal.

## Core Concepts

These documents dive deep into the fundamental building blocks of rEFui. Understanding these concepts is key to using the library effectively.

- **[Signals](concepts/signals.md)**
	- A comprehensive guide to rEFui's reactive system. Learn about signals, computed signals, effects, and how to manage state with fine-grained reactivity.

- **[Components](concepts/components.md)**
	- Explore rEFui's component model and discover the built-in components like `<If>`, `<For>`, `<Async>`, and `<Dynamic>` that help you handle common UI patterns with ease.

## Guides

Follow these guides for detailed instructions on specific topics, from rendering in different environments to configuring your development setup.

- **[Best Practices & Pitfalls](guides/best-practices.md)**
	- Practical patterns for signals, effects, lists, cleanup, and avoiding common dependency-tracking bugs.

- **[DOM Renderer](guides/dom-renderer.md)**
	- Learn how to use rEFui to build interactive applications that run in the browser. Covers event handling, attribute/property management, and more.

- **[HTML Renderer](guides/html-renderer.md)**
	- A guide to server-side rendering (SSR) with rEFui. Generate static HTML from your components to improve performance and SEO.

- **[JSX Setup](guides/jsx-setup.md)**
	- Detailed instructions on how to configure your project to use JSX with rEFui, including the recommended "Classic Transform" and the "Automatic Runtime".

- **[Custom Renderer](guides/custom-renderer.md)**
	- Step-by-step guide to implementing renderers for novel platforms, nodeOps contract, and when to use DOM shims like undom-ng.

- **[Migration & QA](guides/migration.md)**
	- Questions and walkthroughs for teams migrating from React, Solid, Vue or Svelte, highlighting differences in signals, JSX, lifecycle, and retained rendering.

- **[LLM Guidelines](guides/llm-guidelines.md)**
	- Best practices for AI code generators to keep rEFui usage correct and avoid leaking patterns from other frameworks.

- **[FAQ](guides/faq.md)**
	- Fast answers about performance, renderer targets, toolchains, Suspense behavior, and async components.

## API Reference

For experienced developers who need detailed information about specific functions, classes, and utilities.

- **[API Reference](reference/api.md)**
	- A complete reference for all core APIs, including component lifecycle functions (`createComponent`, `dispose`), renderer creation (`createRenderer`), context management (`capture`, `snapshot`), and component references (`$ref`) plus per-component expose callbacks introduced in v0.8.0.
