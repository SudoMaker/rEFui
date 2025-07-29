/* Copyright Yukino Song
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

import { read } from 'refui/signal'
import { Fn } from 'refui/components'

export function Parse({ text, parser }) {
	let currentText = ''
	let currentParser = null
	let currentRender = null

	return Fn({ name: 'Parse' }, function() {
		const newText = read(text)
		const newParser = read(parser)

		if (newText === currentText && currentParser === newParser) {
			return currentRender
		}

		currentText = newText
		currentParser = newParser

		return (currentRender = function(R) {
			return R.c(R.f, null, newParser(newText, R))
		})
	})
}
