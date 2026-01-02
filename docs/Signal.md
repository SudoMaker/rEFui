# Signals

Signals are the fundamental building blocks for rEFui. It is a lightweight, reactive signal system for building reactive applications. Signals provide a way to create reactive data that automatically updates dependent computations when the underlying data changes.

Signals can be used without rEFui by importing directly from `refui/signal`.

## Table of Contents

- [Core Concepts](#core-concepts)
- [Important Notice](#important-notice)
- [Basic Usage](#basic-usage)
- [API Reference](#api-reference)
- [Advanced Features](#advanced-features)
- [Best Practices](#best-practices)

## Core Concepts

### Signals
Signals are reactive containers for values that can notify observers when they change. They form the foundation of the reactive system.

### Effects
Effects are functions that automatically re-run when their dependencies (signals) change.

### Computations
Computed signals derive their value from other signals and automatically update when dependencies change.

## Important notice
Signal effects are semi-lazily computed, that means, no matter how many times you changed the value of a signal, its effects will only be executed once at the end of this tick. So if you modifred a signal's value and want to retrieve its updated derived signals value, you'll need to use `nextTick(cb)` or `await nextTick()` to get the new value. The lower-level `tick()` API exists to manually trigger a flush; prefer `nextTick` when you need to await the scheduler rather than calling `tick()` directly.

## Basic Usage

### Creating Signals

```javascript
import { signal } from 'refui/signal'

// Create a signal with an initial value
const count = signal(0)

// Get the current value
console.log(count.value) // 0

// Update the value
count.value = 5
console.log(count.value) // 5
```

### Creating Computed Signals

```javascript
import { signal, computed, nextTick } from 'refui/signal'

const count = signal(0)
const doubled = computed(() => count.value * 2)

console.log(doubled.value) // 0
count.value = 5

nextTick(() => {
		console.log(doubled.value) // 10
})
```

### Effects

```javascript
import { signal, watch } from 'refui/signal'

const count = signal(0)

// Watch for changes
const dispose = watch(() => {
	console.log('Count changed:', count.value)
})

count.value = 1 // Logs: "Count changed: 1"

nextTick(() => {
	count.value = 2 // Logs: "Count changed: 2"
})

// Clean up the effect
dispose()
```

## API Reference

### Core Functions

#### `signal(value, compute?)`
Creates a new signal.

- `value`: Initial value or source signal
- `compute`: Optional computation function for derived signals
- Returns: Signal instance

```javascript
const count = signal(0)
const derived = signal(count, (val) => val * 2)
```

#### `computed(fn)`
Creates a computed signal that derives its value from other signals.

- `fn`: Function that computes the value
- Returns: Computed signal

```javascript
const fullName = computed(() => `${firstName.value} ${lastName.value}`)
```

#### `isSignal(value)`
Checks if a value is a signal.

- `value`: Value to check
- Returns: Boolean

```javascript
console.log(isSignal(count)) // true
console.log(isSignal(42)) // false
```

#### `signal.ensure(value)` / `Signal.ensure(value)`
Ensures a value is a signal. If the value is already a signal, it returns the signal unchanged. If not, it creates a new signal with that value.

- `value`: Value to ensure as a signal
- Returns: Signal

```javascript
const existingSignal = signal(42)
const newSignal = signal(100)

const ensured1 = signal.ensure(existingSignal) // Returns the same signal
const ensured2 = signal.ensure(50) // Creates a new signal(50)
const ensured3 = signal.ensure('hello') // Creates a new signal('hello')

console.log(ensured1 === existingSignal) // true
console.log(isSignal(ensured2)) // true
```

#### `signal.ensureAll(...values)` / `Signal.ensureAll(...values)`
Applies `signal.ensure()` to multiple values, returning an array of signals.

- `...values`: Values to ensure as signals
- Returns: Array of signals

```javascript
const mixed = [signal(1), 2, signal(3), 4]
const allSignals = signal.ensureAll(...mixed)
// Returns: [signal(1), signal(2), signal(3), signal(4)]
```

### Signal Instance Methods

#### `.get()`
Gets the current value and registers the calling effect as a dependency.

```javascript
const value = mySignal.get()
```

#### `.set(value)`
Sets a new value for the signal.

```javascript
mySignal.set(42)
```

#### `.peek()`
Gets the current value without registering dependencies.

```javascript
const value = mySignal.peek()
```

#### `.poke(value)`
Sets a value without triggering updates.

```javascript
mySignal.poke(42)
```

#### `.trigger()`
Manually triggers updates for all connected effects.

```javascript
mySignal.trigger()
```

#### `.refresh()`
Re-evaluates a computed signal's computation function and updates the signal if the result has changed. This method only works on computed signals (signals created with a computation function). For regular signals, this method has no effect.

This is useful when you need to manually force a computed signal to re-evaluate its computation, for example when external dependencies that aren't tracked by the signal system may have changed.

```javascript
const count = signal(0)
const doubled = computed(() => count.value * 2)

// Manually refresh the computed signal
doubled.refresh()

// Example with external dependency
let externalValue = 10
const computed = signal(null, () => count.value + externalValue)

// Later, when externalValue changes outside the signal system
externalValue = 20
computed.refresh() // Force re-evaluation with new externalValue
```

#### `.connect(effect, runImmediate = true)`
Manually connects an effect to the signal.

- `effect`: The effect function to connect
- `runImmediate`: Whether to run the effect immediately (default: true)

```javascript
mySignal.connect(() => console.log('Signal changed'))

// Connect without running immediately
mySignal.connect(() => console.log('Signal changed'), false)
```

#### `.touch()`
Subscribes the current effect to this signal without reading its value. This is useful when you want to trigger an effect when a signal changes, but you don't need its value inside the effect.

```javascript
mySignal.touch()
```

### Signal Properties

#### `.value`
Getter/setter for the signal's value.

```javascript
mySignal.value = 42
console.log(mySignal.value)
```

#### `.connected`
Boolean indicating if the signal has any connected effects.

```javascript
console.log(mySignal.connected) // true/false
```

#### `.hasValue()`
Checks if the signal has a non-nullish value (not `undefined` or `null`).

```javascript
const name = signal('John')
const empty = signal(null)

console.log(name.hasValue()) // Should return true
console.log(empty.hasValue()) // Should return false
```

#### `.nullishThen(value)`
Returns a new signal that provides a fallback value when the current signal is nullish (`undefined` or `null`). This is similar to the nullish coalescing operator (`??`) but for signals.

```javascript
const username = signal(null)
const defaultName = username.nullishThen('Anonymous')

console.log(defaultName.value) // 'Anonymous'

username.value = 'Alice'
// defaultName will reactively update to 'Alice'

username.value = undefined
// defaultName will reactively update back to 'Anonymous'
```

#### `.choose(trueValue, falseValue)`
Creates a derived signal that resolves to `trueValue` when the source signal is truthy and `falseValue` otherwise.

- `trueValue` and `falseValue` can be plain values, signals, or functions.
- The chosen branch is evaluated lazily when the derived signal is read, so expensive computations only run for the active branch.

```javascript
const isDarkMode = signal(false)
const themeAsset = isDarkMode.choose('dark.css', 'light.css')

console.log(themeAsset.value) // 'light.css'

isDarkMode.value = true
nextTick(() => {
	console.log(themeAsset.value) // 'dark.css'
})
```

### Signal Operations

Signals support various comparison and logical operations:

#### `.inverse()`
Returns a signal that negates the current signal's value.

```javascript
const isEnabled = signal(true)
const isDisabled = isEnabled.inverse() // !isEnabled.value
```

#### `.and(value)`, `.or(value)`
Basic logical operations.

```javascript
const isPositive = count.gt(0)
const isValid = isPositive.and(isEnabled)
const hasValueOrDefault = value.or(defaultValue)
```

#### `.andNot(value)`, `.orNot(value)`
Logical operations with negated second operand.

```javascript
const isPositiveAndNotZero = count.andNot(count.eq(0)) // count > 0 && !(count === 0)
const isValidOrNotDisabled = isValid.orNot(isDisabled) // isValid || !isDisabled
```

#### `.andOr(andValue, orValue)`
Combines logical AND and OR in a single helper.

- When the source signal resolves to a truthy value, the derived signal resolves to `andValue`.
- When the source signal is falsy, the derived signal resolves to `orValue`.
- Both arguments can be plain values or signals. They are only read when their branch is chosen.

```javascript
const isAuthenticated = signal(false)
const userDisplay = signal('Guest')
const fallbackName = 'Anonymous'

const currentUser = isAuthenticated.andOr(userDisplay, fallbackName)

console.log(currentUser.value) // 'Anonymous'

isAuthenticated.value = true
nextTick(() => {
	console.log(currentUser.value) // 'Guest'
})
```

#### `.inverseAnd(value)`, `.inverseOr(value)`
Logical operations with negated first operand (the signal itself).

```javascript
const isInactiveAndVisible = isActive.inverseAnd(isVisible) // !isActive && isVisible
const isInactiveOrVisible = isActive.inverseOr(isVisible) // !isActive || isVisible
```

#### `.inverseAndNot(value)`, `.inverseOrNot(value)`
Logical operations with both operands negated.

```javascript
const isInactiveAndHidden = isActive.inverseAndNot(isVisible) // !isActive && !isVisible
const isInactiveOrHidden = isActive.inverseOrNot(isVisible) // !isActive || !isVisible
```

#### `.inverseAndOr(andValue, orValue)`
Variant of `.andOr` that negates the base signal before evaluating branches.

- When the source signal is falsy, the derived signal resolves to `andValue`.
- When the source signal is truthy, the derived signal resolves to `orValue`.

```javascript
const isOffline = signal(true)
const reconnectHint = 'Tap to reconnect'
const onlineMessage = signal('You are online')

const bannerText = isOffline.inverseAndOr(reconnectHint, onlineMessage)

console.log(bannerText.value) // 'Tap to reconnect'

isOffline.value = false
nextTick(() => {
	console.log(bannerText.value) // 'You are online'
})
```

#### `.select(options)`
Creates a derived signal that treats the current value as a lookup key inside `options`.

- `options` may be a plain object, an array, or a signal that resolves to any of those. Passing a `Map` is not supported.
- When the key is missing, the derived signal resolves to `undefined`.

```javascript
const status = signal('idle')
const messages = signal({
	idle: 'Waiting…',
	success: 'All good!',
	error: 'Something went wrong!'
})

const statusMessage = status.select(messages)

console.log(statusMessage.value) // 'Waiting…'

status.value = 'success'
nextTick(() => {
	console.log(statusMessage.value) // 'All good!'
})

messages.value = { idle: 'Ready when you are!' }
nextTick(() => {
	console.log(statusMessage.value) // undefined
})
```

#### `.eq(value)`, `.neq(value)`
Equality comparisons.

```javascript
const isZero = count.eq(0)
const isNotZero = count.neq(0)
```

#### `.gt(value)`, `.lt(value)`, `.gte(value)`, `.lte(value)`
Numeric comparisons.

```javascript
const isPositive = count.gt(0)
const isNegative = count.lt(0)
const isNonNegative = count.gte(0)
const isNonPositive = count.lte(0)
```

### Utility Functions

#### `read(value)`
Reads a value, safe for the value to be a signal or not.

```javascript
const result = read(someValue) // Works with signals or regular values
```

#### `peek(value)`
Peeks at a value without creating dependencies.

```javascript
const result = peek(someSignal)
```

#### `write(signal, newValue)`
Writes to a signal or applies a function. Has no effect if the value to be written is not a signal.

```javascript
write(count, 42)
write(count, prev => prev + 1)
```

#### `readAll(...values)`
Reads all values and return an array of plain values.

```javascript
const [val1, val2] = readAll(signal1, signal2)
```

#### `poke(signal, newValue)`
Pokes a value into a signal, same as `signal.poke(newValue)`. Has no effect if the value to be written is not a signal.

```javascript
poke(count, 42)
```

#### `touch(...values)`
Touches a list of signals to register a dependency. Has no effect if the value is not a signal.

```javascript
touch(someValue, someOtherValue) // Works with signals or regular values
```

### Effect Management

#### `watch(effect)`
Creates an effect that runs when dependencies change.

- `effect`: Function to run
- Returns: Dispose function
- Behavior: `watch` runs the effect immediately once and then again whenever any tracked signal changes. There is no `runImmediate` flag—if you need to defer the first execution, wire the effect manually with `connect([signal], effect, false)` and call the effect yourself at the appropriate time.

```javascript
const dispose = watch(() => {
	console.log('Value:', mySignal.value)
})
```

#### `connect(signals, effect, runImmediate = true)`
Connects multiple signals to an effect.

- `signals`: Array of signals to connect to
- `effect`: The effect function to connect
- `runImmediate`: Whether to run the effect immediately (default: true)

```javascript
connect([signal1, signal2], () => {
	console.log('Signals changed')
})

// Connect without running immediately
connect([signal1, signal2], () => {
	console.log('Signals changed')
}, false)
```

#### `bind(handler, value)`
Binds a handler to a value (signal, function, or static value).

```javascript
bind(console.log, mySignal)
```

#### `listen(signals, callback)`
Listens to multiple signals with a single callback.

```javascript
listen([signal1, signal2], () => {
	console.log('One of the signals changed')
})
```

#### `useAction(value?, compute?)`
Creates an action system with an event handler and trigger function. This is useful for setting up lightweight event buses or responding to imperative notifications without wiring an external emitter.

- `value`: Initial value for the internal signal
- `compute`: Optional computation function that derives the stored value before listeners run
- Returns: `[onAction, trigger, touch]`
	- `onAction(listener)` registers a callback bound to the current reactive scope. Do **not** call `onAction` from inside reactive effects or loops—each call adds another listener that will fire on every trigger. If you need to ignore future events, gate inside the callback or dispose the surrounding scope.
	- `trigger(nextValue?)` updates the internal signal and synchronously notifies every registered listener. Like other signal updates, multiple triggers within the same tick are batched and delivered once using the latest value.
	- `touch()` exposes the underlying signal's `.touch()` helper. It does **not** deliver payloads; call it inside an effect when you want that effect to re-run (and therefore inspect shared state) whenever the action fires. The cleanup returned by `watch`/`useEffect` removes the subscription.

```javascript
import { useAction, useEffect } from 'refui'

const [onSubmit, triggerSubmit, touchSubmit] = useAction({ status: 'idle' })

let ignoreUpdates = false
onSubmit((payload) => {
	if (ignoreUpdates) return
	console.log('Action payload:', payload)
})

// Batch safe: only the last trigger inside a tick notifies listeners
triggerSubmit({ status: 'loading' })
triggerSubmit({ status: 'done' })

// Mark an effect as interested in future triggers without re-registering listeners
useEffect(() => {
	touchSubmit()
	console.log('submit changed')
	return () => {
		// scope disposal automatically unregisters listeners added above
	}
})

ignoreUpdates = true // guard future callbacks without adding/removing listeners
```

Avoid overusing `useAction`; the built-in signal graph already covers most reactive flows. Reach for actions only when you need an imperative bridge and keep the listener graph shallow to maintain predictability.

### Advanced Signal Operations

#### `merge(signals, handler)`
Merges multiple signals into a computed signal.

```javascript
const fullName = merge([firstName, lastName], (first, last) => `${first} ${last}`)
```

#### `tpl(raw, ...expressions)`
Creates a template string signal using `String.raw`.

Use it as a tagged template literal most of the time. You can also pass a single raw string segment (no expressions) or a raw strings array generated programmatically (make sure the array has one more entry than the number of expressions).

```javascript
const message = tpl`Hello ${name}, you have ${count} items`
```

#### `createDefer(deferrer?)`
Creates a helper that defers an effect until the supplied `deferrer` fires. The returned function takes a callback that receives a `commit` setter; call `commit` to publish a value to the resulting signal. The callback may return a cleanup disposer to run before the next deferred execution.

- `deferrer`: Function invoked with the deferred callback; defaults to a cancellable wrapper around `nextTick` (so you can abort before it runs). **It must return a disposer function or nothing.** Browser APIs like `setTimeout`/`requestIdleCallback` return numeric/handle tokens, so wrap them:

```javascript
const idleDeferrer = (cb) => {
  const id = requestIdleCallback(cb)
  return () => cancelIdleCallback(id)
}
const timeoutDeferrer = (cb) => {
  const id = setTimeout(cb, 0)
  return () => clearTimeout(id)
}
```
- Returns: A function `(handler, onAbort?) => Signal` that defers `handler`. Inside `handler`, perform work and call `commit(finalValue)` to publish; optionally return a disposer to run before the next deferred run. The resulting signal starts as `undefined` until the first commit.

Dependency tracking mirrors `computed`: any signals you read synchronously inside the handler are tracked. Reads/triggers that happen later (after `await`/promise resolution) are **not** tracked unless you run them inside a frozen or captured context (`freeze`, `capture`, `snapshot`). This makes `createDefer` suitable for async data fetching: read your dependencies before the `await`, perform the async work, then `commit` the result when ready.

Common use: async data loading with dependency-aware caching

```javascript
import { createDefer, signal } from 'refui/signal'

const userId = signal('42')
const deferUser = createDefer((cb) => {
	const id = setTimeout(cb, 0) // wrap setTimeout so we can cancel if needed
	return () => clearTimeout(id)
})

const user = deferUser(async (commit) => {
	const id = userId.value // dependency tracked synchronously
	const res = await fetch(`/api/users/${id}`)
	commit(await res.json())
})
```

#### `deferred`
Preconfigured helper equivalent to `createDefer()` with the default cancellable nextTick-based deferrer. Use it when you just need basic async/timesliced work without custom scheduling.

```javascript
import { deferred } from 'refui/signal'

const user = deferred(async (commit) => {
	const res = await fetch('/api/me')
	commit(await res.json())
})
```

```javascript
import { createDefer, nextTick, signal } from 'refui/signal'

const defer = createDefer(requestIdleCallback)
const latest = defer((commit) => {
	const value = expensiveCompute()
	commit(value) // only when work is done, publish the final value
})

// Somewhere else
latest.value // last computed value after idle time
```

#### `createSchedule(deferrer, onAbort?)`
Aggregates writes and flushes them together after the provided `deferrer` runs. Great for timeslicing UI updates (e.g., idle callbacks or animation frames) while still producing a signal you can subscribe to.

- `deferrer`: Required scheduling function (same contract as `createDefer`): must call the callback later and return a disposer or nothing. Wrap timer/idle APIs so they return a disposer.
- `onAbort`: Optional hook that receives a cancellation handler invoked when the owning scope disposes.
- Returns: A function that accepts either a source signal or a function `(commit) => disposer`. It yields a signal whose value starts as `undefined` and updates only when the scheduled flush occurs.

> Tip: reuse the same wrapped deferrers you use with `createDefer`:
> ```javascript
> const idle = (cb) => {
>   const id = requestIdleCallback(cb)
>   return () => cancelIdleCallback(id)
> }
> ```

```javascript
import { createSchedule, signal } from 'refui/signal'

const idle = (cb) => {
	const id = requestIdleCallback(cb)
	return () => cancelIdleCallback(id)
}

const schedule = createSchedule(idle)
const source = signal(0)
const staged = schedule(source)

source.value = 1
source.value = 2
// During the idle window, staged.value is still 0
// After the idle flush, staged.value becomes 2
```

#### `derive(signal, key, compute?)`
Creates a derived signal from an object property. The derieved signal's content will be updated when the original signal changes, or when the original signal's corresponding property is a signal, when the specific signal changes. Writing the derived signal will not update the original signal's property.

```javascript
const name = derive(user, 'name')
```

#### `extract(signal, ...keys)`
Extracts properties from a signal into separate signals. The extracted signals' content will be updated only when the original signal changes. Writing the exteracted signals will not update the original signal's properties.

```javascript
const { name, age } = extract(user, 'name', 'age')
```

#### `derivedExtract(signal, ...keys)`
Similar to extract but creates derived signals.

```javascript
const { name, age } = derivedExtract(user, 'name', 'age')
```

#### `makeReactive(object)`
Creates a reactive proxy of an object.

```javascript
const reactive = makeReactive({
	count: signal(0),
	name: 'John'
})
```

### Conditional Logic

#### `onCondition(signal, compute?)`
Creates conditional matching based on signal values.

```javascript
const stateMatch = onCondition(state)
const isLoading = stateMatch('loading')
const isError = stateMatch('error')
```

### Lifecycle Management

#### `onDispose(callback)`
Registers a cleanup callback.

```javascript
onDispose(() => {
	console.log('Cleaning up')
})
```

#### `useEffect(effect, ...args)`
Registers an effect that runs automatically and handles its own cleanup. The `effect` function is executed immediately and re-executed whenever its signal dependencies change. Similar to `watch`, there is no option to skip the initial run—use `nextTick` or `connect` if you need to defer invocation.

If the `effect` function returns another function, that returned function will be used as a `cleanup` handler. The cleanup is called right before the effect re-runs, and also when the component/scope is disposed.

Any additional arguments passed to `useEffect` after the `effect` function will be passed along to the `effect` function when it's called.

- `effect`: The function to execute.
- `...args`: Optional arguments to pass to the effect function.
- Returns: A function to cancel the effect manually.


```javascript
// Example 1: Basic side effect with cleanup
const interval = signal(1000)
useEffect(() => {
	const timer = setInterval(() => {
		console.log('Timer tick')
	}, interval)

	// Cleanup function
	return () => {
		console.log('Clearing timer')
		clearInterval(timer)
	}
})

// Will stop the previous timer and restart a new timer with the interval 2000
interval.value = 2000

// Example 2: Effect with dependencies
const count = signal(0)
useEffect(() => {
	console.log(`The count is: ${count.value}`)

	// This effect has a dependency on `count`.
	// It will re-run whenever `count.value` changes.
})

// Example 3: Passing arguments to an effect
const name = signal('Alice')

function logName(user) {
		console.log(`Current user: ${user.value}`)
}

useEffect(logName, name)

// Later...
name.value = 'Bob' // Will trigger the effect and log "Current user: Bob"
```

#### `collectDisposers(disposers, fn, cleanup?)`
Collects disposers within a function scope. Used internally, do not use if you don't know how it works.

```javascript
const dispose = collectDisposers([], () => {
	// Create effects here
})
```

### Control Flow

#### `untrack(fn, ...args)`
Runs a function without tracking dependencies. Arguments are passed as-is to the fn.

```javascript
const result = untrack(() => {
	return someSignal.value // Won't create dependency
})
```

#### `freeze(fn)`
Locks in the current effect context for later use. The returned wrapper keeps referencing the original dependency graph—much like an `AsyncContext` scope—so any effects you create inside it attach to the cleanup bucket that existed at wrap time. If an effect was running when you called `freeze`, subsequent executions will tie freshly accessed signals back to that same effect. Once the owning scope is disposed, the wrapper still executes, but with its context cleared; new effects become inert and stop tracking changes within that scope.

```javascript
const runLater = freeze((message) => {
	console.log('Tracked with original context:', message.value)
})

setTimeout(() => {
	runLater('hello from the future')
}, 1000)
```

#### `contextValid`
Boolean flag that reflects whether the current reactive context (component, effect, or memoized scope) is still alive. It flips to `false` once the owner disposes, so deferred callbacks can bail out gracefully. Runtime features like async component boundaries check `contextValid` to avoid rendering after unmount.

### Scheduling

#### `tick()`
Triggers the next tick of the scheduler.

```javascript
tick().then(() => {
	console.log('Updates applied')
})
```

#### `nextTick(callback, ...args)`
Waits for the next tick and executes a callback after all pending signal updates and effects have been processed. Returns a Promise that resolves after the callback completes.

- `callback`: Function to execute after the tick completes
- `...args`: Optional arguments to pass to the callback function
- Returns: Promise that resolves after the callback executes

This is essential when you need to access updated computed signal values after making changes, since signal effects are processed asynchronously.

```javascript
const count = signal(0)
const doubled = computed(() => count.value * 2)

count.value = 5

// Without nextTick - might still see old value
console.log(doubled.value) // Could be 0 (old value)

// With nextTick - guaranteed to see updated value
nextTick(() => {
	console.log(doubled.value) // Will be 10 (updated value)
})

// With additional arguments
const logValue = (prefix, signal) => {
	console.log(prefix, signal.value)
}

nextTick(logValue, 'Doubled:', doubled)

// Can also be used with async/await
await nextTick(() => {
	console.log('All updates processed')
})
```

### Special Signal Behaviors
Signals have some special behaviors when used in certain contexts, thanks to `toJSON`, `Symbol.toPrimitive`, and `Symbol.iterator` implementations.

#### `JSON.stringify(signal)`
When a signal is stringified using `JSON.stringify`, it automatically returns its value by calling `.get()`.

```javascript
const data = signal({ a: 1 })
JSON.stringify({ data }) // '{"data":{"a":1}}'
```

#### Coercion
Signals can be automatically coerced to primitives, which calls `.get()`.

```javascript
const count = signal(5)
console.log(count + 5) // 10
console.log(`${count}`) // "5"
if (count) { /* ... */ } // true if count.value is truthy
```

#### Iteration
If a signal contains an iterable, it can be used in a `for...of` loop or with the spread syntax, which calls `.get()`.

```javascript
const items = signal([1, 2, 3])
for (const item of items) {
	console.log(item)
}
// 1
// 2
// 3

const spreadItems = [...items] // [1, 2, 3]
```

## Advanced Features

### Custom Effects

```javascript
const myEffect = () => {
	const value = mySignal.value
	console.log('Signal value:', value)
}

watch(myEffect)
```

### Batched Updates

Updates are automatically batched and applied asynchronously:

```javascript
count.value = 1
count.value = 2
count.value = 3
// Only triggers effects once with final value
```

## Best Practices

1. **Use computed signals for derived data**:
	 ```javascript
	 const fullName = computed(() => `${first.value} ${last.value}`)
	 ```

2. **Dispose of effects when no longer needed**:
	 ```javascript
	 const dispose = watch(() => {
		 // effect logic
	 })

	 // Later...
	 dispose()
	 ```

3. **Use `peek()` to avoid creating dependencies**:
	 ```javascript
	 const currentValue = mySignal.peek() // Doesn't create dependency
	 ```

4. **Batch related updates**:
	 ```javascript
	 // Updates are automatically batched
	 firstName.value = 'John'
	 lastName.value = 'Doe'
	 // fullName updates only once
	 ```

5. **Use `untrack()` for non-reactive operations**:
	 ```javascript
	 const result = untrack(() => {
		 // This won't create dependencies
		 return someSignal.value + otherSignal.value
	 })
	 ```

## Examples

### Counter Example

```javascript
import { signal, computed, watch } from 'refui/signal'

const count = signal(0)
const doubled = computed(() => count.value * 2)

watch(() => {
	console.log(`Count: ${count.value}, Doubled: ${doubled.value}`)
})

count.value = 5 // Logs: "Count: 5, Doubled: 10"
```

### Todo List Example

```javascript
const todos = signal([])
const filter = signal('all')

const filteredTodos = computed(() => {
	const todoList = todos.value
	const currentFilter = filter.value

	switch (currentFilter) {
		case 'active':
			return todoList.filter(todo => !todo.completed)
		case 'completed':
			return todoList.filter(todo => todo.completed)
		default:
			return todoList
	}
})

// Add todo
function addTodo(text) {
	todos.value = [...todos.value, { id: Date.now(), text, completed: false }]
}

// Toggle todo
function toggleTodo(id) {
	todos.value = todos.value.map(todo =>
		todo.id === id ? { ...todo, completed: !todo.completed } : todo
	)
}
```

This reactive signal system provides a powerful foundation for building reactive applications with automatic dependency tracking and efficient updates.
watch(() => {
	touchCounter()
})
