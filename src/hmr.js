import { signal } from './signal.js'
import { isPrimitive } from './utils.js'

export const KEY_HMRWRAP = Symbol('K_HMRWRAP')
export const KEY_HMRWARPPED = Symbol('K_HMRWARPPED')

const toString = Object.prototype.toString

function compareVal(origVal, newVal) {
	return (toString.call(origVal) !== toString.call(newVal)) || (String(origVal) !== String(newVal))
}

function makeHMR(fn) {
	if (typeof fn !== 'function') {
		return fn
	}
	const wrapped = fn.bind(null)
	wrapped[KEY_HMRWARPPED] = true
	return wrapped
}

function wrapComponent(fn) {
	const wrapped = signal(fn, makeHMR)
	Object.defineProperty(fn, KEY_HMRWRAP, {
		value: wrapped,
		enumerable: false
	})
	wrapped.name = fn.name
	wrapped.hot = false
	return wrapped
}

function handleError(err, _, {name, hot}) {
	if (hot) {
		console.error(`Error happened when rendering <${name}>:\n`, err)
	} else {
		throw err
	}
}

export function createHMRComponentWrap({builtins, _dynContainer, Component, createComponentRaw}) {
	return function(tpl, props, ...children) {
		let hotLevel = 0

		if (typeof tpl === 'function' && !builtins.has(tpl)) {
			if (tpl[KEY_HMRWRAP]) {
				tpl = tpl[KEY_HMRWRAP]
				hotLevel = 2
			} else if (!tpl[KEY_HMRWARPPED]) {
				tpl = wrapComponent(tpl)
				hotLevel = 1
			}
		}

		if (hotLevel) {
			const ret = new Component(_dynContainer.bind(tpl, null, handleError, tpl), props ?? {}, ...children)
			return ret
		}

		return createComponentRaw(tpl, props, ...children)
	}
}

export function setup({url, accept, invalidate}) {
	const thisModule = import(/* @vite-ignore */url)
	accept(async function(newModule) {
		if (!newModule) {
			return
		}
		const origModule = await thisModule
		const origExports = Object.entries(await thisModule)
		for (let [key, origVal] of origExports) {
			const newVal = newModule[key]

			if (typeof origVal === 'function' && typeof newVal === 'function' && (key === 'default' || key[0].toUpperCase() === key[0])) {
				let wrapped = origVal[KEY_HMRWRAP]
				if (wrapped) {
					wrapped.hot = true
				} else {
					wrapped = wrapComponent(origVal)
				}
				if (typeof newVal === 'function') {
					Object.defineProperty(newVal, KEY_HMRWRAP, {
						value: wrapped,
						enumerable: false
					})
				}
				wrapped.value = newVal
			} else {
				let invalid = false

				if ((isPrimitive(origVal) || isPrimitive(newVal)) && origVal !== newVal) {
					invalid = true
				} else {
					invalid = compareVal(origVal, newVal)
					if (!invalid) {
						console.warn(`[rEFui HMR] Export "${key}" in "${(new URL(url)).pathname}" does not seem to have changed. Refresh the page manually if neessary.`)
					}
				}

				if (invalid) {
					invalidate(`[rEFui HMR] Non HMR-able export "${key}" changed in "${(new URL(url)).pathname}".`)
				}
			}
		}
	})
}

/* boilerplate
// ---- BEGIN REFUI HMR INJECT ----
if (import.meta.hot) {
	import('refui/hmr').then(({setup}) => setup({
		url: import.meta.url,
		accept(cb) {
			import.meta.hot.accept(cb)
		},
		invalidate(reason) {
			if (import.meta.hot.invalidate) {
				import.meta.hot.invalidate(reason)
			} else {
				location.reload()
			}
		}
	}))
}
// ----  END REFUI HMR INJECT  ----
*/
