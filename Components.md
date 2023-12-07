### If

Note: `else` prop has higher priority than the second branch
```jsx
<If condition={value} else={() => <span>Condition not met!</span>}>
	{/*if condition*/
		() => <span>Condition met!</span>
	}{/*else*/
		() =><span>Condition not met!</span>
	}
</If>
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

### Dynamic

### Render

### Portal
