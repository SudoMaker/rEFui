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

import { read, isSignal } from 'refui/signal'
import { Fn } from 'refui/components'

const parseProps = {
	name: 'Parse'
}

export function Parse({ text, parser }) {
	if (!isSignal(parser)) {
		return function(R) {
			return parser(text, R)
		}
	}

	let currentParser = null
	let currentRender = null

	return Fn(parseProps, function() {
		const newParser = read(parser)

		if (currentParser === newParser) {
			return currentRender
		}

		currentParser = newParser

		return (currentRender = function(R) {
			return newParser(text, R)
		})
	})
}
