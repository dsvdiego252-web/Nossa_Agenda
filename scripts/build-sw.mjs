import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = dir + '/' + entry.name;
    if (entry.isDirectory()) await walk(path);
    else if (entry.name !== 'sw.js') files.push('/' + path.slice(5));
  }
}
await walk('dist');
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile('dist' + file));
const source = await readFile('src/sw-template.js', 'utf8');
await writeFile('dist/sw.js', source.replace('__CACHE_VERSION__', hash.digest('hex').slice(0, 12)).replace('__PRECACHE__', JSON.stringify(files)));
console.log('Service worker gerado com ' + files.length + ' arquivos.');

