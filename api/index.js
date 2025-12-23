const express = require('express');
const database = require('../database');
const bookingValidator = require('../services/bookingValidator');
const config = require('../config');

const router = express.Router();

// Ensure JSON parsing middleware is applied to this router
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

function formatDate(dateObj) {
  return dateObj.toISOString().split('T')[0];
}

function normalizeDate(dateInput) {
  const date = dateInput instanceof Date ? new Date(dateInput) : new Date(`${dateInput}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function getWeekRange(baseDate) {
  const base = normalizeDate(baseDate) || new Date();
  const start = new Date(base);
  const weekday = start.getDay();
  const diff = weekday === 0 ? 6 : weekday - 1; // Monday-start week
  start.setDate(start.getDate() - diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function isWorkingDay(dateInput) {
  const date = normalizeDate(dateInput);
  if (!date) {
    return false;
  }
  const workingDays = Array.isArray(config.WORKING_DAYS) && config.WORKING_DAYS.length
    ? config.WORKING_DAYS
    : [0, 1, 2, 3, 4, 5, 6];
  return workingDays.includes(date.getDay());
}

/**
 * GET /bookings
 * Get all bookings
 */
router.get('/bookings', async (req, res) => {
  try {
    const bookings = await database.getAllBookings();
    res.json({ success: true, data: bookings });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch bookings' });
  }
});

/**
 * GET /bookings/date/:date
 * Get bookings for a specific date
 */
router.get('/bookings/date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const bookings = await database.getBookingsByDate(date);
    const stats = await bookingValidator.getDateStatistics(date);

    res.json({ success: true, data: bookings, stats });
  } catch (error) {
    console.error('Error fetching bookings for date:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch bookings for date' });
  }
});

/**
 * GET /bookings/range/:startDate/:endDate
 * Get bookings within a date range
 */
router.get('/bookings/range/:startDate/:endDate', async (req, res) => {
  try {
    const { startDate, endDate } = req.params;
    const bookings = await database.getBookingsByDateRange(startDate, endDate);

    res.json({ success: true, data: bookings });
  } catch (error) {
    console.error('Error fetching bookings for range:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch bookings for range' });
  }
});

/**
 * GET /bookings/week
 * Get bookings for the current week (Mon-Sun) or a specified weekStart
 */
router.get('/bookings/week', async (req, res) => {
  try {
    const baseDate = req.query.weekStart ? normalizeDate(req.query.weekStart) : new Date();
    if (!baseDate || Number.isNaN(baseDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid weekStart date' });
    }

    const { start, end } = getWeekRange(baseDate);
    const startStr = formatDate(start);
    const endStr = formatDate(end);

    const bookings = await database.getBookingsByDateRange(startStr, endStr);
    const grouped = bookings.reduce((acc, booking) => {
      if (!acc[booking.booking_date]) {
        acc[booking.booking_date] = [];
      }
      acc[booking.booking_date].push(booking);
      return acc;
    }, {});

    const days = [];
    const mapsService = require('../services/mapsService');

    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const dateStr = formatDate(date);
      const dayBookings = grouped[dateStr] || [];
      
      // Sort bookings by time
      dayBookings.sort((a, b) => a.booking_time.localeCompare(b.booking_time));
      
      const anchorBooking = dayBookings.find((b) => b.is_anchor);

      // Calculate travel time/distance between consecutive bookings
      const bookingsWithTravel = [];
      for (let j = 0; j < dayBookings.length; j++) {
        const booking = { ...dayBookings[j] };
        
        if (j > 0) {
          // Calculate distance from previous booking
          try {
            const prevAddress = dayBookings[j - 1].address;
            const currAddress = booking.address;
            const travelInfo = await mapsService.getDistanceAndTime(prevAddress, currAddress);
            
            booking.travel_from_previous = {
              distance: travelInfo.distance,
              duration: travelInfo.duration,
              distanceText: travelInfo.distanceText,
              durationText: travelInfo.durationText
            };
          } catch (error) {
            console.error('Error calculating travel between bookings:', error.message);
            booking.travel_from_previous = null;
          }
        }
        
        bookingsWithTravel.push(booking);
      }

      days.push({
        date: dateStr,
        label: date.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric'
        }),
        isWorkingDay: isWorkingDay(date),
        bookingCount: dayBookings.length,
        capacity: config.MAX_BOOKINGS_PER_DAY,
        isFull: dayBookings.length >= config.MAX_BOOKINGS_PER_DAY,
        hasAnchor: Boolean(anchorBooking),
        anchorAddress: anchorBooking ? anchorBooking.address : null,
        bookings: bookingsWithTravel
      });
    }

    res.json({
      success: true,
      data: {
        weekStart: startStr,
        weekEnd: endStr,
        days
      }
    });
  } catch (error) {
    console.error('Error fetching weekly bookings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch weekly bookings' });
  }
});

/**
 * POST /validate-booking
 * Validate a booking without creating it
 */
router.post('/validate-booking', async (req, res) => {
  try {
    const bookingRequest = req.body;

    if (!bookingRequest.address || !bookingRequest.booking_date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: address and booking_date'
      });
    }

    const validationResult = await bookingValidator.validateBooking(bookingRequest);

    res.json({ success: true, validation: validationResult });
  } catch (error) {
    console.error('Error validating booking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate booking',
      details: error.message
    });
  }
});

/**
 * POST /auto-schedule
 * Find the best date/time for a booking request
 */
router.get('/auto-schedule', (req, res) => {
  res.json({
    success: false,
    error: 'This endpoint expects a POST request with customer_name and address in the JSON body.',
    examplePayload: {
      customer_name: 'Test Client',
      address: '123 Main St, Nashua, NH',
      preferred_start_date: '2025-12-22'
    }
  });
});

router.post('/auto-schedule', async (req, res) => {
  try {
    // Enhanced logging
    console.log('=== AUTO-SCHEDULE REQUEST ===');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('Content-Type:', req.get('Content-Type'));
    console.log('Content-Length:', req.get('Content-Length'));
    
    const bookingRequest = req.body;

    // Check if body is empty or not parsed
    if (!bookingRequest || Object.keys(bookingRequest).length === 0) {
      console.warn('⚠️  Empty request body received');
      return res.status(400).json({
        success: false,
        error: 'Request body is empty. Please send JSON data with Content-Type: application/json',
        hint: 'Make sure to set Content-Type header to application/json and send valid JSON in the request body'
      });
    }

    // Validate required fields
    const missingFields = [];
    if (!bookingRequest.customer_name) missingFields.push('customer_name');
    if (!bookingRequest.address) missingFields.push('address');

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
        received: bookingRequest,
        required: ['customer_name', 'address'],
        optional: ['preferred_start_date', 'service_type', 'notes']
      });
    }

    const autoScheduleResult = await bookingValidator.autoScheduleBooking(bookingRequest);

    if (!autoScheduleResult.scheduled) {
      return res.status(400).json({
        success: false,
        autoSchedule: autoScheduleResult,
        error: autoScheduleResult.message
      });
    }

    res.json({ success: true, autoSchedule: autoScheduleResult });
  } catch (error) {
    console.error('Error auto-scheduling booking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to auto-schedule booking',
      details: error.message
    });
  }
});

/**
 * POST /bookings
 * Create a new booking
 */
router.post('/bookings', async (req, res) => {
  try {
    const bookingRequest = req.body;

    if (!bookingRequest.customer_name || !bookingRequest.address || !bookingRequest.booking_date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customer_name, address, booking_date'
      });
    }

    const validationResult = await bookingValidator.validateBooking(bookingRequest);

    if (!validationResult.valid) {
      return res.status(400).json({
        success: false,
        validation: validationResult,
        error: 'Booking validation failed'
      });
    }

    const newBooking = {
      customer_name: bookingRequest.customer_name,
      customer_phone: bookingRequest.customer_phone || null,
      customer_email: bookingRequest.customer_email || null,
      address: validationResult.geocode.formatted_address,
      latitude: validationResult.geocode.lat,
      longitude: validationResult.geocode.lng,
      booking_date: bookingRequest.booking_date,
      booking_time: bookingRequest.booking_time || '09:00',
      service_type: bookingRequest.service_type || 'standard',
      distance_from_lowell: validationResult.distanceFromLowell,
      travel_time_from_lowell: validationResult.travelTimeFromLowell,
      is_anchor: validationResult.isAnchor,
      distance_from_anchor: validationResult.distanceFromAnchor || null,
      travel_time_from_anchor: validationResult.travelTimeFromAnchor || null,
      status: 'confirmed',
      notes: bookingRequest.notes || null
    };

    const createdBooking = await database.createBooking(newBooking);

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: createdBooking,
      validation: validationResult
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create booking',
      details: error.message
    });
  }
});

/**
 * PUT /bookings/:id
 * Update a booking
 */
router.put('/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const updatedBooking = await database.updateBooking(id, updatedData);

    res.json({
      success: true,
      message: 'Booking updated successfully',
      data: updatedBooking
    });
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({ success: false, error: 'Failed to update booking' });
  }
});

/**
 * DELETE /bookings/:id
 * Delete a booking
 */
router.delete('/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await database.deleteBooking(id);

    res.json({ success: true, message: 'Booking deleted successfully' });
  } catch (error) {
    console.error('Error deleting booking:', error);
    res.status(500).json({ success: false, error: 'Failed to delete booking' });
  }
});

/**
 * PATCH /bookings/:id/cancel
 * Cancel a booking (move to cancelled_bookings table)
 */
router.patch('/bookings/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await database.cancelBooking(id);

    res.json({ 
      success: true, 
      message: 'Booking cancelled successfully',
      data: result
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to cancel booking',
      details: error.message
    });
  }
});

/**
 * POST /bookings/:id/complete
 * Complete a booking (move to completed_bookings table)
 */
router.post('/bookings/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await database.completeBooking(id);

    res.json({ 
      success: true, 
      message: 'Booking completed successfully',
      data: result
    });
  } catch (error) {
    console.error('Error completing booking:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to complete booking',
      details: error.message 
    });
  }
});

/**
 * GET /completed-bookings
 * Get all completed bookings
 */
router.get('/completed-bookings', async (req, res) => {
  try {
    const completedBookings = await database.getAllCompletedBookings();
    res.json({ success: true, data: completedBookings });
  } catch (error) {
    console.error('Error fetching completed bookings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch completed bookings' });
  }
});

/**
 * GET /completed-bookings/date/:date
 * Get completed bookings for a specific date
 */
router.get('/completed-bookings/date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const completedBookings = await database.getCompletedBookingsByDate(date);
    res.json({ success: true, data: completedBookings });
  } catch (error) {
    console.error('Error fetching completed bookings for date:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch completed bookings for date' });
  }
});

/**
 * GET /cancelled-bookings
 * Get all cancelled bookings
 */
router.get('/cancelled-bookings', async (req, res) => {
  try {
    const cancelledBookings = await database.getAllCancelledBookings();
    res.json({ success: true, data: cancelledBookings });
  } catch (error) {
    console.error('Error fetching cancelled bookings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch cancelled bookings' });
  }
});

/**
 * GET /cancelled-bookings/date/:date
 * Get cancelled bookings for a specific date
 */
router.get('/cancelled-bookings/date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const cancelledBookings = await database.getCancelledBookingsByDate(date);
    res.json({ success: true, data: cancelledBookings });
  } catch (error) {
    console.error('Error fetching cancelled bookings for date:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch cancelled bookings for date' });
  }
});

/**
 * GET /config
 * Get configuration settings
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    config: {
      BASE_LOCATION: config.BASE_LOCATION,
      MAX_SERVICE_RADIUS_MILES: config.MAX_SERVICE_RADIUS_MILES,
      MAX_DISTANCE_FROM_ANCHOR_MILES: config.MAX_DISTANCE_FROM_ANCHOR_MILES,
      MAX_TRAVEL_TIME_FROM_ANCHOR_MINUTES: config.MAX_TRAVEL_TIME_FROM_ANCHOR_MINUTES,
      BOOKING_DURATION_HOURS: config.BOOKING_DURATION_HOURS,
      MAX_BOOKINGS_PER_DAY: config.MAX_BOOKINGS_PER_DAY
    }
  });
});

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'healthy', timestamp: new Date().toISOString() });
});

module.exports = router;
