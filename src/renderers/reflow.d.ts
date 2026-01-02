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

import type { ComponentTemplate, PossibleRender } from '../components.js'
import type { Fragment } from '../renderer.js'

export interface ReflowRuntime {
	readonly Fragment: typeof Fragment
	readonly f: typeof Fragment
	createElement(component: typeof Fragment, props?: { children?: any } | null, ...children: any[]): PossibleRender
	createElement<P = any>(
		component: ComponentTemplate<P>,
		props?: (P & { children?: any }) | null,
		...children: any[]
	): PossibleRender
	c: ReflowRuntime['createElement']
	isNode(node: unknown): boolean
}

export const R: ReflowRuntime

export function markNode(node: object): void
export function isNode(node: unknown): boolean
