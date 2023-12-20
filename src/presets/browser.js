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

const namespaces = {
	xml: 'http://www.w3.org/XML/1998/namespace',
	html: 'http://www.w3.org/1999/xhtml',
	svg: 'http://www.w3.org/2000/svg',
	math: 'http://www.w3.org/1998/Math/MathML',
	xlink: 'http://www.w3.org/1999/xlink'
}

const tagAliases = {}

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

const tagNamespaceMap = reverseMap(namespaceToTagsMap)
const propAliases = prefix('attr:', attributes)

export const defaults = {
	doc: document,
	namespaces,
	tagNamespaceMap,
	tagAliases,
	propAliases
}
