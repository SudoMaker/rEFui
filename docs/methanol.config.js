import { VitePWA } from 'vite-plugin-pwa'
import Sitemap from 'vite-plugin-sitemap'

export default ({ mode }) => ({
	site: {
		name: 'rEFui Docs',
		repoBase: 'https://github.com/SudoMaker/rEFui/tree/main/docs/pages/'
	},
	publicDir: './assets',
	starryNight: true,
	pagefind: true,
	vite: {
		plugins: [
			VitePWA({
				injectRegister: 'auto',
				registerType: 'autoUpdate',
				workbox: {
					globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
					navigateFallback: '/404.html',
					ignoreURLParametersMatching: [/./]
				}
			}),
			Sitemap({
				hostname: 'https://refui.sudomaker.com'
			})
		]
	}
})
