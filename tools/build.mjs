// Build a single self-contained HTML file: dist/hush.html
//
// The game is plain ES modules for development, but opening index.html from
// disk (file://) fails because module scripts are blocked by CORS. Inlining
// every module into one <script type="module"> makes the game double-clickable
// with no server and no Python.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const DIST = path.join(ROOT, 'dist');

// Dependency order: every module only uses names declared above it.
const MODULES = [
  'src/util.js',
  'src/pathfind.js',
  'src/levelgen.js',
  'src/rooms.js',
  'src/maps.js',
  'src/worldgen.js',
  'src/entities.js',
  'src/input.js',
  'src/audio.js',
  'src/chambers.js',
  'src/loot.js',
  'src/desc.js',
  'src/render.js',
  'src/ui.js',
  'src/game.js',
  'src/main.js',
];

const IMPORT_RE = /^\s*import\s+[^;]*?from\s+['"][^'"]+['"];?\s*$/gm;
const EXPORT_RE = /^export\s+/gm;

function bundleModule(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const stripped = src.replace(IMPORT_RE, '').replace(EXPORT_RE, '');
  if (/^\s*(import|export)\b/m.test(stripped)) {
    throw new Error(file + ' still has import/export after stripping');
  }
  return '// ---- ' + file + ' ----\n' + stripped.trimEnd() + '\n';
}

const js = MODULES.map(bundleModule).join('\n');
const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const styleTag = /<link\s+rel="stylesheet"\s+href="style\.css"\s*\/?>/;
if (!styleTag.test(html)) throw new Error('style link tag not found');
html = html.replace(styleTag, () => '<style>\n' + css + '\n</style>');

const scriptTag = /<script\s+type="module"\s+src="src\/main\.js(?:\?[^"]*)?"><\/script>/;
if (!scriptTag.test(html)) throw new Error('main.js script tag not found');
const inline = js.replace(/<\/script>/gi, '<\\/script>');
html = html.replace(scriptTag, () => '<script type="module">\n' + inline + '\n</script>');

if (html.includes('src="src/main.js"') || html.includes('href="style.css"')) {
  throw new Error('external asset reference survived inlining');
}

fs.mkdirSync(DIST, { recursive: true });
const out = path.join(DIST, 'hush.html');
fs.writeFileSync(out, html);
const kb = (fs.statSync(out).size / 1024).toFixed(1);
console.log('built ' + path.relative(ROOT, out) + ' (' + kb + ' KB)');
