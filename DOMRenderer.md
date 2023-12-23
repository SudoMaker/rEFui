## Setting attributes

Props are default to DOM object properties, setting attributes should add the `attr:` prefix.

Props containing `-` are considered as attributes as well. You can override the behavior by adding `prop:` prefix to them.

Boolean values are rendered as toggling the prop on and off.

Usage: `attr:attribute-to-be-set="value"`

Example:
```jsx
<>
	<input type="checkbox" attr:checked="true"/>
	<div data-tooltip="Hello"/>
	<div prop:my-weird-prop={variable}/>
</>
```

## Event handling

Usage: `on[-option-moreOptions]:eventName={handler}`

Examples:

- Simple click
```jsx
<button on:click={() => alert('Clicked!')}>Click me!</button>
```

- Click once
```jsx
<button on-once:click={() => alert('Clicked!')}>Click me!</button>
```

- Passive
```jsx
<div on-passive:scroll={() => {/* do some time consuming operations */}}>{loooooongContent}</div>
```

- Multiple options
```jsx
<div on-capture-passive:click={() => alert('Clicked!')}><button>Click me!</button></div>
```

- Get event object
```jsx
<input on:input={(event) => console.log(event.target.value)}/>
```

## Defaults

We provide presets for conveinence.

### Browser

- Check [here](Presets.md#browser)
