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

export interface BaseNodeOps<Node = unknown, Fragment = unknown> {
	isNode(node: unknown): node is Node
	createNode(tag: string): Node
	createTextNode(content: unknown): Node
	createAnchor(name?: string | null): Node
	createFragment(name?: string | null): Fragment
	removeNode(node: Node | Fragment): void
	appendNode(parent: Node | Fragment, ...children: Array<Node | Fragment>): void
	insertBefore(node: Node | Fragment, ref: Node | Fragment): void
	setProps(node: Node | Fragment, props: Record<string, unknown>): void
}

export type NodeTypeFromOps<Ops> = Ops extends BaseNodeOps<infer Node, any> ? Node : unknown
export type FragmentTypeFromOps<Ops> = Ops extends BaseNodeOps<any, infer Fragment> ? Fragment : unknown

export interface RendererCore<Node = unknown, Fragment = unknown> extends BaseNodeOps<Node, Fragment> {
	readonly id: string | symbol
	readonly nodeOps: BaseNodeOps<Node, Fragment>
	Fragment: '<>'
	isFragment(value: unknown): value is Fragment
	createFragment(name?: string | null): Fragment
	expandFragment(node: Fragment): Array<Node | Fragment>
	normalizeChildren(children: unknown[]): Array<Node | Fragment>
	createElement<P = any>(tag: any, props?: P, ...children: any[]): Node | Fragment | null
	ensureElement(value: unknown): Node | Fragment | null
	removeNode(node: Node | Fragment): void
	appendNode(parent: Node | Fragment, ...children: Array<Node | Fragment>): void
	insertBefore(node: Node | Fragment, ref: Node | Fragment): void
	text(content: unknown): Node | Fragment | null
	c: RendererCore<Node, Fragment>['createElement']
	f: '<>'
	render<P = any>(
		target: Node | Fragment | null | undefined,
		template: ComponentTemplate<P>,
		props?: P,
		...children: any[]
	): Component<P>
}

export type RendererFromOps<Ops extends BaseNodeOps<any, any>> =
	RendererCore<NodeTypeFromOps<Ops>, FragmentTypeFromOps<Ops>> &
	Ops & {
		nodeOps: Ops
	}

export function createRenderer<Ops extends BaseNodeOps<any, any>>(nodeOps: Ops, rendererID?: string | symbol): RendererFromOps<Ops>

export const Fragment: '<>'

export type Renderer = RendererCore<any, any>
