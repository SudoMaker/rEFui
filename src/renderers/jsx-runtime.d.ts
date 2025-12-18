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

import type { Renderer } from '../renderer.js'
import type { Signal } from '../signal.js'

export type RefProp<T = any> =
	| Signal<T | null>
	| ((node: T) => void)
	| null
	| undefined

// TypeScript's JSX typing model assumes `children` are part of props.
// rEFui passes children as args too, but the runtime also forwards `props.children`,
// so we expose a permissive JSX namespace here for `jsxImportSource: 'refui'`.
export namespace JSX {
	export type Element = any

	export interface IntrinsicElements {
		[elemName: string]: any
	}

	export interface ElementChildrenAttribute {
		children: {}
	}

	export interface IntrinsicAttributes {
		key?: string | number | null
		$ref?: RefProp
	}

	export type LibraryManagedAttributes<C, P> = P & {
		children?: any
		$ref?: RefProp
	}
}

export interface JSXRuntimeBindings {
	jsx: (tag: any, props: Record<string, any>, key?: string | number | null) => any
	jsxs: (tag: any, props: Record<string, any>, key?: string | number | null) => any
	Fragment: any
}

export function wrap<R extends Renderer = Renderer>(renderer: R): JSXRuntimeBindings

export const jsx: JSXRuntimeBindings['jsx']
export const jsxs: JSXRuntimeBindings['jsxs']
export const Fragment: any

declare const _default: {
	wrap: typeof wrap
	readonly default: any
	readonly jsx: typeof jsx
	readonly jsxs: typeof jsxs
	readonly Fragment: typeof Fragment
}

export default _default
