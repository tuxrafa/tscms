import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createDatabase, type Database } from '@tscms/database';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly db: Database;
  readonly pool: ReturnType<typeof createDatabase>['pool'];

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL é obrigatória.');
    const created = createDatabase(connectionString);
    this.db = created.db;
    this.pool = created.pool;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
