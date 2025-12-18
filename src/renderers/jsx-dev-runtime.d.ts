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
import type { JSX as JSXNS } from './jsx-runtime.js'

// Re-export JSX namespace so TS also works under `jsx: react-jsxdev`.
export namespace JSX {
	export type Element = JSXNS.Element
	export interface IntrinsicElements extends JSXNS.IntrinsicElements {}
	export interface ElementChildrenAttribute extends JSXNS.ElementChildrenAttribute {}
	export interface IntrinsicAttributes extends JSXNS.IntrinsicAttributes {}
	export type LibraryManagedAttributes<C, P> = JSXNS.LibraryManagedAttributes<C, P>
}

export interface JSXDevRuntimeBindings {
	jsxDEV: (tag: any, props: Record<string, any>, key?: string | number | null, isStaticChildren?: boolean, source?: Record<string, any>, self?: any) => any
	Fragment: any
}

export function wrap<R extends Renderer = Renderer>(renderer: R): JSXDevRuntimeBindings

export const jsxDEV: JSXDevRuntimeBindings['jsxDEV']
export const Fragment: any

declare const _default: {
	wrap: typeof wrap
	readonly default: any
	readonly jsxDEV: typeof jsxDEV
	readonly Fragment: typeof Fragment
}

export default _default
