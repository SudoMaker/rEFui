import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function collectMarkdownFiles(directory) {
	const files = []
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		if (entry.isDirectory() && entry.name.startsWith('.')) continue
		const absolute = path.join(directory, entry.name)
		if (entry.isDirectory()) {
			files.push(...collectMarkdownFiles(absolute))
		} else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
			files.push(absolute)
		}
	}
	return files
}

const documentationFiles = ['README.md', ...collectMarkdownFiles('docs/pages')]

test('local documentation links resolve to existing files', function () {
	const broken = []

	for (const file of documentationFiles) {
		const source = fs.readFileSync(file, 'utf8')
		for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
			const target = match[1].split('#')[0]
			if (!target || /^(?:https?:|mailto:)/.test(target)) continue

			const absolute = path.resolve(path.dirname(file), target)
			if (!fs.existsSync(absolute)) {
				const line = source.slice(0, match.index).split('\n').length
				broken.push(`${file}:${line} -> ${match[1]}`)
			}
		}
	}

	assert.deepEqual(broken, [])
})

test('documentation has balanced code fences and no stray carriage returns', function () {
	const invalid = []

	for (const file of documentationFiles) {
		const source = fs.readFileSync(file, 'utf8')
		const fenceCount = source.match(/^```/gm)?.length ?? 0
		if (fenceCount % 2) invalid.push(`${file}: unbalanced code fences`)
		if (source.includes('\r')) invalid.push(`${file}: contains a carriage return`)
	}

	assert.deepEqual(invalid, [])
})
