/** @jsxRuntime classic */
/** @jsx R.c */
/** @jsxFrag R.f */

import { For, signal } from 'refui'
import 'refui/jsx-global'
import { R } from 'refui/reflow'

const entries = signal([{ id: 1, label: 'one' }])

export function ClassicApp() {
	return (
		<For entries={entries} track="id">
			{({ item }) => <div>{item.label}</div>}
		</For>
	)
}
