import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export function createDatabase(connectionString: string): { db: Database; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export async function migrateDatabase(db: Database): Promise<void> {
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const here = path.dirname(fileURLToPath(import.meta.url));
  await migrate(db, { migrationsFolder: path.resolve(here, '../migrations') });
}
