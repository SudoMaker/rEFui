export const hasNodeEnv = (function() {
	try {
		return !!process.env.NODE_ENV
	} catch (e) {
		return false
	}
})()

export const isProduction = !hasNodeEnv || hasNodeEnv && process.env.NODE_ENV === 'production'
