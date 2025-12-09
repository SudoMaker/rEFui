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

import type { Component, ComponentTemplate } from './components.js'

export const hotEnabled: boolean

export const KEY_HMRWRAP: unique symbol
export const KEY_HMRWRAPPED: unique symbol

export interface EnableHMROptions {
	makeDyn: (component: any, handleError: (error: unknown, name: string, context: unknown) => any) => ComponentTemplate<any>
	Component: new (...args: any[]) => Component<any>
	createComponentRaw: (template: ComponentTemplate<any>, props?: any, ...children: any[]) => Component<any>
}

export function enableHMR(options: EnableHMROptions): (template: ComponentTemplate<any>, props?: any, ...children: any[]) => Component<any>

export interface HMRSetupOptions {
	data?: Record<string, any>
	current: PromiseLike<any> | any
	accept(): void
	dispose(callback: (data: any) => void): void
	invalidate(reason?: string): void
}

export function setup(options: HMRSetupOptions): void
