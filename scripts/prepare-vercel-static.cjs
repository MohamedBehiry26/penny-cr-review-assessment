const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'dist', 'cr-review');
const output = path.join(root, '.vercel-static', '.vercel', 'output');
const staticFiles = path.join(output, 'static');

if (!fs.existsSync(path.join(source, 'index.html'))) {
	throw new Error('Missing dist/cr-review/index.html. Run npm run build first.');
}

// Replace generated assets only; retain the staging directory's Vercel project link.
fs.rmSync(staticFiles, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(source, staticFiles, { recursive: true });
fs.writeFileSync(
	path.join(output, 'config.json'),
	JSON.stringify(
		{
			version: 3,
			routes: [{ handle: 'filesystem' }, { src: '/.*', dest: '/index.html' }],
		},
		null,
		2,
	) + '\n',
);

console.log('Prepared .vercel-static/.vercel/output from dist/cr-review (static assets + SPA fallback).');
