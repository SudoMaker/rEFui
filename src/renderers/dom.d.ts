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

import type { RendererFromOps, BaseNodeOps } from '../renderer.js'

export type DOMMacroHandler<Node extends Element = Element, Value = any> = (node: Node, value: Value) => void

export interface DOMMacroDescriptor<Node extends Element = Element, Value = any> {
	name: string
	handler: DOMMacroHandler<Node, Value>
}

export interface DOMDirectiveFactory<Node extends Element = Element> {
	(node: Node, value: unknown): void
}

export interface DOMNodeOps<Node extends Element = Element, Fragment = DocumentFragment> extends BaseNodeOps<Node, Fragment> {
	macros: Record<string, DOMMacroHandler<Node>>
	useMacro(descriptor: DOMMacroDescriptor<Node>): void
}

export interface DOMRendererOptions<Node extends Element = Element, Fragment = DocumentFragment, Doc extends Document = Document> {
	rendererID?: string
	doc?: Doc
	namespaces?: Record<string, string>
	tagNamespaceMap?: Record<string, string>
	tagAliases?: Record<string, string>
	propAliases?: Record<string, string>
	onDirective?: (prefix: string, key: string, prop: string) => DOMDirectiveFactory<Node> | void
	macros?: Record<string, DOMMacroHandler<Node>>
}

export type DOMRenderer<Node extends Element = Element, Fragment = DocumentFragment> = RendererFromOps<DOMNodeOps<Node, Fragment>>

export const defaultRendererID: string

export function createDOMRenderer<Node extends Element = Element, Fragment = DocumentFragment, Doc extends Document = Document>(
	options?: DOMRendererOptions<Node, Fragment, Doc>
): DOMRenderer<Node, Fragment>
