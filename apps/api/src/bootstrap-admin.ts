import { createDatabase, migrateDatabase } from '@tscms/database';
import { bootstrapAdmin } from './iam.service.js';

const email = process.env.TSCMS_ADMIN_EMAIL;
const password = process.env.TSCMS_ADMIN_PASSWORD;
const login = process.env.TSCMS_ADMIN_LOGIN ?? 'admin';
const name = process.env.TSCMS_ADMIN_NAME ?? 'Administrador';

if (!process.env.DATABASE_URL || !email || !password) {
  console.error('Defina DATABASE_URL, TSCMS_ADMIN_EMAIL e TSCMS_ADMIN_PASSWORD. A senha não tem valor padrão.');
  process.exit(1);
}

const database = createDatabase(process.env.DATABASE_URL);
await migrateDatabase(database.db);
const result = await bootstrapAdmin(database.db, { email, password, login, name });
console.log(result.created ? 'Administrador global criado. Entre com a senha informada.' : 'O administrador global já existe. Nada foi alterado.');
await database.pool.end();
