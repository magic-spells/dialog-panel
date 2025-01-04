import globals from 'globals';
import pluginJs from '@eslint/js';

/** @type {import('eslint').Linter.Config[]} */
export default [
	{
		// Source files
		files: ['src/**/*.js'],
		languageOptions: {
			globals: globals.browser,
		},
		...pluginJs.configs.recommended,
	},
	{
		// Build config files
		files: ['rollup.config.mjs'],
		languageOptions: {
			globals: {
				...globals.node, // This adds node globals including 'process'
				process: true,
			},
		},
	},
];
