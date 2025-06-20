import { signal } from './signal.js'

export const KEY_HMRWRAP = Symbol('K_HMRWRAP')
export const KEY_HMRWARPPED = Symbol('K_HMRWARPPED')

function makeHMR(fn) {
	if (typeof fn !== 'function') {
		console.log('??????hh', fn)
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

export function createHMRComponentWrap({builtins, _dynWrap, Component, createComponentRaw}) {
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
			const ret = new Component(_dynWrap.bind(tpl, null, handleError, tpl), props ?? {}, ...children)
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
			if (!key || key[0].toUpperCase() !== key[0]) {
				if (String(origVal) === String(newVal)) {
					continue
				} else {
					invalidate(`Non HMR-able export "${key}" changed in "${(new URL(url)).pathname}".`)
				}
			}

			if (typeof origVal === 'function') {
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
			}
		}
	})
}
