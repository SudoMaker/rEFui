## Setting attributes

Props are default to DOM object properties, setting attributes should add the `attr:` prefix

Usage: `attr:attribute-to-be-set="value"`

Example:
```jsx
<div attr:aria-hidden="true"/>
```

## Event handling

Usage: `on:eventName--options-moreOptions={handler}`

Examples:

- Simple click
```jsx
<button on:click={() => alert('Clicked!')}>Click me!</button>
```

- Click once
```jsx
<button on:click--once={() => alert('Clicked!')}>Click me!</button>
```

- Passive
```jsx
<div on:scroll--passive={() => {/* do some time consuming operations */}}>{loooooongContent}</div>
```

- Multiple options
```jsx
<div on:click--once-capture-passive={() => alert('Clicked!')}><button>Click me!</button></div>
```

- Get event object
```jsx
<input on:input={(event) => console.log(event.target.value)}/>
```
