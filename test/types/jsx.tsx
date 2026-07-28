import { For, If, signal } from 'refui'
import { UnKeyed } from 'refui/extras'

const visible = signal(true)
const entries = signal([{ id: 1, label: 'one' }])

export function App() {
	return (
		<main class:visible={visible}>
			<If condition={visible}>
				{() => <span>visible</span>}
				{() => <span>hidden</span>}
			</If>
			<For entries={entries} track="id">
				{({ item }) => <div>{item.label}</div>}
			</For>
			<UnKeyed entries={entries}>
				{({ item }) => <div>{item.value.label}</div>}
			</UnKeyed>
		</main>
	)
}
