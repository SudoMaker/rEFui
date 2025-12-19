import type { Signal } from './signal.js'

export type RefProp<T = any> =
	| Signal<T | null>
	| ((node: T) => void)
	| null
	| undefined

// Classic JSX transform (`jsxFactory: R.c`, `jsxFragmentFactory: R.f`) uses the *global*
// `JSX` namespace for typechecking intrinsic elements.
//
// This file intentionally keeps intrinsic elements permissive, since rEFui renderers
// accept arbitrary attributes like `on:click`, `class:active`, `style:color`, etc.
declare global {
	namespace JSX {
		type Element = any

		interface IntrinsicElements {
			[elemName: string]: any
		}

		interface ElementChildrenAttribute {
			children: {}
		}

		interface IntrinsicAttributes {
			key?: string | number | null
			$ref?: RefProp
		}

		type LibraryManagedAttributes<C, P> = P & {
			children?: any
			$ref?: RefProp
		}
	}
}

export {}

