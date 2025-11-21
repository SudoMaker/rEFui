/* Copyright Yukino Song, SudoMaker Ltd.
 *
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * 	http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { signal } from 'refui/signal'
import { isPrimitive } from 'refui/utils'
import { isProduction } from 'refui/constants'

export const hotEnabled = !isProduction && !!/* @refui webpack */import.meta.hot

export const KEY_HMRWRAP = Symbol('K_HMRWRAP')
export const KEY_HMRWRAPPED = Symbol('K_HMRWARPPED')

const toString = Object.prototype.toString

function compareVal(origVal, newVal) {
	return (toString.call(origVal) !== toString.call(newVal)) || (String(origVal) !== String(newVal))
}

function makeHMR(fn) {
	if (typeof fn !== 'function') {
		return fn
	}
	const wrapped = fn.bind(null)
	wrapped[KEY_HMRWRAPPED] = true
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

function handleError(err, _, { name, hot }) {
	if (hot) {
		console.error(`[rEFui HMR] Error happened when rendering <${name}>:\n`, err)
	} else {
		throw err
	}
}

export function enableHMR({ builtins, makeDyn, Component, createComponentRaw }) {
	console.info('[rEFui HMR] Hot Module Replacement is available. Check https://github.com/SudoMaker/refurbish for details.')
	return function(tpl, props, ...children) {
		let hotLevel = 0

		if (typeof tpl === 'function' && !builtins.has(tpl)) {
			if (tpl[KEY_HMRWRAP]) {
				tpl = tpl[KEY_HMRWRAP]
				hotLevel = 2
			} else if (!tpl[KEY_HMRWRAPPED]) {
				tpl = wrapComponent(tpl)
				hotLevel = 1
			}
		}

		if (hotLevel) {
			return new Component(makeDyn(tpl, handleError), props ?? {}, ...children)
		}

		return createComponentRaw(tpl, props, ...children)
	}
}

async function update(newModule, invalidate) {
	newModule = await newModule
	if (!newModule) {
		return
	}
	const oldModule = Object.entries(await this)
	for (let [key, origVal] of oldModule) {
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
					console.warn(`[rEFui HMR] Export "${key}" does not seem to have changed. Refresh the page manually if neessary.`)
				}
			}

			if (invalid) {
				invalidate(`[rEFui HMR] Non HMR-able export "${key}" changed.`)
			}
		}
	}
}

function onDispose(data) {
	data[KEY_HMRWRAP] = this
}

export function setup({data, current, accept, dispose, invalidate}) {
	if (data?.[KEY_HMRWRAP]) {
		update.call(data[KEY_HMRWRAP], current, invalidate)
	}
	dispose(onDispose.bind(current))
	accept()
}

/* // Rollup/Vite/Bun boilerplate
if (import.meta.hot) {
	import("refui/hmr").then(m => m.setup({
		data: import.meta.hot.data,
		current: import(import.meta.url),
		accept() {
			import.meta.hot.accept()
		},
		dispose(cb) {
			import.meta.hot.dispose(cb)
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
*/

/* // Webpack boilerplate
if (import.meta.webpackHot) {
	import("refui/hmr").then(m => m.setup({
		data: import.meta.webpackHot.data,
		current: import(${JSON.stringify(this.resourcePath)}),
		accept() { import.meta.webpackHot.accept() },
		dispose(cb) { import.meta.webpackHot.dispose(cb) },
		invalidate(reason) { import.meta.webpackHot.decline(reason) }
	}));
}
*/
