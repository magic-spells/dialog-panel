import globals from 'globals';
import pluginJs from '@eslint/js';

/** @type {import('eslint').Linter.Config[]} */
export default [
	{
		// Ignore patterns
		ignores: ['**/dist/', '**/demo/*.js', '**/node_modules/'],
	},
	{
		// Source files
		files: ['src/**/*.js'],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.es2024,
			},
			ecmaVersion: 2024,
			sourceType: 'module',
		},
		...pluginJs.configs.recommended,
	},
	{
		// Build config files
		files: ['rollup.config.mjs'],
		languageOptions: {
			globals: {
				...globals.node, // This adds node globals including 'process'
				...globals.es2024,
				process: true,
			},
			ecmaVersion: 2024,
			sourceType: 'module',
		},
	},
];
