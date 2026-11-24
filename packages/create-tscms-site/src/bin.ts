#!/usr/bin/env node
import { createSiteProject } from './index.js';

const name = process.argv[2];
if (!name) {
  console.error('Uso: pnpm create tscms-site <diretorio>');
  process.exit(1);
}
const siteId = name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
const destination = await createSiteProject(name, siteId);
console.log(`Site criado em ${destination}. Inicialize um Git separado e não versione este diretório dentro do CMS.`);
