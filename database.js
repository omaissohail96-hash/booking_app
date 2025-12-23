const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
  constructor() {
    // Use /tmp directory for Vercel serverless functions
    const dbDir = process.env.VERCEL ? '/tmp' : __dirname;
    const dbPath = path.join(dbDir, 'bookings.db');
    
    // Ensure directory exists
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        console.log('Connected to SQLite database at:', dbPath);
        if (process.env.VERCEL) {
          console.warn('⚠️  Running on Vercel: Database will reset on each deployment!');
        }
        this.initializeTables();
      }
    });
  }

  initializeTables() {
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

    const createCompletedBookingsTable = `
      CREATE TABLE IF NOT EXISTS completed_bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_booking_id INTEGER NOT NULL,
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
        notes TEXT,
        booked_at DATETIME,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createCancelledBookingsTable = `
      CREATE TABLE IF NOT EXISTS cancelled_bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_booking_id INTEGER NOT NULL,
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
        notes TEXT,
        booked_at DATETIME,
        cancelled_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.db.run(createBookingsTable, (err) => {
      if (err) {
        console.error('Error creating bookings table:', err);
      } else {
        console.log('Bookings table ready');
      }
    });

    this.db.run(createCompletedBookingsTable, (err) => {
      if (err) {
        console.error('Error creating completed_bookings table:', err);
      } else {
        console.log('Completed bookings table ready');
      }
    });

    this.db.run(createCancelledBookingsTable, (err) => {
      if (err) {
        console.error('Error creating cancelled_bookings table:', err);
      } else {
        console.log('Cancelled bookings table ready');
      }
    });
  }

  // Get all bookings
  getAllBookings() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM bookings ORDER BY booking_date, booking_time',
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Get bookings for a specific date
  getBookingsByDate(date) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM bookings WHERE booking_date = ? ORDER BY booking_time',
        [date],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Get anchor booking for a specific date
  getAnchorBooking(date) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM bookings WHERE booking_date = ? AND is_anchor = 1',
        [date],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  // Create a new booking
  createBooking(booking) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO bookings (
          customer_name, customer_phone, customer_email, address,
          latitude, longitude, booking_date, booking_time, service_type,
          distance_from_lowell, travel_time_from_lowell,
          is_anchor, distance_from_anchor, travel_time_from_anchor,
          status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(
        sql,
        [
          booking.customer_name,
          booking.customer_phone || null,
          booking.customer_email || null,
          booking.address,
          booking.latitude,
          booking.longitude,
          booking.booking_date,
          booking.booking_time,
          booking.service_type || 'standard',
          booking.distance_from_lowell,
          booking.travel_time_from_lowell,
          booking.is_anchor ? 1 : 0,
          booking.distance_from_anchor || null,
          booking.travel_time_from_anchor || null,
          booking.status || 'confirmed',
          booking.notes || null
        ],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, ...booking });
        }
      );
    });
  }

  // Update a booking
  updateBooking(id, booking) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE bookings 
        SET customer_name = ?, customer_phone = ?, customer_email = ?,
            address = ?, latitude = ?, longitude = ?,
            booking_date = ?, booking_time = ?, service_type = ?,
            status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      this.db.run(
        sql,
        [
          booking.customer_name,
          booking.customer_phone,
          booking.customer_email,
          booking.address,
          booking.latitude,
          booking.longitude,
          booking.booking_date,
          booking.booking_time,
          booking.service_type,
          booking.status,
          booking.notes,
          id
        ],
        (err) => {
          if (err) reject(err);
          else resolve({ id, ...booking });
        }
      );
    });
  }

  // Delete a booking
  deleteBooking(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM bookings WHERE id = ?', [id], (err) => {
        if (err) reject(err);
        else resolve({ deleted: true });
      });
    });
  }

  // Get bookings within a date range
  getBookingsByDateRange(startDate, endDate) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM bookings WHERE booking_date >= ? AND booking_date <= ? ORDER BY booking_date, booking_time',
        [startDate, endDate],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Cancel a booking (move to cancelled_bookings table)
  cancelBooking(id) {
    return new Promise(async (resolve, reject) => {
      try {
        // Get the booking
        const booking = await this.getBookingById(id);
        if (!booking) {
          reject(new Error('Booking not found'));
          return;
        }

        // Insert into cancelled_bookings
        const sql = `
          INSERT INTO cancelled_bookings (
            original_booking_id, customer_name, customer_phone, customer_email,
            address, latitude, longitude, booking_date, booking_time,
            service_type, distance_from_lowell, travel_time_from_lowell,
            is_anchor, distance_from_anchor, travel_time_from_anchor,
            notes, booked_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        this.db.run(
          sql,
          [
            booking.id,
            booking.customer_name,
            booking.customer_phone,
            booking.customer_email,
            booking.address,
            booking.latitude,
            booking.longitude,
            booking.booking_date,
            booking.booking_time,
            booking.service_type,
            booking.distance_from_lowell,
            booking.travel_time_from_lowell,
            booking.is_anchor ? 1 : 0,
            booking.distance_from_anchor,
            booking.travel_time_from_anchor,
            booking.notes,
            booking.created_at
          ],
          (err) => {
            if (err) {
              reject(err);
            } else {
              // Delete from bookings table
              this.db.run('DELETE FROM bookings WHERE id = ?', [id], (delErr) => {
                if (delErr) reject(delErr);
                else resolve({ cancelled: true, booking });
              });
            }
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  // Get a single booking by ID
  getBookingById(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM bookings WHERE id = ?',
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  // Complete a booking (move to completed_bookings table)
  completeBooking(id) {
    return new Promise(async (resolve, reject) => {
      try {
        // Get the booking
        const booking = await this.getBookingById(id);
        if (!booking) {
          reject(new Error('Booking not found'));
          return;
        }

        // Insert into completed_bookings
        const sql = `
          INSERT INTO completed_bookings (
            original_booking_id, customer_name, customer_phone, customer_email,
            address, latitude, longitude, booking_date, booking_time,
            service_type, distance_from_lowell, travel_time_from_lowell,
            is_anchor, distance_from_anchor, travel_time_from_anchor,
            notes, booked_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        this.db.run(
          sql,
          [
            booking.id,
            booking.customer_name,
            booking.customer_phone,
            booking.customer_email,
            booking.address,
            booking.latitude,
            booking.longitude,
            booking.booking_date,
            booking.booking_time,
            booking.service_type,
            booking.distance_from_lowell,
            booking.travel_time_from_lowell,
            booking.is_anchor ? 1 : 0,
            booking.distance_from_anchor,
            booking.travel_time_from_anchor,
            booking.notes,
            booking.created_at
          ],
          (err) => {
            if (err) {
              reject(err);
            } else {
              // Delete from bookings table
              this.db.run('DELETE FROM bookings WHERE id = ?', [id], (delErr) => {
                if (delErr) reject(delErr);
                else resolve({ completed: true, booking });
              });
            }
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  // Get all completed bookings
  getAllCompletedBookings() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM completed_bookings ORDER BY completed_at DESC',
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Get completed bookings for a specific date
  getCompletedBookingsByDate(date) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM completed_bookings WHERE booking_date = ? ORDER BY booking_time',
        [date],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Get all cancelled bookings
  getAllCancelledBookings() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM cancelled_bookings ORDER BY cancelled_at DESC',
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Get cancelled bookings for a specific date
  getCancelledBookingsByDate(date) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM cancelled_bookings WHERE booking_date = ? ORDER BY booking_time',
        [date],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = new Database();
