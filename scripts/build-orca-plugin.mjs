import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const root = process.cwd();
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

const result = await build({
  configFile: false,
  root,
  base: './',
  publicDir: false,
  envPrefix: 'SNOWFLAKE_ORCA_PUBLIC_',
  plugins: [
    react(),
    {
      name: 'orca-inline-csg-worker',
      enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('csgWorkerManager.ts')) {
          return code.replace("'./csg.worker.ts?worker'", "'./csg.worker.ts?worker&inline'");
        }
      },
    },
  ],
  define: { global: 'globalThis' },
  worker: { format: 'es', plugins: () => [react()] },
  build: {
    write: false,
    target: 'esnext',
    assetsInlineLimit: 10 * 1024 * 1024,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});

if (Array.isArray(result)) throw new Error('Expected one OrcaSlicer build');
const chunks = result.output.filter(item => item.type === 'chunk');
const styles = result.output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css'));
const otherAssets = result.output.filter(item => item.type === 'asset' && !item.fileName.endsWith('.css') && !item.fileName.endsWith('.html'));
if (chunks.length !== 1 || styles.length !== 1 || otherAssets.length !== 0) {
  throw new Error(`OrcaSlicer build must be self-contained: ${chunks.length} scripts, ${styles.length} stylesheets, ${otherAssets.length} extra assets`);
}

const bundle = Buffer.from(JSON.stringify({ js: chunks[0].code, css: styles[0].source })).toString('base64');
const compressed = gzipSync(bundle, { level: 9 }).toString('base64');
const template = await readFile(resolve(root, 'scripts', 'orca-plugin-template.py'), 'utf8');
const plugin = template.replace('__VERSION__', pkg.version).replace('__BUNDLE__', compressed);
const outDir = resolve(root, 'dist-orca');
await mkdir(outDir, { recursive: true });
const filename = 'snowflake_generator_orcaslicer.py';
await writeFile(resolve(outDir, filename), plugin, 'utf8');
console.log(`Created dist-orca/${filename}`);
