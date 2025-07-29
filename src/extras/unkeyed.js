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

import { signal, watch, read } from 'refui/signal'
import { For } from 'refui/components'

export function UnKeyed({ entries, ...args }, itemTemplate) {
	const rawSigEntries = []
	const sigEntries = signal(rawSigEntries)

	watch(function() {
		const rawEntries = read(entries)
		const oldLength = rawSigEntries.length
		rawSigEntries.length = rawEntries.length
		for (let i in rawEntries) {
			if (rawSigEntries[i]) rawSigEntries[i].value = rawEntries[i]
			else rawSigEntries[i] = signal(rawEntries[i])
		}

		if (oldLength !== rawEntries.length) sigEntries.trigger()
	})

	return function(R) {
		return R.c(For, { name: 'UnKeyed', entries: sigEntries, ...args }, itemTemplate)
	}
}
