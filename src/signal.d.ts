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

export type BatchDisposer = (batch?: boolean) => void
export type EffectCallback = () => void

export type MaybeSignal<T> = T | Signal<T>

export interface Signal<T> {
	value: T
	readonly connected: boolean
	get(): T
	set(value: MaybeSignal<T>): void
	peek(): T
	poke(value: T): void
	touch(): void
	trigger(): void
	refresh(): void
	connect(effect: EffectCallback, runImmediate?: boolean): void
	hasValue(): boolean
	inverse(): Signal<boolean>
	nullishThen<U>(fallback: MaybeSignal<U>): Signal<T | U>
	choose<TrueVal, FalseVal>(truthy: MaybeSignal<TrueVal>, falsy: MaybeSignal<FalseVal>): Signal<TrueVal | FalseVal>
	select<Options>(options: MaybeSignal<Options>): Signal<Options extends (infer Item)[] ? Item : Options extends Record<string, infer Value> ? Value : unknown>
	and<U>(value: MaybeSignal<U>): Signal<unknown>
	andNot<U>(value: MaybeSignal<U>): Signal<unknown>
	andOr<AndVal, OrVal>(andValue: MaybeSignal<AndVal>, orValue: MaybeSignal<OrVal>): Signal<AndVal | OrVal>
	inverseAnd<U>(value: MaybeSignal<U>): Signal<unknown>
	inverseAndNot<U>(value: MaybeSignal<U>): Signal<unknown>
	inverseAndOr<AndVal, OrVal>(andValue: MaybeSignal<AndVal>, orValue: MaybeSignal<OrVal>): Signal<AndVal | OrVal>
	or<U>(value: MaybeSignal<U>): Signal<unknown>
	orNot<U>(value: MaybeSignal<U>): Signal<unknown>
	inverseOr<U>(value: MaybeSignal<U>): Signal<unknown>
	inverseOrNot<U>(value: MaybeSignal<U>): Signal<unknown>
	eq<U>(value: MaybeSignal<U>): Signal<boolean>
	neq<U>(value: MaybeSignal<U>): Signal<boolean>
	gt<U>(value: MaybeSignal<U>): Signal<boolean>
	lt<U>(value: MaybeSignal<U>): Signal<boolean>
	gte<U>(value: MaybeSignal<U>): Signal<boolean>
	lte<U>(value: MaybeSignal<U>): Signal<boolean>
	toJSON(): T
	[Symbol.iterator](): IterableIterator<T extends Iterable<infer Item> ? Item : never>
	[Symbol.toPrimitive](hint: 'string' | 'number' | 'default'): string | number | boolean
}

export interface SignalConstructor {
	new <T>(value: T, compute?: (value: T) => T): Signal<T>
	readonly prototype: Signal<unknown>
	ensure<T>(value: MaybeSignal<T>): Signal<T>
	ensureAll<T extends readonly unknown[]>(...values: T): Signal<unknown>[]
}

export const Signal: SignalConstructor

export interface SignalFactory {
	<T>(value: T): Signal<T>
	<T>(value: MaybeSignal<T>): Signal<T>
	<T, R>(value: MaybeSignal<T>, compute: (value: T) => R): Signal<R>
	ensure<T>(value: MaybeSignal<T>): Signal<T>
	ensureAll<T extends readonly unknown[]>(...values: T): Signal<unknown>[]
}

export const signal: SignalFactory

export function isSignal(value: unknown): value is Signal<unknown>

export function watch(effect: EffectCallback): BatchDisposer

export function computed<T>(compute: () => T): Signal<T>
export function merge<T extends readonly MaybeSignal<any>[], R>(signals: T, handler: (...values: { [K in keyof T]: T[K] extends Signal<infer U> ? U : T[K] }) => R): Signal<R>
export function tpl(strings: TemplateStringsArray, ...exprs: unknown[]): Signal<string>

export type Deferrer = (callback: () => void) => BatchDisposer | void

export function createDefer<T = unknown>(deferrer?: Deferrer): (
	fn: (commit: (value: MaybeSignal<T>) => void) => BatchDisposer | void,
	onAbort?: (abort: () => void) => void
) => Signal<T | undefined>

export const deferred: ReturnType<typeof createDefer>

export function createSchedule<T = unknown>(
	deferrer: Deferrer,
	onAbort?: (abort: () => void) => void
): (
	fn:
		| MaybeSignal<T>
		| ((commit: (value: MaybeSignal<T>) => void) => BatchDisposer | void)
) => Signal<T | undefined>

export function connect(signals: Iterable<Signal<unknown>>, effect: EffectCallback, runImmediate?: boolean): void
export function bind(handler: (value: unknown) => void, value: MaybeSignal<unknown> | (() => unknown)): void
export function useAction<T>(
	initial?: T,
	compute?: (value: T) => T
): [
	(listener: (value: T) => void) => void,
	(value?: T) => void,
	() => void
]

export function derive<T extends Record<string, any>, K extends keyof T, R = T[K]>(source: MaybeSignal<T>, key: K, compute?: (value: T[K]) => R): Signal<R>
export function extract<T extends Record<string, any>>(source: MaybeSignal<T>): { [K in keyof T]: Signal<T[K]> }
export function extract<T extends Record<string, any>, Keys extends readonly (keyof T)[]>(source: MaybeSignal<T>, ...keys: Keys): { [K in Keys[number]]: Signal<T[K]> }
export function derivedExtract<T extends Record<string, any>>(source: MaybeSignal<T>): { [K in keyof T]: Signal<T[K]> }
export function derivedExtract<T extends Record<string, any>, Keys extends readonly (keyof T)[]>(source: MaybeSignal<T>, ...keys: Keys): { [K in Keys[number]]: Signal<T[K]> }
export function makeReactive<T extends Record<string, any>>(object: T): { [K in keyof T]: T[K] extends Signal<infer U> ? U : T[K] }

export function peek<T>(value: MaybeSignal<T>): T
export function poke<T>(target: MaybeSignal<T>, value: T): T
export function touch(...values: MaybeSignal<unknown>[]): void
export function read<T>(value: MaybeSignal<T>): T
export function readAll<T extends readonly unknown[]>(...values: T): { [K in keyof T]: T[K] extends Signal<infer U> ? U : T[K] }
export function write<T>(target: MaybeSignal<T>, value: T | ((previous: T) => T)): T
export function listen(signals: Iterable<MaybeSignal<unknown>>, callback: EffectCallback): void

export function schedule(effects: Iterable<EffectCallback>): number
export function tick(): Promise<void>
export function nextTick(callback?: (...args: unknown[]) => void, ...args: unknown[]): Promise<void>

export function collectDisposers(disposers: BatchDisposer[], fn: () => void, cleanup?: BatchDisposer): BatchDisposer
export function onDispose(callback: BatchDisposer): BatchDisposer
export function useEffect<TArgs extends unknown[]>(effect: (...args: TArgs) => void | BatchDisposer, ...args: TArgs): () => void

export function untrack<T, U extends unknown[]>(fn: (...args: U) => T, ...args: U): T
export function freeze<T extends (...args: any[]) => any>(fn: T): T

export const contextValid: boolean

export function onCondition<T>(signal: MaybeSignal<T>, compute?: (value: boolean) => boolean): (match: MaybeSignal<T>) => Signal<boolean>

export type Disposer = BatchDisposer
