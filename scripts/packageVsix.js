const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const outputDir = path.join(root, 'out');
const outputFile = path.join(outputDir, `${manifest.name}-${manifest.version}.vsix`);

fs.mkdirSync(outputDir, { recursive: true });

if (fs.existsSync(outputFile)) {
  fs.rmSync(outputFile);
}

const binName = process.platform === 'win32' ? 'vsce.cmd' : 'vsce';
const vsceBin = path.join(root, 'node_modules', '.bin', binName);

if (!fs.existsSync(vsceBin)) {
  console.error('Could not find the local vsce binary. Run `npm install` first.');
  process.exit(1);
}

const result = spawnSync(vsceBin, [
  'package',
  '--no-dependencies',
  '--out',
  outputFile
], {
  cwd: root,
  stdio: 'inherit'
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Packaged ${path.relative(root, outputFile).replaceAll(path.sep, '/')}`);
