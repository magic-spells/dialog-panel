const EMPTY_MODULE = 'data:text/javascript,export default undefined';

/**
 * Module resolution hook that maps any `.css` specifier to an empty module.
 * The component imports its own stylesheet at the top of the file and Node
 * cannot parse CSS.
 */
const resolve = (specifier, context, nextResolve) => {
	if (specifier.endsWith('.css')) {
		return {
			shortCircuit: true,
			url: EMPTY_MODULE,
		};
	}

	return nextResolve(specifier, context);
};

export { resolve };
