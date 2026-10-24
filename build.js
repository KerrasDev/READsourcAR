import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const outDir = 'dist';

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

copyDir('public', 'dist');

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
    console.log('Build completed successfully.');
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

build();
