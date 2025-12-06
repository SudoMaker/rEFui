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

// eslint-disable-next-line no-empty-function
export function nop() {}

export function cached(handler) {
	const store = new Map()
	return function(arg) {
		let val = store.get(arg)
		if (!val) {
			val = handler(arg)
			store.set(arg, val)
		}
		return val
	}
}

export function cachedStrKeyNoFalsy(handler) {
	const store = Object.create(null)
	return function(key) {
		return (store[key] || (store[key] = handler(key)))
	}
}

export function removeFromArr(arr, val) {
  const index = arr.indexOf(val)
  if (index > -1) {
    arr.splice(index, 1)
  }
}

export function isPrimitive(val) {
	return Object(val) !== val
}
export function isThenable(val) {
	return val && val.then?.call
}

export function splitFirst(val, splitter) {
	const idx = val.indexOf(splitter)
	if (idx < 0) return [val]
	const front = val.slice(0, idx)
	const back = val.slice(idx + splitter.length, val.length)
	return [front, back]
}
