---
title: Scheduling API
description: Utilities for deferred execution and scheduling.
weight: 48
---

# Scheduling API

## Scheduling Helpers

### `createDefer(deferrer?)`

Creates a deferral wrapper around a reactive computation. Returns a function that accepts `(handler, onAbort?)` and produces a signal. The handler runs only after the deferrer fires; call `commit(finalValue)` inside the handler to publish the result. The handler may return a cleanup disposer for subsequent runs. The `deferrer` defaults to a cancellable wrapper around `nextTick`, but you can pass `requestIdleCallback`, `queueMicrotask`, or any function that invokes the provided callback later **as long as it returns a disposer (function)**—wrap timer/idle APIs that return handles:

```javascript
const idle = (cb) => {
  const id = requestIdleCallback(cb)
  return () => cancelIdleCallback(id)
}
```

Dependency tracking works like `computed`: dependencies are registered only from the synchronous part of `handler`. Any reads after `await`/promise resolution are not tracked unless executed inside a frozen/captured context (`freeze`, `capture`, `snapshot`). This makes `createDefer` fit for async fetches—grab dependencies up front, await work, then `commit` the result.

Typical async fetch pattern

```javascript
const loadUser = createDefer(idle)((commit) => {
	const id = userId.value      // track dependency synchronously
	return (async () => {
		const res = await fetch(`/api/users/${id}`)
		commit(await res.json())
	})()
})
```

### `deferred`

Prebuilt helper using the default cancellable nextTick deferrer. Equivalent to `createDefer()` when you don't need custom scheduling.

```javascript
import { deferred } from 'refui'

const me = deferred(async (commit) => {
	const res = await fetch('/api/me')
	commit(await res.json())
})
```

### `createSchedule(deferrer, onAbort?)`

Batches updates and flushes them together after the provided `deferrer` runs. Useful for timeslicing UI work or coalescing rapid signal writes. The `deferrer` must follow the same contract as `createDefer` (invoke the callback later and return a disposer), so wrap timer/idle APIs.

```javascript
import { createSchedule, signal } from 'refui'

const idle = (cb) => {
  const id = requestIdleCallback(cb)
  return () => cancelIdleCallback(id)
}

const stage = createSchedule(idle)
const src = signal(0)
const staged = stage(src)

src.value = 1
src.value = 2
// staged.value stays undefined (or its last flushed value) until the idle callback runs; then it becomes 2
```
