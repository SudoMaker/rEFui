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
Signal effects are semi-lazily computed, that means, no matter how many times you changed the value of a signal, its effects will only be executed once at the end of this tick. So if you modifred a signal's value and want to retrieve its updated derived signals value, you'll need to use `nextTick(cb)` or `await tick()` to get the new value.

## Basic Usage

### Creating Signals

```javascript
import { signal } from './signal.js'

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
import { signal, computed, nextTick } from './signal.js'

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
import { signal, watch } from './signal.js'

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

#### `.connect(effect)`
Manually connects an effect to the signal.

```javascript
mySignal.connect(() => console.log('Signal changed'))
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

#### `.eq(value)`, `.neq(value)`
Equality comparisons.

```javascript
const isZero = count.eq(0)
const isNotZero = count.neq(0)
```

#### `.gt(value)`, `.lt(value)`
Numeric comparisons.

```javascript
const isPositive = count.gt(0)
const isNegative = count.lt(0)
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

```javascript
const dispose = watch(() => {
	console.log('Value:', mySignal.value)
})
```

#### `connect(signals, effect)`
Connects multiple signals to an effect.

```javascript
connect([signal1, signal2], () => {
	console.log('Signals changed')
})
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

### Advanced Signal Operations

#### `merge(signals, handler)`
Merges multiple signals into a computed signal.

```javascript
const fullName = merge([firstName, lastName], (first, last) => `${first} ${last}`)
```

#### `tpl(strings, ...expressions)`
Creates a template string signal.

```javascript
const message = tpl`Hello ${name}, you have ${count} items`
```

#### `not(value)`
Creates a signal that negates the input value. Works with both signals and static values.

```javascript
const isEnabled = signal(true)
const isDisabled = not(isEnabled) // Creates a signal that returns !isEnabled.value

const alwaysFalse = not(true) // Creates a signal that always returns false
const isDifferent = not(value.eq(expectedValue)) // Negates a comparison
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
Registers an effect that runs automatically and handles its own cleanup. The `effect` function is executed immediately and re-executed whenever its signal dependencies change.

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

#### `untrack(fn)`
Runs a function without tracking dependencies.

```javascript
const result = untrack(() => {
	return someSignal.value // Won't create dependency
})
```

#### `freeze(fn)`
Freezes the current effect context for a function.

```javascript
const frozenFn = freeze(myFunction)
```

### Scheduling

#### `tick()`
Triggers the next tick of the scheduler.

```javascript
tick().then(() => {
	console.log('Updates applied')
})
```

#### `nextTick(callback?)`
Waits for the next tick.

```javascript
nextTick(() => {
	console.log('Next tick')
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
import { signal, computed, watch } from './signal.js'

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
