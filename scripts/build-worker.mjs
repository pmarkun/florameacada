import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';

const type = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.png':'image/png',
  '.webp':'image/webp', '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8'
};
const root = new URL('../dist/', import.meta.url);
const paths = await readdir(root, {withFileTypes:true});
const assets = {};
for (const part of paths) {
  if (!part.isFile()) continue;
  const suffix = part.name.slice(part.name.lastIndexOf('.'));
  if (!type[suffix]) continue;
  const bytes = await readFile(new URL(part.name, root));
  assets['/' + part.name] = [type[suffix], bytes.toString('base64')];
}
const catalogue = JSON.parse(await readFile(new URL('catalogo.json', root), 'utf8'));
if (catalogue.length !== 3730 || !assets['/index.html']) throw new Error('Catálogo incompleto.');
const {taxons} = JSON.parse(await readFile(new URL('botanica.json', root), 'utf8'));
const plants = catalogue.map(([id, name, family, risk]) => {
  const profile = taxons[id];
  return [id, {name, family, risk, popular:profile?.popular, habit:profile?.habito, domains:profile?.dominios}];
});
const code = await readFile(new URL('../worker/index.mjs', import.meta.url), 'utf8');
const output = new URL('server/', root);
await mkdir(output,{recursive:true});
await writeFile(new URL('index.js', output), 'const assets = ' + JSON.stringify(assets) + ';\n' +
  'const plants = new Map(' + JSON.stringify(plants) + ');\n' + code);
