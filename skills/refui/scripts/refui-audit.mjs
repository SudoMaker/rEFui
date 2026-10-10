#!/usr/bin/env node
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

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

/**
 * Load the target project's SWC installation without making the skill own a
 * compiler dependency. The current working directory is a useful second root
 * when one package audits a sibling source tree in the same workspace.
 */
async function loadProjectSwc() {
	for (const base of new Set([root, process.cwd()])) {
		try {
			const requireFromProject = createRequire(path.join(base, 'package.json'))
			const entry = requireFromProject.resolve('@swc/core')
			return await import(pathToFileURL(entry).href)
		} catch {}
	}
	return null
}

/** Visit every SWC syntax node exactly once. */
function visitSyntax(node, visitor) {
	if (!node || typeof node !== 'object') return
	if (visitor(node) === false) return
	for (const value of Object.values(node)) {
		if (Array.isArray(value)) {
			for (const child of value) visitSyntax(child, visitor)
		} else if (value && typeof value === 'object') visitSyntax(value, visitor)
	}
}

/** Use SWC's resolved identifier contexts rather than guessing lexical scope. */
function bindingKey(node) {
	return node?.type === 'Identifier' && Number.isInteger(node.ctxt)
		? `${node.ctxt}:${node.value}` : null
}

function collectRefuiBindings(syntax) {
	const named = new Map(), namespaces = new Set()
	for (const statement of syntax.body ?? []) {
		const source = statement.source?.value
		if (statement.type !== 'ImportDeclaration' ||
			!['refui', 'refui/components', 'refui/signal'].includes(source) || statement.typeOnly) continue
		for (const specifier of statement.specifiers ?? []) {
			if (specifier.type === 'ImportNamespaceSpecifier') namespaces.add(bindingKey(specifier.local))
			else if (specifier.type === 'ImportSpecifier' && !specifier.isTypeOnly) {
				named.set(bindingKey(specifier.local), specifier.imported?.value ?? specifier.local.value)
			}
		}
	}
	return { named, namespaces }
}

function refuiAPI(node, bindings) {
	if (node?.type === 'Identifier') return bindings.named.get(bindingKey(node))
	if ((node?.type === 'MemberExpression' || node?.type === 'JSXMemberExpression') &&
		bindings.namespaces.has(bindingKey(node.object)) && node.property?.type === 'Identifier') {
		return node.property.value
	}
}

function isDirectJSX(branch) {
	const value = branch?.type === 'JSXExpressionContainer' ? branch.expression : branch
	return value?.type === 'JSXElement' || value?.type === 'JSXFragment'
}

/** Convert SWC's one-based UTF-8 byte position into a one-based source line. */
function sourceLine(text, position) {
	return Buffer.from(text).subarray(0, Math.max(0, position - 1))
		.toString('utf8').split('\n').length
}

/**
 * Audit one parsed module for eager If branches and ignored extra children.
 * rEFui receives the first two children as true/false branch values; JSX has
 * already constructed a direct element before If can inspect its condition.
 */
export function auditIfBranches(syntax, text, filePath) {
	const warnings = []
	const bindings = collectRefuiBindings(syntax)
	let boundaries = 0
	visitSyntax(syntax, (node) => {
		if (node.type !== 'JSXElement' || refuiAPI(node.opening?.name, bindings) !== 'If') return
		boundaries++
		const children = node.children.filter((child) =>
			!(child.type === 'JSXText' && !child.value.trim()) &&
			!(child.type === 'JSXExpressionContainer' &&
				child.expression?.type === 'JSXEmptyExpression')
		)
		const elseAttribute = node.opening.attributes.find((attribute) =>
			attribute.type === 'JSXAttribute' && attribute.name?.value === 'else'
		)
		const reasons = []
		if (children.length > 2) reasons.push(`has ${children.length} children; only true/false are consumed`)
		if (elseAttribute && children.length > 1) {
			reasons.push('declares both an else prop and a second child')
		}
		for (const [index, child] of children.slice(0, 2).entries()) {
			if (isDirectJSX(child)) reasons.push(`${index ? 'false' : 'true'} branch JSX is evaluated before If; confirm enclosing-owner lifetime is intentional`)
		}
		if (elseAttribute && isDirectJSX(elseAttribute.value)) {
			reasons.push('else JSX is evaluated before If; confirm enclosing-owner lifetime is intentional')
		}
		if (reasons.length) {
			warnings.push({
				filePath,
				line: sourceLine(text, node.span.start),
				reason: reasons.join('; '),
			})
		}
	})
	return { boundaries, warnings }
}

/**
 * Bounded syntax audit, not whole-program dataflow or a proof of divergence.
 * Only locally constructed signals and inline callbacks are recognized. SWC
 * binding contexts distinguish shadowed identifiers; aliases/helpers remain
 * manual-review cases. Nested functions are not assumed to execute now, and
 * reads after an await do not belong to synchronous dependency discovery.
 */
export function auditSignalFeedback(syntax, text, filePath) {
	const bindings = collectRefuiBindings(syntax)
	const signals = new Map(), warnings = []
	let scopes = 0
	visitSyntax(syntax, (node) => {
		if (node.type === 'VariableDeclarator' && bindingKey(node.id) &&
			node.init?.type === 'CallExpression' &&
			['signal', 'computed', '$'].includes(refuiAPI(node.init.callee, bindings))) {
			signals.set(bindingKey(node.id), node.id.value)
		}
	})
	const signalKey = (node) => signals.has(bindingKey(node)) ? bindingKey(node) : null
	visitSyntax(syntax, (node) => {
		if (node.type !== 'CallExpression') return
		const api = refuiAPI(node.callee, bindings)
		let callback, tracked = true, sources = []
		if (['watch', 'useEffect', 'computed', '$'].includes(api)) callback = node.arguments[0]?.expression
		else if (api === 'signal') callback = node.arguments[1]?.expression
		else if (api === 'connect') {
			callback = node.arguments[1]?.expression
			tracked = false
			const source = node.arguments[0]?.expression
			sources = source?.type === 'ArrayExpression' ? source.elements.map((item) => item?.expression) : [source]
		} else if (node.callee.type === 'MemberExpression' && node.callee.property?.value === 'connect' && signalKey(node.callee.object)) {
			callback = node.arguments[0]?.expression
			tracked = false
			sources = [node.callee.object]
		}
		if (!['ArrowFunctionExpression', 'FunctionExpression'].includes(callback?.type)) return
		scopes++
		const reads = new Set(sources.map(signalKey).filter(Boolean)), writes = new Set()
		if (api === 'signal' && signalKey(node.arguments[0]?.expression)) reads.add(signalKey(node.arguments[0].expression))
		let suspended = false
		function scan(body, trackReads) {
			visitSyntax(body, (part) => {
				if (['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration', 'ClassExpression', 'ClassDeclaration', 'MethodProperty', 'GetterProperty', 'SetterProperty'].includes(part.type)) return false
				const reading = trackReads && !suspended
				if (part.type === 'AwaitExpression') {
					// Its operand runs before suspension; later reads are conservatively
					// untracked even if the await is conditional. Writes can still notify
					// dependencies discovered before suspension.
					scan(part.argument, trackReads)
					suspended = true
					return false
				}
				if (part.type === 'AssignmentExpression' || part.type === 'UpdateExpression') {
					const target = part.left ?? part.argument
					const key = target?.type === 'MemberExpression' && target.property?.value === 'value' && signalKey(target.object)
					if (key) {
						writes.add(key)
						if (reading && part.operator !== '=') reads.add(key)
						if (part.right) scan(part.right, trackReads)
						return false
					}
				}
				if (part.type === 'MemberExpression' && part.property?.value === 'value' && reading && signalKey(part.object)) reads.add(signalKey(part.object))
				if (part.type !== 'CallExpression') return
				const called = refuiAPI(part.callee, bindings)
				if (called === 'untrack') {
					const fn = part.arguments[0]?.expression
					if (['ArrowFunctionExpression', 'FunctionExpression'].includes(fn?.type)) {
						const parentSuspended = suspended
						scan(fn.body, false)
						suspended = parentSuspended
					}
					return false
				}
				if (part.callee.type === 'MemberExpression') {
					const key = signalKey(part.callee.object), method = part.callee.property?.value
					if (key && reading && ['get', 'touch', 'hasValue'].includes(method)) reads.add(key)
					if (key && ['set', 'trigger'].includes(method)) writes.add(key)
				}
				if (reading && ['read', 'readAll', 'touch'].includes(called)) {
					for (const argument of part.arguments) if (signalKey(argument.expression)) reads.add(signalKey(argument.expression))
				}
				if (called === 'write' && signalKey(part.arguments[0]?.expression)) writes.add(signalKey(part.arguments[0].expression))
			})
		}
		scan(callback.body, tracked)
		for (const key of writes) {
			if (reads.has(key)) warnings.push({ filePath, line: sourceLine(text, node.span.start), signal: signals.get(key),
				reason: `${api ?? 'connect'} scope subscribes to and writes signal "${signals.get(key)}"; it may schedule itself repeatedly. Confirm the update is intentional and terminates.` })
		}
	})
	return { scopes, warnings }
}

async function main() {
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
	const swc = await loadProjectSwc()
	const ifWarnings = [], feedbackWarnings = []
	const parseFailures = []
	let ifBoundaries = 0
	let reactiveScopes = 0

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

		/* MDX requires its own document parser. Ordinary JS/TS uses the project's
		 * installed compiler so nested JSX, comments, aliases, and Fragments are
		 * classified from syntax rather than a partial text grammar. */
		if (swc && path.extname(filePath) !== '.mdx') {
			try {
				const extension = path.extname(filePath)
				const typescript = extension === '.ts' || extension === '.tsx'
				const syntax = await swc.parseFile(filePath, typescript
					? { syntax: 'typescript', tsx: extension === '.tsx', decorators: true }
					: { syntax: 'ecmascript', jsx: true, decorators: true })
				const result = auditIfBranches(syntax, text, filePath)
				ifBoundaries += result.boundaries
				ifWarnings.push(...result.warnings)
				const feedback = auditSignalFeedback(syntax, text, filePath)
				reactiveScopes += feedback.scopes
				feedbackWarnings.push(...feedback.warnings)
			} catch (error) {
				parseFailures.push({ filePath, error: error?.message || String(error) })
			}
		}
	}

	console.log(`[refui-audit] Root: ${root}`)
	if (configPath) console.log(`[refui-audit] Config hint: ${path.relative(root, configPath)}`)
	const jsxModes = [jsx.automatic ? 'automatic' : null, jsx.classic ? 'classic' : null]
		.filter(Boolean).join(' ') || 'unknown'
	console.log(`[refui-audit] JSX mode guess: ${jsxModes}`)

	if (!swc) {
		console.log('\n[refui-audit] If ownership and signal feedback: not checked (`@swc/core` is not installed in the target project or current workspace).')
	} else {
		console.log(`\n[refui-audit] If ownership: ${ifBoundaries} boundaries parsed, ${ifWarnings.length} advisory warnings.`)
		for (const warning of ifWarnings) {
			console.log(`- ${path.relative(root, warning.filePath)}:${warning.line} ${warning.reason}`)
		}
		console.log(`\n[refui-audit] Signal feedback: ${reactiveScopes} recognizable scopes, ${feedbackWarnings.length} advisory warnings.`)
		for (const warning of feedbackWarnings) console.log(`- ${path.relative(root, warning.filePath)}:${warning.line} ${warning.reason}`)
		if (parseFailures.length) {
			console.log(`[refui-audit] Syntax coverage incomplete: ${parseFailures.length} files could not be parsed.`)
			for (const failure of parseFailures.slice(0, 10)) {
				console.log(`- ${path.relative(root, failure.filePath)} ${failure.error.trim().split('\n')[0]}`)
			}
		}
		console.log('[refui-audit] Findings are advisory. Intentional eager children and guarded or convergent signal updates are valid; preserve an understood design.')
	}
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

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
	main().catch((error) => {
		console.error(`[refui-audit] ${error?.stack || error}`)
		process.exitCode = 1
	})
}
