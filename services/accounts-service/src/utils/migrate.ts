import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, client } from './db';

async function runMigrations() {
  console.log('Running migrations for Accounts Service...');
  
  try {
    await migrate(db, { migrationsFolder: './drizzle/migrations' });
    console.log(' Accounts Service migrations completed successfully!');
  } catch (error) {
    console.error(' Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations();
}

export { runMigrations };
