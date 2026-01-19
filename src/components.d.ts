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

import type { MaybeSignal, Signal } from './signal.js'
import type { Renderer } from './renderer.js'

export type RenderFunction<R extends Renderer = Renderer, Result = unknown> = (renderer: R) => Result
export type PossibleRender<R extends Renderer = Renderer, Result = unknown> =
	| RenderFunction<R, Result>
	| PromiseLike<RenderFunction<R, Result> | null | undefined>
	| null
	| undefined

export type ComponentTemplate<P = any, R extends Renderer = Renderer, Result = unknown> = (
	props: P,
	...children: any[]
) => PossibleRender<R, Result>

export function capture<T extends (...args: any[]) => any>(fn: T): T
export function snapshot(): <T extends (...args: any[]) => any>(fn: T, ...args: Parameters<T>) => ReturnType<T>

export function render(instance: Component<any>, renderer: Renderer): unknown
export function dispose(instance: Component<any>): void
export function getCurrentSelf<T extends Component<any> = Component<any>>(): T | undefined

export interface ContextProps<T = unknown> {
	value: T
}

export type ContextProvider<T = unknown> = (props: ContextProps<T>, ...children: any[]) => RenderFunction

export function createContext<T = unknown>(defaultValue: T, name?: string): ContextProvider<T>
export function useContext<T = unknown>(Context: ContextProvider<T>): T

export function lazy<T = any>(loader: () => PromiseLike<T> | T, symbol?: string | null): ComponentTemplate<any>

export function memo<T extends (...args: any[]) => any>(fn: T): (...args: Parameters<T>) => ReturnType<T>
export function useMemo<T extends (...args: any[]) => any>(fn: T): () => (...args: Parameters<T>) => ReturnType<T>

export interface FnOptions {
	name?: string
	ctx?: unknown
	catch?: MaybeSignal<(error: unknown, name: string, context: unknown) => PossibleRender>
}

export function Fn(
	options: FnOptions,
	handler?: (context: unknown) => PossibleRender,
	catchHandler?: (error: unknown, name: string, context: unknown) => PossibleRender
): RenderFunction

export interface ForExpose<T = unknown> {
	getItem(key: unknown): T | undefined
	remove(key: unknown): void
	clear(): void
}

export interface ForProps<T = unknown> {
	entries: MaybeSignal<T[]>
	track?: MaybeSignal<keyof T>
	indexed?: boolean
	name?: string
	expose?: (api: ForExpose<T>) => void
}

export type ForTemplate<T = unknown> =
	| ComponentTemplate<any>
	| ((input: { item: T; index: Signal<number> }) => PossibleRender)

export function For<T = unknown>(props: ForProps<T>, template: ForTemplate<T>): RenderFunction

export interface IfProps {
	condition?: MaybeSignal<any> | (() => any) | any
	true?: MaybeSignal<any> | (() => any) | any
	else?: MaybeSignal<any> | (() => any) | any
}

export function If(props: IfProps, whenTrue?: PossibleRender, whenFalse?: PossibleRender): PossibleRender

export interface DynamicExpose {
	current: Signal<unknown>
}

export interface DynamicProps {
	is: MaybeSignal<ComponentTemplate<any> | Component<any> | null | undefined>
	current?: Signal<unknown> | ((value: unknown) => void)
	[key: string]: any
}

export function Dynamic(props: DynamicProps, ...children: any[]): RenderFunction

export interface AsyncProps<T = unknown, E = unknown> {
	future: PromiseLike<T> | T
	fallback?: MaybeSignal<PossibleRender | ((props: Record<string, unknown>, ...children: any[]) => PossibleRender)>
	catch?: MaybeSignal<PossibleRender | ((props: Record<string, unknown> & { error: E }, ...children: any[]) => PossibleRender)>
	suspensed?: boolean
	onLoad?: () => void | Promise<void>
	[key: string]: any
}

export function Async<T = unknown, E = unknown>(
	props: AsyncProps<T, E>,
	then?: (payload: Record<string, unknown> & { result: T }) => PossibleRender,
	now?: PossibleRender,
	catchHandler?: (payload: Record<string, unknown> & { error: E }) => PossibleRender
): RenderFunction

export interface TransitionProps {
	name?: string
	data?: Record<string, unknown>
	fallback?: MaybeSignal<PossibleRender | ((state: TransitionState) => PossibleRender)>
	loading?: Signal<boolean>
	pending?: Signal<boolean>
	catch?: MaybeSignal<PossibleRender | ((props: { error: unknown; state: TransitionState }) => PossibleRender)>
	onLoad?: (state: TransitionState, hasCurrent: boolean, swap: () => Promise<void>) => void | Promise<void>
}

export interface TransitionState {
	loading: Signal<boolean>
	pending: Signal<boolean>
	leaving: Signal<boolean>
	entered: Signal<boolean>
	entering: Signal<boolean>
	data: Record<string, unknown>
}

export function Transition(
	props: TransitionProps,
	then: (state: TransitionState) => PossibleRender,
	now?: PossibleRender,
	catchHandler?: (error: unknown) => PossibleRender
): RenderFunction

export interface SuspenseProps<E = unknown> {
	fallback?: MaybeSignal<PossibleRender | ((props: Record<string, unknown>, ...children: any[]) => PossibleRender)>
	catch?: MaybeSignal<PossibleRender | ((props: Record<string, unknown> & { error: E }, ...children: any[]) => PossibleRender)>
	onLoad?: () => void | Promise<void>
	[key: string]: any
}

export function Suspense<E = unknown>(
	props: SuspenseProps<E>,
	...children: any[]
): RenderFunction

export interface RenderProps {
	from: MaybeSignal<Component<any> | null | undefined>
}

export function Render(props: RenderProps): RenderFunction

export class Component<P = any> {
	constructor(template: ComponentTemplate<P>, props?: P, ...children: any[])
}

export function createComponent<P = any>(template: ComponentTemplate<P>, props?: P, ...children: any[]): Component<P>

export type ComponentInstance<P = any> = Component<P>

/** @internal */
export function _asyncContainer(
	this: PromiseLike<unknown>,
	name: string | null,
	fallback:
		| MaybeSignal<PossibleRender | ((props: Record<string, unknown>, ...children: any[]) => PossibleRender)>
		| undefined,
	catchErr:
		| MaybeSignal<PossibleRender | ((props: Record<string, unknown> & { error: unknown }, ...children: any[]) => PossibleRender)>
		| undefined,
	onLoad: (() => void | Promise<void>) | undefined,
	suspensed: boolean,
	props: Record<string, unknown>,
	children: any[]
): RenderFunction
