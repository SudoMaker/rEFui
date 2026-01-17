#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] ?? '.')

const IGNORE_DIRS = new Set([
	'.git',
	'node_modules',
	'dist',
	'build',
	'out',
	'.next',
	'.turbo',
	'.cache',
	'.wrangler',
	'coverage',
])

const CODE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mdx', '.mjs', '.cjs'])
const CONFIG_HINTS = [
	'vite.config.js',
	'vite.config.ts',
	'vite.config.mjs',
	'methanol.config.js',
	'methanol.config.ts',
	'methanol.config.mjs',
	'tsconfig.json',
	'bunfig.toml',
	'.babelrc',
	'.babelrc.json',
	'.babelrc.cjs',
]

function readText(filePath) {
	try {
		return fs.readFileSync(filePath, 'utf8')
	} catch {
		return null
	}
}

function walk(dir, outFiles) {
	let entries
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true })
	} catch {
		return
	}

	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (IGNORE_DIRS.has(entry.name)) continue
			walk(path.join(dir, entry.name), outFiles)
			continue
		}
		if (!entry.isFile()) continue
		const ext = path.extname(entry.name)
		if (!CODE_EXTS.has(ext)) continue
		outFiles.push(path.join(dir, entry.name))
	}
}

function firstExistingConfig(dir) {
	for (const name of CONFIG_HINTS) {
		const candidate = path.join(dir, name)
		if (fs.existsSync(candidate)) return candidate
	}
	return null
}

function detectJsxMode(text) {
	const automatic =
		/jsxImportSource\s*:\s*['"]refui['"]/.test(text) ||
		/jsx\s*:\s*['"]automatic['"]/.test(text) ||
		/"jsxImportSource"\s*:\s*"refui"/.test(text)

	const classic =
		/jsxFactory\s*:\s*['"]R\.c['"]/.test(text) ||
		/jsxFragment\s*:\s*['"]R\.f['"]/.test(text) ||
		/@jsx\s+R\.c/.test(text)

	return { automatic, classic }
}

function detectRendererHints(text) {
	return {
		dom: /createDOMRenderer\s*\(/.test(text) || /from\s+['"]refui\/dom['"]/.test(text),
		html: /createHTMLRenderer\s*\(/.test(text) || /from\s+['"]refui\/html['"]/.test(text),
		reflow: /from\s+['"]refui\/reflow['"]/.test(text) || /jsxInject[^\\n]*refui\/reflow/.test(text),
		refurbish: /from\s+['"]refurbish/.test(text) || /refurbish\s*\(/.test(text),
	}
}

function findSuspiciousValueReads(text) {
	const results = []
	const lines = text.split('\n')
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		if (!line.includes('{') || !line.includes('}')) continue

		let cursor = 0
		while (cursor < line.length) {
			const start = line.indexOf('{', cursor)
			if (start === -1) break
			const end = line.indexOf('}', start + 1)
			if (end === -1) break
			const expr = line.slice(start + 1, end)
			cursor = end + 1

			if (!expr.includes('.value')) continue

			// Skip common non-reactive contexts where `.value` reads are expected:
			// - event handlers and callbacks (arrow functions / function expressions)
			// - inline assignments/mutations
			if (expr.includes('=>') || /\bfunction\b/.test(expr) || /\.value\s*[\+\-]{2}/.test(expr) || /\.value\s*=/.test(expr)) {
				continue
			}

			// Heuristic exclusions: allow common “safe” patterns.
			const looksDerived =
				expr.includes('$(') ||
				expr.includes('computed(') ||
				expr.includes('t`') ||
				expr.includes('tpl`') ||
				expr.includes('read(') ||
				expr.includes('peek(')
			if (looksDerived) continue

			results.push({ line: i + 1, snippet: line.trim() })
			break
		}
	}
	return results
}

function main() {
	if (!fs.existsSync(root)) {
		console.error(`[refui-audit] Path not found: ${root}`)
		process.exit(1)
	}

	const files = []
	walk(root, files)

	const configPath = firstExistingConfig(root)
	const configText = configPath ? readText(configPath) : null

	let jsx = { automatic: false, classic: false }
	if (configText) jsx = detectJsxMode(configText)

	const rendererHints = { dom: false, html: false, reflow: false, refurbish: false }
	const suspicious = []

	for (const filePath of files) {
		const text = readText(filePath)
		if (!text) continue

		const localJsx = detectJsxMode(text)
		jsx.automatic ||= localJsx.automatic
		jsx.classic ||= localJsx.classic

		const localHints = detectRendererHints(text)
		rendererHints.dom ||= localHints.dom
		rendererHints.html ||= localHints.html
		rendererHints.reflow ||= localHints.reflow
		rendererHints.refurbish ||= localHints.refurbish

		if (filePath.endsWith('.jsx') || filePath.endsWith('.tsx') || filePath.endsWith('.mdx')) {
			const hits = findSuspiciousValueReads(text)
			for (const hit of hits) suspicious.push({ filePath, ...hit })
		}
	}

	console.log(`[refui-audit] Root: ${root}`)
	if (configPath) console.log(`[refui-audit] Config hint: ${path.relative(root, configPath)}`)
	console.log(
		`[refui-audit] JSX mode guess: ${jsx.automatic ? 'automatic ' : ''}${jsx.classic ? 'classic ' : ''}`.trim() ||
			'[refui-audit] JSX mode guess: unknown'
	)
	console.log(
		`[refui-audit] Renderer hints: ${[
			rendererHints.dom ? 'DOM' : null,
			rendererHints.html ? 'HTML' : null,
			rendererHints.reflow ? 'Reflow' : null,
			rendererHints.refurbish ? 'refurbish(HMR)' : null,
		]
			.filter(Boolean)
			.join(', ') || 'none'}`
	)

	if (suspicious.length) {
		console.log(
			`\n[refui-audit] Possible non-reactive \`.value\` reads inside JSX braces (review manually): ${suspicious.length}`
		)
		const max = 30
		for (const hit of suspicious.slice(0, max)) {
			const rel = path.relative(root, hit.filePath)
			console.log(`- ${rel}:${hit.line} ${hit.snippet}`)
		}
		if (suspicious.length > max) console.log(`- ... (${suspicious.length - max} more)`)
		console.log(
			'\n[refui-audit] Fix pattern: pass signals directly (`{sig}`), or wrap derived expressions in `$(() => ...)` / `computed(() => ...)` / `t` templates.'
		)
	} else {
		console.log('\n[refui-audit] No obvious `.value`-in-JSX-braces hits found (heuristic).')
	}
}

main()
