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

import { signal } from 'refui/signal';
import { dispose } from 'refui/components';
import { isProduction } from 'refui/constants';

export function defineCustomElement(
	name,
	component,
	{
		mode = 'open',
		attrs,
		slots,
		defaultSlot = true,
		base = HTMLElement,
		extends: extendsFrom,
		cssText,
		styleSheets = []
	} = {}
) {
	const R = this;
	if (isProduction && (!R || !R.render)) {
		throw new Error('Must provide a renderer to define custom elements! Usage:\n  `defineCustomElement.call(renderer, ...args)`\nor  \n`const wc = defineCustomElement.bind(renderer); wc(...args)')
	}

	const _styleSheets = [...styleSheets]
	if (cssText) {
		const styleSheet = new CSSStyleSheet();
		styleSheet.replace(cssText)
		_styleSheets.push(styleSheet)
	}


	class CustomElement extends base {
		static observedAttributes = attrs;

		constructor() {
			super();

			const internals = this.attachInternals();
			const shadowRoot = this.attachShadow({ mode });

			if (_styleSheets.length) {
				shadowRoot.adoptedStyleSheets = _styleSheets
			}

			const props = {
				__proto__: null,
				$$: {
					__proto__: null,
					container: this,
					internals,
					shadowRoot,
				},
			};

			if (attrs && attrs.length) {
				const elementDescriptors = {};
				for (let i = 0; i < attrs.length; i++) {
					const key = attrs[i];
					const value = signal();
					props[key] = value;
					elementDescriptors[key] = {
						get: value.peek.bind(value),
						set: value.set.bind(value),
						enumerable: true,
					};
				}
				Object.defineProperties(this, elementDescriptors);
			}

			if (slots && slots.length) {
				for (let i = 0; i < slots.length; i++) {
					const key = slots[i];
					const slot = R.c('slot', { name: key });
					props[key] = slot;
				}
			}

			const state = {
				__proto__: null,
				instance: null,
				props,
				shadowRoot,
			};

			if (defaultSlot) {
				state.defaultSlot = R.c('slot');
			}

			this.__refui_custom_element_state = state;
		}

		connectedCallback() {
			const { props, defaultSlot, shadowRoot } = this.__refui_custom_element_state;
			if (defaultSlot) {
				this.__refui_custom_element_state.instance = R.render(shadowRoot, component, props, defaultSlot);
			} else {
				this.__refui_custom_element_state.instance = R.render(shadowRoot, component, props);
			}
		}

		disconnectedCallback() {
			const { instance } = this.__refui_custom_element_state;
			if (instance) {
				dispose(instance);
				this.__refui_custom_element_state.instance = null;
			}
		}

		connectedMoveCallback() {}

		attributeChangedCallback(name, oldVal, newVal) {
			this[name] = newVal;
		}
	}

	customElements.define(
		name,
		CustomElement,
		extendsFrom && { extends: extendsFrom }
	);

	return CustomElement;
}
