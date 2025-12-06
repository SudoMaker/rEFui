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

import type { MaybeSignal } from '../signal.js'
import type { PossibleRender, RenderFunction } from '../components.js'

export interface ParseContext<S = unknown> {
	source: MaybeSignal<S> | S
	onAppend(append: (...args: any[]) => void): void
}

export interface ParseExpose<S = unknown> {
	append: (...args: any[]) => void
}

export interface ParseProps<S = unknown> {
	source: MaybeSignal<S> | S
	parser: MaybeSignal<(context: ParseContext<S>, ...children: any[]) => PossibleRender>
	expose?: (api: ParseExpose<S>) => void
}

export function Parse<S = unknown>(props: ParseProps<S>, ...children: any[]): RenderFunction
