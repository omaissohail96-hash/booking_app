const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'bookings.db');
const db = new sqlite3.Database(dbPath);

console.log('Initializing database...');

db.serialize(() => {
  // Drop existing table if you want a fresh start
  // db.run('DROP TABLE IF EXISTS bookings');

  const createBookingsTable = `
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      customer_email TEXT,
      address TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      booking_date TEXT NOT NULL,
      booking_time TEXT NOT NULL,
      service_type TEXT DEFAULT 'standard',
      distance_from_lowell REAL NOT NULL,
      travel_time_from_lowell INTEGER NOT NULL,
      is_anchor BOOLEAN DEFAULT 0,
      distance_from_anchor REAL,
      travel_time_from_anchor INTEGER,
      status TEXT DEFAULT 'confirmed',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.run(createBookingsTable, (err) => {
    if (err) {
      console.error('Error creating table:', err);
    } else {
      console.log('✓ Bookings table created successfully');
    }
  });
});

db.close((err) => {
  if (err) {
    console.error('Error closing database:', err);
  } else {
    console.log('Database initialization complete!');
  }
});
