const { Pool } = require('pg');
const { neonConfig } = require('@neondatabase/serverless');

neonConfig.fetchConnectionCache = true;

class Database {
  constructor() {
    this.connectionString = process.env.DATABASE_URL;
    if (!this.connectionString) {
      throw new Error('DATABASE_URL is not set. Please configure your Neon connection string.');
    }
    this.pool = new Pool({
      connectionString: this.connectionString,
      ssl: { rejectUnauthorized: false }
    });
    this.ready = this.initializeTables();
  }

  async initializeTables() {
    const createBookingsTable = `
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        customer_name TEXT NOT NULL,
        customer_phone TEXT,
        customer_email TEXT,
        address TEXT NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        booking_date DATE NOT NULL,
        booking_time TEXT NOT NULL,
        service_type TEXT DEFAULT 'standard',
        distance_from_lowell DOUBLE PRECISION NOT NULL,
        travel_time_from_lowell INTEGER NOT NULL,
        is_anchor BOOLEAN DEFAULT FALSE,
        distance_from_anchor DOUBLE PRECISION,
        travel_time_from_anchor INTEGER,
        status TEXT DEFAULT 'confirmed',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    const createCompletedBookingsTable = `
      CREATE TABLE IF NOT EXISTS completed_bookings (
        id SERIAL PRIMARY KEY,
        original_booking_id INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT,
        customer_email TEXT,
        address TEXT NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        booking_date DATE NOT NULL,
        booking_time TEXT NOT NULL,
        service_type TEXT DEFAULT 'standard',
        distance_from_lowell DOUBLE PRECISION NOT NULL,
        travel_time_from_lowell INTEGER NOT NULL,
        is_anchor BOOLEAN DEFAULT FALSE,
        distance_from_anchor DOUBLE PRECISION,
        travel_time_from_anchor INTEGER,
        notes TEXT,
        booked_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    const createCancelledBookingsTable = `
      CREATE TABLE IF NOT EXISTS cancelled_bookings (
        id SERIAL PRIMARY KEY,
        original_booking_id INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT,
        customer_email TEXT,
        address TEXT NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        booking_date DATE NOT NULL,
        booking_time TEXT NOT NULL,
        service_type TEXT DEFAULT 'standard',
        distance_from_lowell DOUBLE PRECISION NOT NULL,
        travel_time_from_lowell INTEGER NOT NULL,
        is_anchor BOOLEAN DEFAULT FALSE,
        distance_from_anchor DOUBLE PRECISION,
        travel_time_from_anchor INTEGER,
        notes TEXT,
        booked_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings (booking_date);',
      'CREATE INDEX IF NOT EXISTS idx_completed_bookings_date ON completed_bookings (booking_date);',
      'CREATE INDEX IF NOT EXISTS idx_cancelled_bookings_date ON cancelled_bookings (booking_date);'
    ];

    await this.pool.query(createBookingsTable);
    await this.pool.query(createCompletedBookingsTable);
    await this.pool.query(createCancelledBookingsTable);

    for (const statement of createIndexes) {
      await this.pool.query(statement);
    }
  }

  async query(text, params = []) {
    await this.ready;
    return this.pool.query(text, params);
  }

  async getAllBookings() {
    const { rows } = await this.query('SELECT * FROM bookings ORDER BY booking_date, booking_time');
    return rows;
  }

  async getBookingsByDate(date) {
    const { rows } = await this.query('SELECT * FROM bookings WHERE booking_date = $1 ORDER BY booking_time', [date]);
    return rows;
  }

  async getBookingsByDateRange(startDate, endDate) {
    const { rows } = await this.query(
      'SELECT * FROM bookings WHERE booking_date >= $1 AND booking_date <= $2 ORDER BY booking_date, booking_time',
      [startDate, endDate]
    );
    return rows;
  }

  async getAnchorBooking(date) {
    const { rows } = await this.query('SELECT * FROM bookings WHERE booking_date = $1 AND is_anchor = TRUE', [date]);
    return rows[0] || null;
  }

  async createBooking(booking) {
    const insertSql = `
      INSERT INTO bookings (
        customer_name, customer_phone, customer_email, address,
        latitude, longitude, booking_date, booking_time, service_type,
        distance_from_lowell, travel_time_from_lowell,
        is_anchor, distance_from_anchor, travel_time_from_anchor,
        status, notes
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9,
        $10, $11,
        $12, $13, $14,
        $15, $16
      )
      RETURNING *;
    `;

    const values = [
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
      Boolean(booking.is_anchor),
      booking.distance_from_anchor || null,
      booking.travel_time_from_anchor || null,
      booking.status || 'confirmed',
      booking.notes || null
    ];

    const { rows } = await this.query(insertSql, values);
    return rows[0];
  }

  async updateBooking(id, booking) {
    const updateSql = `
      UPDATE bookings
      SET customer_name = $1,
          customer_phone = $2,
          customer_email = $3,
          address = $4,
          latitude = $5,
          longitude = $6,
          booking_date = $7,
          booking_time = $8,
          service_type = $9,
          status = $10,
          notes = $11,
          updated_at = NOW()
      WHERE id = $12
      RETURNING *;
    `;

    const values = [
      booking.customer_name,
      booking.customer_phone || null,
      booking.customer_email || null,
      booking.address,
      booking.latitude,
      booking.longitude,
      booking.booking_date,
      booking.booking_time,
      booking.service_type || 'standard',
      booking.status || 'confirmed',
      booking.notes || null,
      id
    ];

    const { rows } = await this.query(updateSql, values);
    return rows[0];
  }

  async deleteBooking(id) {
    const { rowCount } = await this.query('DELETE FROM bookings WHERE id = $1', [id]);
    return { deleted: rowCount > 0 };
  }

  async getBookingById(id) {
    const { rows } = await this.query('SELECT * FROM bookings WHERE id = $1', [id]);
    return rows[0] || null;
  }

  async cancelBooking(id) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const bookingResult = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [id]);
      const booking = bookingResult.rows[0];
      if (!booking) throw new Error('Booking not found');

      const insertSql = `
        INSERT INTO cancelled_bookings (
          original_booking_id, customer_name, customer_phone, customer_email,
          address, latitude, longitude, booking_date, booking_time,
          service_type, distance_from_lowell, travel_time_from_lowell,
          is_anchor, distance_from_anchor, travel_time_from_anchor,
          notes, booked_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15,
          $16, $17
        );
      `;

      const values = [
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
        booking.is_anchor,
        booking.distance_from_anchor,
        booking.travel_time_from_anchor,
        booking.notes,
        booking.created_at
      ];

      await client.query(insertSql, values);
      await client.query('DELETE FROM bookings WHERE id = $1', [id]);
      await client.query('COMMIT');
      return { cancelled: true, booking };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async completeBooking(id) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const bookingResult = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [id]);
      const booking = bookingResult.rows[0];
      if (!booking) throw new Error('Booking not found');

      const insertSql = `
        INSERT INTO completed_bookings (
          original_booking_id, customer_name, customer_phone, customer_email,
          address, latitude, longitude, booking_date, booking_time,
          service_type, distance_from_lowell, travel_time_from_lowell,
          is_anchor, distance_from_anchor, travel_time_from_anchor,
          notes, booked_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15,
          $16, $17
        );
      `;

      const values = [
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
        booking.is_anchor,
        booking.distance_from_anchor,
        booking.travel_time_from_anchor,
        booking.notes,
        booking.created_at
      ];

      await client.query(insertSql, values);
      await client.query('DELETE FROM bookings WHERE id = $1', [id]);
      await client.query('COMMIT');
      return { completed: true, booking };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getAllCompletedBookings() {
    const { rows } = await this.query('SELECT * FROM completed_bookings ORDER BY completed_at DESC');
    return rows;
  }

  async getCompletedBookingsByDate(date) {
    const { rows } = await this.query('SELECT * FROM completed_bookings WHERE booking_date = $1 ORDER BY booking_time', [date]);
    return rows;
  }

  async getAllCancelledBookings() {
    const { rows } = await this.query('SELECT * FROM cancelled_bookings ORDER BY cancelled_at DESC');
    return rows;
  }

  async getCancelledBookingsByDate(date) {
    const { rows } = await this.query('SELECT * FROM cancelled_bookings WHERE booking_date = $1 ORDER BY booking_time', [date]);
    return rows;
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = new Database();
