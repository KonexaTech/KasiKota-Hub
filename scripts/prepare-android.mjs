import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
await mkdir('www', { recursive: true });
const source = await readFile('neon-staging.html', 'utf8');
const api = 'https://kota-connect-api-dev.siboniisozulu.workers.dev';
const output = source.replace(
  'new URLSearchParams(location.search).get("api") || ""',
  'new URLSearchParams(location.search).get("api") || "' + api + '"'
);
await writeFile('www/index.html', output);
await copyFile('icon-512.png', 'www/icon-512.png').catch(() => {});
