## Basic Components

### If

Note: `else` prop has higher priority than the second branch

```jsx
import { If } from 'refui'

const App = ({ value }) => {
	return (R) => (
		<If condition={value} else={() => <span>Condition not met!</span>}>
			{/*if condition is truthy*/ () => <span>Condition met!</span>}
			{/*else*/ () => <span>Condition not met!</span>}
		</If>
	)
}
```

### For

```jsx
import { For } from 'refui'

const App = ({ iterable }) => {
	return (R) => (
		<For entries={iterable}>{(item) => <div>{item.name}</div>}</For>
		// name will not be changed if modified directly on item
	)
}
```

### Fn

Note: define return renderers outside of the `Fn` scope can reduce re-renders if condition doesn't change its matched result.

```jsx
import { Fn, read } from 'refui'

const App = ({ condition }) => {
	return (R) => (
		<Fn>
			{() => {
				switch (read(condition)) {
					case 123: {
						return () => <div>Condition: 123</div>
					}
					case 456: {
						return () => <div>Condition: 456</div>
					}
					default: {
						return () => <div>Nothing matched!<div>
					}
				}
			}}
		</Fn>
	)
}
```

### Dynamic

Just like any ordinary components but the component itself is a variable/signal

```jsx
import { signal, Dynamic } from 'refui'

const App = () => {
	const currentComponent = signal('button')
	return (R) => (
		<Dynamic
			is={currentComponent}
			on:click={(e) => {
				if (currentComponent.value === 'button') {
					currentComponent.value = 'div'
					return
				}
				currentComponent.value = 'button'
			}}
		>
			Click to change tag!
		</Dynamic>
	)
}
```

### Async

Just like any ordinary components but the component is asynchronous

```jsx
const AsyncComponent = async ({ apiPath }) => {
	const resp = await fetch(apiPath)
	const result = await resp.text()

	return (R) => (
		<div>{result}</div>
	)
}
```

Async components accepts an extra param: `fallback`, which is a render method or a rendered result to be displayed when the component itself isn't ready. Alternativelly, you can use `Async` as a dedicated component:

```jsx
import { Async } from 'refui'
import { AsyncComponent } from './async-component.js'

const App = () => {
	const currentComponent = signal('button')
	return (R) => (
		<AsyncComponent apiPath="some/api" fallback={<div>Loading...</div>} />
	)
}

const AppAlternative = () => {
	const currentComponent = signal('button')
	return (R) => (
		<Async future={AsyncComponent('some/api')} fallback={() => <div>Loading...</div>} />
	)
}
```

## Extra Components

Extra components are located in the `refui/extras` path.

### UnKeyed

Same as `For`, but the prop itself is a signal.

```jsx
import { UnKeyed } from 'refui/extras'
// or
import { UnKeyed } from 'refui/extras/unkeyed.js'

import { derivedExtract } from 'refui'

const App = ({ iterable }) => {
	return (R) => (
		<UnKeyed entries={iterable}>
			{(item) => {
				const { name } = derivedExtract(item)
				return <div>{name}</div> // name will correctly get reactive if it's a signal on item
			}}
		</UnKeyed>
	)
}
```

### Cached

### Render

### Portal
