import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const targetBrowser = process.env.BROWSER_TARGET || 'chrome';
const outDir = targetBrowser === 'firefox' ? 'dist-firefox' : 'dist';

if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir('public', outDir);

// For Firefox MV3, customize manifest.json if needed
const manifestPath = path.join(outDir, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (targetBrowser === 'firefox') {
    manifest.browser_specific_settings = {
      gecko: {
        id: 'resource-guardian@example.com',
        strict_min_version: '109.0'
      }
    };
    manifest.background = {
      scripts: ['background/service-worker.js'],
      type: 'module'
    };
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

const entryPoints = [
  { in: 'src/background/service-worker.ts', out: 'background/service-worker' },
  { in: 'src/content/content-script.ts', out: 'content/content-script' },
  { in: 'src/popup/popup.ts', out: 'popup/popup' },
  { in: 'src/options/options.ts', out: 'options/options' }
];

async function build() {
  try {
    await esbuild.build({
      entryPoints,
      bundle: true,
      outdir: outDir,
      target: 'es2022',
      format: 'esm',
      sourcemap: false,
      minify: true,
      logLevel: 'info'
    });
    console.log(`Build completed successfully for ${targetBrowser} in ${outDir}/.`);
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

build();
