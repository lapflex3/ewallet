const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist', 'html5-portable');

function rm(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}

function cp(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((name) => {
      cp(path.join(src, name), path.join(dest, name));
    });
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

rm(out);
fs.mkdirSync(out, { recursive: true });

cp(path.join(root, 'public'), path.join(out, 'public'));
cp(path.join(root, 'src'), path.join(out, 'src'));
cp(path.join(root, 'data'), path.join(out, 'data'));
cp(path.join(root, 'desktop'), path.join(out, 'desktop'));
cp(path.join(root, 'README.md'), path.join(out, 'README.md'));
cp(path.join(root, '.gitignore'), path.join(out, '.gitignore'));

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const portablePkg = {
  name: pkg.name,
  version: pkg.version,
  private: true,
  main: 'src/server.js',
  scripts: {
    start: 'node src/server.js'
  },
  dependencies: {
    cors: pkg.dependencies.cors,
    express: pkg.dependencies.express
  }
};

fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify(portablePkg, null, 2));

const readmePortable = [
  '# HTML5 Portable Build',
  '',
  'Portable package untuk web app (Node.js diperlukan).',
  '',
  '## Run',
  '',
  '```bash',
  'cd dist/html5-portable',
  'npm install',
  'npm start',
  '```',
  '',
  'Buka: http://127.0.0.1:3000'
].join('\n');

fs.writeFileSync(path.join(out, 'PORTABLE.md'), readmePortable);
console.log(`Built HTML5 portable at: ${out}`);
