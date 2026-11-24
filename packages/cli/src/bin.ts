#!/usr/bin/env node
import { doctor, planUpgrade, buildManifest } from './index.js';

const [command, sub, ...rest] = process.argv.slice(2);
const dryRun = rest.includes('--dry-run') || sub === '--dry-run';

function print(value: unknown) {
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

if (command === 'doctor') {
  const notes = await doctor(process.cwd());
  print(notes);
  process.exit(notes.some((note) => note.level === 'error') ? 1 : 0);
}

if (command === 'upgrade') {
  if (!dryRun) {
    console.error('Atualização de site exige --dry-run e confirmação explícita. Nenhum arquivo foi alterado.');
    process.exit(2);
  }
  print(planUpgrade());
  process.exit(0);
}

if (command === 'site' && sub === 'validate') {
  const notes = await doctor(process.cwd());
  print(notes);
  process.exit(notes.some((note) => note.level === 'error') ? 1 : 0);
}

if (command === 'components' && sub === 'sync') {
  print({ manifest: await buildManifest(process.cwd()), published: false, reason: 'Sem token. O manifesto ficou apenas no site.' });
  process.exit(0);
}

if (command === 'site' && ['build', 'preview', 'publish'].includes(sub ?? '')) {
  const manifest = await buildManifest(process.cwd());
  print({ command: `site ${sub}`, manifest, note: 'Build gera manifesto. CSS e scripts do site permanecem no repositório do site.' });
  process.exit(0);
}

console.error('Comandos: doctor | site validate | site build | site preview | site publish | components sync | upgrade --dry-run');
process.exit(1);
