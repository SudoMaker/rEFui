import Sitemap from 'vite-plugin-sitemap'

export default ({ mode }) => ({
	site: {
		name: 'rEFui Docs',
		repoBase: 'https://github.com/SudoMaker/rEFui/tree/main/docs/pages/'
	},
	publicDir: './assets',
	pagefind: true,
	pwa: true,
	vite: {
		plugins: [
			Sitemap({
				hostname: 'https://refui.sudomaker.com'
			})
		]
	}
})
