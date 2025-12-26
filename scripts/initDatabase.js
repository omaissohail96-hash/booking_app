const database = require('../database.pg');

(async () => {
  try {
    await database.ready;
    console.log('✓ Postgres schema initialized (Neon)');
    process.exit(0);
  } catch (error) {
    console.error('Failed to initialize database', error);
    process.exit(1);
  }
})();
