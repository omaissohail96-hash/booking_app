const mapsService = require('./mapsService');
const database = require('../database.pg');
const config = require('../config');

/**
 * Core Booking Validation Service
 * Implements the anchor-based booking logic
 */
class BookingValidator {
  /**
   * Validate a new booking request
   * @param {Object} bookingRequest - The booking request to validate
   * @returns {Promise<Object>} Validation result with status and messages
   */
  async validateBooking(bookingRequest) {
    const { address, booking_date } = bookingRequest;
          if (!booking_date) {
            return {
              valid: false,
              reason: 'missing_booking_date',
              message: 'Please select a booking date.'
            };
          }

          if (!this.isWorkingDay(booking_date)) {
            const nextWorkingDate = this.formatDate(
              this.shiftToWorkingDay(new Date(`${booking_date}T00:00:00`), false)
            );
            return {
              valid: false,
              reason: 'non_working_day',
              message: 'We do not operate on weekends. Please choose a weekday.',
              nextWorkingDate
            };
          }
    
    try {
      // Step 1: Geocode the address
      const geocodeResult = await mapsService.geocodeAddress(address);
      const { lat, lng, formatted_address } = geocodeResult;

      // Step 2: Check distance from Lowell (Base location)
      const lowellCheck = await this.checkDistanceFromLowell(lat, lng);
      if (!lowellCheck.valid) {
        return {
          valid: false,
          reason: 'outside_service_area',
          message: `This location is ${lowellCheck.distance} miles from Lowell, which exceeds our ${config.MAX_SERVICE_RADIUS_MILES}-mile service area.`,
          details: lowellCheck
        };
      }

      // Step 3: Get existing bookings for the requested date
      const existingBookings = await database.getBookingsByDate(booking_date);

      // Step 4: Check daily capacity
      if (existingBookings.length >= config.MAX_BOOKINGS_PER_DAY) {
        const alternateDate = await this.suggestAlternateDate(booking_date, lat, lng);
        return {
          valid: false,
          reason: 'day_full',
          message: `This day already has ${existingBookings.length} bookings (maximum capacity). Try another date.`,
          alternateDate: alternateDate
        };
      }

      // Step 5: If this is the first booking of the day, it becomes the anchor
      if (existingBookings.length === 0) {
        return {
          valid: true,
          reason: 'anchor_booking',
          message: 'Perfect! This will be the anchor booking for this day.',
          isAnchor: true,
          geocode: { lat, lng, formatted_address },
          distanceFromLowell: lowellCheck.distance,
          travelTimeFromLowell: lowellCheck.travelTime
        };
      }

      // Step 6: Check distance from anchor booking
      const anchorBooking = existingBookings.find(b => b.is_anchor);
      if (!anchorBooking) {
        // If no anchor exists (shouldn't happen), make first booking the anchor
        return {
          valid: true,
          reason: 'no_anchor_found',
          message: 'Good to book.',
          isAnchor: false,
          geocode: { lat, lng, formatted_address },
          distanceFromLowell: lowellCheck.distance,
          travelTimeFromLowell: lowellCheck.travelTime
        };
      }

      // Calculate distance from anchor
      const anchorCheck = await this.checkDistanceFromAnchor(
        lat, lng, 
        anchorBooking.latitude, 
        anchorBooking.longitude,
        anchorBooking.address
      );

      if (!anchorCheck.valid) {
        const alternateDate = await this.suggestAlternateDate(booking_date, lat, lng);
        return {
          valid: false,
          reason: 'too_far_from_anchor',
          message: `This location is ${anchorCheck.distance} miles from today's route (anchor: ${anchorBooking.address}). Maximum allowed is ${config.MAX_DISTANCE_FROM_ANCHOR_MILES} miles.`,
          details: anchorCheck,
          alternateDate: alternateDate
        };
      }

      // Step 7: Check travel time feasibility
      const timeCheck = this.checkTimeAvailability(existingBookings, bookingRequest.booking_time);
      if (!timeCheck.valid) {
        return {
          valid: false,
          reason: 'time_conflict',
          message: timeCheck.message,
          suggestedTimes: timeCheck.suggestedTimes
        };
      }

      // All checks passed!
      return {
        valid: true,
        reason: 'valid_booking',
        message: `Great fit! This location is ${anchorCheck.distance} miles from the anchor booking.`,
        isAnchor: false,
        geocode: { lat, lng, formatted_address },
        distanceFromLowell: lowellCheck.distance,
        travelTimeFromLowell: lowellCheck.travelTime,
        distanceFromAnchor: anchorCheck.distance,
        travelTimeFromAnchor: anchorCheck.travelTime
      };

    } catch (error) {
      console.error('Validation error:', error);
      return {
        valid: false,
        reason: 'validation_error',
        message: `Error validating booking: ${error.message}`
      };
    }
  }

  /**
   * Automatically find the best date/time for a booking
   */
  async autoScheduleBooking(bookingRequest) {
    const { address } = bookingRequest;

    try {
      const geocodeResult = await mapsService.geocodeAddress(address);
      const { lat, lng, formatted_address } = geocodeResult;

      const lowellCheck = await this.checkDistanceFromLowell(lat, lng);
      if (!lowellCheck.valid) {
        return {
          scheduled: false,
          valid: false,
          reason: 'outside_service_area',
          message: `This location is ${lowellCheck.distance} miles from Lowell, which exceeds our ${config.MAX_SERVICE_RADIUS_MILES}-mile service area.`,
          details: lowellCheck
        };
      }

      const startDate = this.normalizeStartDate(bookingRequest.preferred_start_date || bookingRequest.booking_date);
      const maxDays = config.MAX_DAYS_TO_SUGGEST;

      for (let offset = 0; offset <= maxDays; offset++) {
        const candidateDate = new Date(startDate);
        candidateDate.setDate(candidateDate.getDate() + offset);
        const dateString = this.formatDate(candidateDate);

        if (!this.isWorkingDay(candidateDate)) {
          continue;
        }

        const bookings = await database.getBookingsByDate(dateString);
        if (bookings.length >= config.MAX_BOOKINGS_PER_DAY) {
          continue;
        }

        const isAnchor = bookings.length === 0;
        let anchorCheck = null;
        let anchorBooking = null;

        if (!isAnchor) {
          anchorBooking = bookings.find(b => b.is_anchor) || bookings[0];
          anchorCheck = await this.checkDistanceFromAnchor(
            lat,
            lng,
            anchorBooking.latitude,
            anchorBooking.longitude,
            anchorBooking.address
          );

          if (!anchorCheck.valid) {
            continue;
          }
        }

        const suggestedTime = this.pickTimeSlot(bookings);
        if (!suggestedTime) {
          continue;
        }

        return {
          scheduled: true,
          valid: true,
          booking_date: dateString,
          booking_time: suggestedTime,
          isAnchor: isAnchor,
          message: isAnchor
            ? `Scheduled as the anchor for ${dateString}.`
            : `Scheduled ${anchorCheck.distance} miles from anchor (${anchorBooking.address}).`,
          geocode: { lat, lng, formatted_address },
          distanceFromLowell: lowellCheck.distance,
          travelTimeFromLowell: lowellCheck.travelTime,
          distanceFromAnchor: anchorCheck ? anchorCheck.distance : null,
          travelTimeFromAnchor: anchorCheck ? anchorCheck.travelTime : null,
          anchorAddress: anchorCheck ? anchorCheck.anchorAddress : null
        };
      }

      return {
        scheduled: false,
        valid: false,
        reason: 'no_slot_available',
        message: `Unable to auto-schedule within the next ${config.MAX_DAYS_TO_SUGGEST} days. Consider widening the window.`
      };
    } catch (error) {
      console.error('Auto-schedule error:', error);
      return {
        scheduled: false,
        valid: false,
        reason: 'auto_schedule_error',
        message: `Error auto-scheduling booking: ${error.message}`
      };
    }
  }

  /**
   * Check if location is within service area from Lowell
   */
  async checkDistanceFromLowell(lat, lng) {
    const origin = `${config.BASE_LOCATION.lat},${config.BASE_LOCATION.lng}`;
    const destination = `${lat},${lng}`;

    const result = await mapsService.getDistanceAndTime(origin, destination);

    return {
      valid: result.distance <= config.MAX_SERVICE_RADIUS_MILES,
      distance: result.distance,
      travelTime: result.duration,
      distanceText: result.distanceText,
      durationText: result.durationText
    };
  }

  /**
   * Check if location is within acceptable distance from anchor booking
   */
  async checkDistanceFromAnchor(lat, lng, anchorLat, anchorLng, anchorAddress) {
    const origin = `${anchorLat},${anchorLng}`;
    const destination = `${lat},${lng}`;

    const result = await mapsService.getDistanceAndTime(origin, destination);

    const validDistance = result.distance <= config.MAX_DISTANCE_FROM_ANCHOR_MILES;
    const validTime = result.duration <= config.MAX_TRAVEL_TIME_FROM_ANCHOR_MINUTES;

    return {
      valid: validDistance && validTime,
      distance: result.distance,
      travelTime: result.duration,
      distanceText: result.distanceText,
      durationText: result.durationText,
      anchorAddress: anchorAddress
    };
  }

  /**
   * Check if requested time slot is available
   * Ensures minimum 4-hour gap between bookings (3 hours service + travel time)
   */
  checkTimeAvailability(existingBookings, requestedTime) {
    if (!requestedTime || existingBookings.length === 0) {
      return {
        valid: true,
        message: 'Time slot available'
      };
    }

    // Convert time string to minutes since midnight
    const timeToMinutes = (timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const requestedMinutes = timeToMinutes(requestedTime);
    const minGapMinutes = 240; // 4 hours = 3 hours service + 1 hour travel buffer

    // Check conflicts with existing bookings
    const conflicts = [];
    for (const booking of existingBookings) {
      const bookingMinutes = timeToMinutes(booking.booking_time);
      const timeDifference = Math.abs(requestedMinutes - bookingMinutes);

      if (timeDifference < minGapMinutes) {
        conflicts.push({
          time: booking.booking_time,
          customer: booking.customer_name,
          timeDifference: timeDifference
        });
      }
    }

    if (conflicts.length > 0) {
      // Suggest available time slots
      const suggestedTimes = this.findAvailableTimeSlots(existingBookings);
      
      return {
        valid: false,
        message: `Time conflict! Each booking requires 4 hours (3 hours service + 1 hour buffer). Existing booking at ${conflicts[0].time} is too close.`,
        conflicts: conflicts,
        suggestedTimes: suggestedTimes
      };
    }

    return {
      valid: true,
      message: 'Time slot available'
    };
  }

  /**
   * Find available time slots on a day with existing bookings
   */
  findAvailableTimeSlots(existingBookings) {
    const workStart = config.WORK_START_HOUR * 60; // Convert to minutes
    const workEnd = config.WORK_END_HOUR * 60;
    const minGap = 240; // 4 hours in minutes

    // Convert existing bookings to minutes and sort
    const bookedTimes = existingBookings
      .map(b => {
        const [hours, minutes] = b.booking_time.split(':').map(Number);
        return hours * 60 + minutes;
      })
      .sort((a, b) => a - b);

    const availableSlots = [];

    // Check before first booking
    if (bookedTimes.length > 0 && bookedTimes[0] - workStart >= minGap) {
      const slotTime = Math.floor((workStart + bookedTimes[0] - minGap) / 60);
      availableSlots.push(`${String(slotTime).padStart(2, '0')}:00`);
    }

    // Check gaps between bookings
    for (let i = 0; i < bookedTimes.length - 1; i++) {
      const gapStart = bookedTimes[i] + minGap;
      const gapEnd = bookedTimes[i + 1];
      
      if (gapEnd - gapStart >= minGap) {
        const slotTime = Math.floor((gapStart + gapEnd) / 2 / 60);
        availableSlots.push(`${String(slotTime).padStart(2, '0')}:00`);
      }
    }

    // Check after last booking
    if (bookedTimes.length > 0) {
      const lastTime = bookedTimes[bookedTimes.length - 1];
      if (workEnd - lastTime >= minGap) {
        const slotTime = Math.floor((lastTime + minGap) / 60);
        if (slotTime < config.WORK_END_HOUR) {
          availableSlots.push(`${String(slotTime).padStart(2, '0')}:00`);
        }
      }
    }

    return availableSlots.length > 0 ? availableSlots : ['No available slots'];
  }

  /**
   * Suggest an alternate date that would work better
   */
  async suggestAlternateDate(requestedDate, lat, lng) {
    try {
      const currentDate = new Date(requestedDate);
      const maxDays = config.MAX_DAYS_TO_SUGGEST;

      // Check next 14 days for a suitable date
      for (let i = 1; i <= maxDays; i++) {
        const checkDate = new Date(currentDate);
        checkDate.setDate(checkDate.getDate() + i);
        const dateString = checkDate.toISOString().split('T')[0];

        if (!this.isWorkingDay(checkDate)) {
          continue;
        }

        const bookings = await database.getBookingsByDate(dateString);

        // If day is empty, suggest it
        if (bookings.length === 0) {
          return {
            date: dateString,
            reason: 'Day is available (no bookings yet)'
          };
        }

        // If day is not full, check if location fits with anchor
        if (bookings.length < config.MAX_BOOKINGS_PER_DAY) {
          const anchorBooking = bookings.find(b => b.is_anchor);
          if (anchorBooking) {
            const anchorCheck = await this.checkDistanceFromAnchor(
              lat, lng,
              anchorBooking.latitude,
              anchorBooking.longitude,
              anchorBooking.address
            );

            if (anchorCheck.valid) {
              return {
                date: dateString,
                reason: `Good fit with existing route (${anchorCheck.distance} miles from anchor)`
              };
            }
          }
        }
      }

      // If no perfect match found, suggest first non-full day
      for (let i = 1; i <= maxDays; i++) {
        const checkDate = new Date(currentDate);
        checkDate.setDate(checkDate.getDate() + i);
        const dateString = checkDate.toISOString().split('T')[0];

        if (!this.isWorkingDay(checkDate)) {
          continue;
        }

        const bookings = await database.getBookingsByDate(dateString);
        if (bookings.length < config.MAX_BOOKINGS_PER_DAY) {
          return {
            date: dateString,
            reason: 'Day has availability'
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Error suggesting alternate date:', error);
      return null;
    }
  }

  /**
   * Get booking statistics for a date
   */
  async getDateStatistics(date) {
    const bookings = await database.getBookingsByDate(date);
    const anchorBooking = bookings.find(b => b.is_anchor);

    return {
      date: date,
      bookingCount: bookings.length,
      capacity: config.MAX_BOOKINGS_PER_DAY,
      isFull: bookings.length >= config.MAX_BOOKINGS_PER_DAY,
      hasAnchor: !!anchorBooking,
      anchorAddress: anchorBooking ? anchorBooking.address : null,
      bookings: bookings
    };
  }

  pickTimeSlot(existingBookings) {
    const usedTimes = new Set(existingBookings.map(booking => booking.booking_time));
    for (const slot of config.DEFAULT_TIME_SLOTS) {
      if (!usedTimes.has(slot)) {
        return slot;
      }
    }
    return null;
  }

  normalizeStartDate(dateString) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!dateString) {
      return this.shiftToWorkingDay(today, true);
    }

    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) {
      return this.shiftToWorkingDay(today, true);
    }

    parsed.setHours(0, 0, 0, 0);
    const baseline = parsed < today ? today : parsed;
    return this.shiftToWorkingDay(baseline, true);
  }

  formatDate(dateObj) {
    return dateObj.toISOString().split('T')[0];
  }

  isWorkingDay(dateInput) {
    const workingDays = Array.isArray(config.WORKING_DAYS) && config.WORKING_DAYS.length
      ? config.WORKING_DAYS
      : [0, 1, 2, 3, 4, 5, 6];

    const date = dateInput instanceof Date ? new Date(dateInput) : new Date(`${dateInput}T00:00:00`);
    return workingDays.includes(date.getDay());
  }

  shiftToWorkingDay(dateInput, includeToday = true) {
    const date = dateInput instanceof Date ? new Date(dateInput) : new Date(`${dateInput}T00:00:00`);
    if (!includeToday) {
      date.setDate(date.getDate() + 1);
    }

    let safety = 0;
    while (!this.isWorkingDay(date) && safety < 14) {
      date.setDate(date.getDate() + 1);
      safety += 1;
    }
    return date;
  }
}

module.exports = new BookingValidator();
