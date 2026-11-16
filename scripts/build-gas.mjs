// Post-build step: inline the Vite-bundled JS + CSS into the Apps Script
// HTMLService template (apps-script/index.template.html) and write the final
// apps-script/Index.html that clasp pushes to Google.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(root, 'dist', 'assets');
const templatePath = join(root, 'apps-script', 'index.template.html');
const outPath = join(root, 'apps-script', 'Index.html');

if (!existsSync(join(root, 'dist'))) {
  console.error('dist/ not found — run "vite build" first.');
  process.exit(1);
}

let js = '';
let css = '';
if (existsSync(assetsDir)) {
  for (const f of readdirSync(assetsDir)) {
    const full = join(assetsDir, f);
    if (!statSync(full).isFile()) continue;
    if (f.endsWith('.js')) js += readFileSync(full, 'utf8') + '\n';
    else if (f.endsWith('.css')) css += readFileSync(full, 'utf8') + '\n';
  }
}

if (!js) {
  console.error('No JS bundle found in dist/assets — did the build succeed?');
  process.exit(1);
}

// Guard against prematurely closing the inline <script> block.
if (js.includes('</script>')) js = js.replace(/<\/script>/gi, '<\\/script>');
// Guard against HTMLService scriptlet confusion (<?...?>).
if (/<\?/.test(js)) js = js.replace(/<\?/g, '<\\u003f');

const template = readFileSync(templatePath, 'utf8');
const out = template
  .replace('/*__APP_CSS__*/', () => css)
  .replace('/*__APP_JS__*/', () => js);

writeFileSync(outPath, out);
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`Wrote ${outPath}`);
console.log(`  JS:  ${kb(Buffer.byteLength(js))}`);
console.log(`  CSS: ${kb(Buffer.byteLength(css))}`);
console.log(`  Total HTML: ${kb(Buffer.byteLength(out))}`);
