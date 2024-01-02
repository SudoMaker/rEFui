import { nextTick, bind } from '../signal.js'

const reverseMap = (keyValsMap) => {
	const reversed = {}
	for (let [key, vals] of Object.entries(keyValsMap)) {
		for (let val of vals) {
			reversed[val] = key
		}
	}
	return reversed
}

const prefix = (prefix, keyArr) => Object.fromEntries(keyArr.map((i) => [i, `${prefix}${i}`]))

export const namespaces = {
	xml: 'http://www.w3.org/XML/1998/namespace',
	html: 'http://www.w3.org/1999/xhtml',
	svg: 'http://www.w3.org/2000/svg',
	math: 'http://www.w3.org/1998/Math/MathML',
	xlink: 'http://www.w3.org/1999/xlink'
}

export const tagAliases = {}

const attributes = ['class', 'style', 'viewBox', 'd', 'tabindex', 'role']

const namespaceToTagsMap = {
	svg: [
		'animate',
		'animateMotion',
		'animateTransform',
		'circle',
		'clipPath',
		'defs',
		'desc',
		'discard',
		'ellipse',
		'feBlend',
		'feColorMatrix',
		'feComponentTransfer',
		'feComposite',
		'feConvolveMatrix',
		'feDiffuseLighting',
		'feDisplacementMap',
		'feDistantLight',
		'feDropShadow',
		'feFlood',
		'feFuncA',
		'feFuncB',
		'feFuncG',
		'feFuncR',
		'feGaussianBlur',
		'feImage',
		'feMerge',
		'feMergeNode',
		'feMorphology',
		'feOffset',
		'fePointLight',
		'feSpecularLighting',
		'feSpotLight',
		'feTile',
		'feTurbulence',
		'filter',
		'foreignObject',
		'g',
		'line',
		'linearGradient',
		'marker',
		'mask',
		'metadata',
		'mpath',
		'path',
		'pattern',
		'polygon',
		'polyline',
		'radialGradient',
		'rect',
		'set',
		'stop',
		'svg',
		'switch',
		'symbol',
		'text',
		'textPath',
		'title',
		'tspan',
		'unknown',
		'use',
		'view'
	]
}

export const tagNamespaceMap = reverseMap(namespaceToTagsMap)
export const propAliases = prefix('attr:', attributes)

export const directives = {
	style(key) {
		return (node, val) => {
			if (val === undefined || val === null) return

			const styleObj = node.style

			const handler = (newVal) => nextTick(() => {
				if (newVal === undefined || val === null || val === false) styleObj[key] = 'unset'
				else styleObj[key] = newVal
			})

			bind(handler, val)
		}
	},
	class(key) {
		return (node, val) => {
			if (val === undefined || val === null) return

			const classList = node.classList

			const handler = (newVal) => nextTick(() => {
				if (newVal) classList.add(key)
				else classList.remove(key)
			})

			bind(handler, val)
		}
	}
}

const onDirective = (prefix, key) => {
	const handler = directives[prefix]
	if (handler) return handler(key)
}

export const defaults = {
	doc: document,
	namespaces,
	tagNamespaceMap,
	tagAliases,
	propAliases,
	onDirective
}
