export const hasNodeEnv = /*#__PURE__*/(function() {
	try {
		return !!process.env.NODE_ENV
	} catch (e) {
		return false
	}
})()

export const isProduction = import.meta.env?.PROD || (!hasNodeEnv || (hasNodeEnv && process.env.NODE_ENV === 'production'))
