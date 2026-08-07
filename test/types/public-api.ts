import {
	Component,
	Signal as SignalValue,
	type AsyncProps,
	type DynamicProps,
	type DisposerStore,
	type ForMethod,
	type Signal,
	createContext,
	createComponent,
	collectDisposers,
	derive,
	lazy,
	peek,
	poke,
	R as RootR,
	signal,
	scopeValid,
	connect,
	listen,
	useContext
} from 'refui'
import { createDOMRenderer, type DOMRendererOptions } from 'refui/dom'
import { createHTMLRenderer } from 'refui/html'
import { R } from 'refui/reflow'

const ensured = signal.ensureAll(1, 'two')
const numberSignal: Signal<number> = ensured[0]
const stringSignal: Signal<string> = ensured[1]
const transformedSignal: Signal<{ value: number }> = new SignalValue(1, function (value) {
	return { value }
})

const count = signal(0)
const mirroredCount: Signal<number> = signal(count)
const initiallyEmpty: Signal<number | undefined> = signal<number>()
const pokeResult: void = poke(count, 1)
const plainPokeResult: number = poke(0, 1)
const countValue: number = peek(count)
const disposeCountConnection: () => void = count.connect(function () {})
const disposeConnections: () => void = connect([count], function () {})
const disposeListeners: () => void = listen([count], function () {})
const rootScopeIsValid: boolean = scopeValid()
const disposerStore: DisposerStore = []
const disposeStore = collectDisposers(function () {}, undefined, disposerStore)
disposeStore()

const user = signal<{ name: string } | null>({ name: 'Ada' })
const userName: Signal<string | undefined> = derive(user, 'name')

const asyncProps: AsyncProps<string> = {
	future() {
		return Promise.resolve('loaded')
	}
}

lazy(async function () {
	return { [Symbol.iterator]: function Component() {} }
}, Symbol.iterator)

const Theme = createContext(signal('light'))
const theme: Signal<string> = useContext(Theme)

const instance: Component<{ label: string }> = createComponent(
	function Label({ label }) {
		return function () {
			return label
		}
	},
	{ label: 'ok' }
)

const rowMethod: ForMethod<{ id: number }> = function ({ item, index }) {
	return function () {
		return `${item.id}:${index.value}`
	}
}
// @ts-expect-error For item methods are invoked with the item input only.
const invalidRowMethod: ForMethod<{ id: number }> = function ({ item }, requiredChild: string) {
	return function () {
		return `${item.id}:${requiredChild}`
	}
}
const dynamicTagProps: DynamicProps = { is: 'section' }
const dynamicMethodProps: DynamicProps = {
	is() {
		return function () {
			return 'dynamic'
		}
	}
}
const invalidDynamicInstanceProps: DynamicProps = {
	// @ts-expect-error Dynamic accepts a component template or tag name, not a Component instance.
	is: instance
}

const domOptions: DOMRendererOptions = {}
const dom = createDOMRenderer(domOptions)
const html = createHTMLRenderer({ rendererID: Symbol('HTML test') })
const htmlFragment = html.createFragment('type test')
const fragmentCleared: boolean = html.clearFragment(htmlFragment)
createDOMRenderer({ rendererID: Symbol('DOM test') })
createDOMRenderer({
	macros: {
		highlight(node) {
			node.classList.add('highlight')
		}
	}
})

// Text and anchor creation do not guarantee an Element result.
// @ts-expect-error
const incorrectlyNarrowedTextNode: Element = dom.createTextNode('text')

dom.c(
	'div',
	null,
	numberSignal,
	stringSignal,
	transformedSignal,
	countValue,
	mirroredCount,
	initiallyEmpty,
	pokeResult,
	plainPokeResult,
	theme,
	instance,
	userName,
	asyncProps
)
html.serialize(html.c('div', null, 'ok'))
RootR.c(function Abstract() {
	return function () {
		return 'ok'
	}
}, null)
R.c(function Abstract() {
	return function () {
		return 'ok'
	}
}, null)

void incorrectlyNarrowedTextNode
void fragmentCleared
void disposeCountConnection
void disposeConnections
void disposeListeners
void rootScopeIsValid
void effectStore
void rowMethod
void invalidRowMethod
void dynamicTagProps
void dynamicMethodProps
void invalidDynamicInstanceProps
