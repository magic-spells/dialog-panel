import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import serve from 'rollup-plugin-serve';
import copy from 'rollup-plugin-copy';
import postcss from 'rollup-plugin-postcss';

const dev = process.env.ROLLUP_WATCH;

// Shared CSS plugin config to avoid duplicate processing
const cssPlugin = postcss({
	extract: 'dialog-panel.min.css',
	minimize: true,
});

export default [
	// ESM build
	{
		input: 'src/dialog-panel.js',
		output: {
			file: 'dist/dialog-panel.esm.js',
			format: 'es',
			sourcemap: true,
		},
		plugins: [resolve(), cssPlugin],
	},
	// CommonJS build
	{
		input: 'src/dialog-panel.js',
		output: {
			file: 'dist/dialog-panel.cjs.js',
			format: 'cjs',
			sourcemap: true,
			exports: 'named',
		},
		plugins: [resolve(), cssPlugin],
	},
	// Minified IIFE for browsers
	{
		input: 'src/dialog-panel.js',
		output: {
			file: 'dist/dialog-panel.min.js',
			format: 'iife',
			name: 'DialogPanel',
			sourcemap: false,
		},
		plugins: [
			resolve(),
			cssPlugin,
			terser({
				keep_classnames: true,
				format: {
					comments: false,
				},
			}),
		],
	},
	// Development build
	...(dev
		? [
				{
					input: 'src/dialog-panel.js',
					output: {
						file: 'dist/dialog-panel.esm.js',
						format: 'es',
						sourcemap: true,
					},
					plugins: [
						resolve(),
						cssPlugin,
						serve({
							contentBase: ['dist', 'demo'],
							open: true,
							port: 3000,
						}),
						copy({
							targets: [
								{ src: 'dist/dialog-panel.esm.js', dest: 'demo' },
								{ src: 'dist/dialog-panel.esm.js.map', dest: 'demo' },
								{ src: 'dist/dialog-panel.min.css', dest: 'demo' },
							],
							hook: 'writeBundle',
						}),
					],
				},
			]
		: []),
];
