import { createDatabase, migrateDatabase } from './client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL é obrigatória para migrar.');
}

const { db, pool } = createDatabase(connectionString);
await migrateDatabase(db);
await pool.end();
console.log('Migrações aplicadas.');
