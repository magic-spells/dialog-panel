import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import serve from 'rollup-plugin-serve';
import copy from 'rollup-plugin-copy';
import postcss from 'rollup-plugin-postcss';

const dev = process.env.ROLLUP_WATCH;
const name = 'dialog-panel';

// External dependencies that should not be bundled
const external = ['@magic-spells/focus-trap'];

// Shared CSS/SCSS plugin config
const cssPlugin = postcss({
	extract: `${name}.css`,
	minimize: false,
	sourceMap: dev,
	extensions: ['.scss', '.css'],
	use: ['sass'],
});

// Shared CSS/SCSS plugin config (minimized version)
const cssMinPlugin = postcss({
	extract: `${name}.min.css`,
	minimize: true,
	sourceMap: dev,
	extensions: ['.scss', '.css'],
	use: ['sass'],
});

// Shared copy plugin for SCSS files
const copyScssPlugin = copy({
	targets: [
		{ src: 'src/scss/*', dest: 'dist/scss' },
		{ src: 'src/index.scss', dest: 'dist', rename: `${name}.scss` },
	],
});

export default [
	// ESM build
	{
		input: 'src/dialog-panel.js',
		external,
		output: {
			file: `dist/${name}.esm.js`,
			format: 'es',
			sourcemap: true,
		},
		plugins: [resolve(), cssPlugin, copyScssPlugin],
	},
	// CommonJS build
	{
		input: 'src/dialog-panel.js',
		external,
		output: {
			file: `dist/${name}.cjs.js`,
			format: 'cjs',
			sourcemap: true,
			exports: 'named',
		},
		plugins: [resolve(), cssPlugin],
	},
	// UMD build (includes all dependencies for standalone use)
	{
		input: 'src/dialog-panel.js',
		output: {
			file: `dist/${name}.js`,
			format: 'umd',
			name: 'DialogPanel',
			sourcemap: true,
		},
		plugins: [resolve(), cssPlugin],
	},
	// Minified UMD for browsers
	{
		input: 'src/dialog-panel.js',
		output: {
			file: `dist/${name}.min.js`,
			format: 'umd',
			name: 'DialogPanel',
			sourcemap: false,
		},
		plugins: [
			resolve(),
			cssMinPlugin,
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
						file: `dist/${name}.esm.js`,
						format: 'es',
						sourcemap: true,
					},
					plugins: [
						resolve(),
						cssMinPlugin,
						serve({
							contentBase: ['dist', 'demo'],
							open: true,
							port: 3000,
						}),
						copy({
							targets: [
								{
									src: `dist/${name}.esm.js`,
									dest: 'demo',
								},
								{
									src: `dist/${name}.esm.js.map`,
									dest: 'demo',
								},
								{
									src: `dist/${name}.min.css`,
									dest: 'demo',
								},
							],
							hook: 'writeBundle',
						}),
					],
				},
			]
		: []),
];
