### If
```jsx
<If condition={value} else={() => <span>Condition not met!</span>}>{() => <span>Condition met!</span>}</If>
```

### For
```jsx
<For entries={iterable}>{(item) => <div>{item}</div>}</For>
```

### Fn

Note: define return renderers outside of the `Fn` scope can reduce re-renders if condition doesn't change its match reult.
```jsx
<Fn>{() => {
	switch (condition.value) {
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
}}</Fn>
```

### Cached

### Render

### Component

### Portal
