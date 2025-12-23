// Business Rules Configuration
module.exports = {
  // Service area constraints
  BASE_LOCATION: {
    name: 'Lowell, Massachusetts',
    lat: 42.6334,
    lng: -71.3162
  },
  MAX_SERVICE_RADIUS_MILES: 70, // Maximum distance from Lowell
  
  // Anchor booking constraints
  MAX_DISTANCE_FROM_ANCHOR_MILES: 15, // Maximum distance from anchor booking
  MAX_TRAVEL_TIME_FROM_ANCHOR_MINUTES: 30, // Maximum travel time from anchor
  
  // Booking capacity and timing
  BOOKING_DURATION_HOURS: 3, // Each booking takes 3 hours
  MAX_BOOKINGS_PER_DAY: 3, // Maximum bookings per day
  TRAVEL_BUFFER_MINUTES: 15, // Buffer time between bookings for travel
  DEFAULT_TIME_SLOTS: ['08:00', '11:30', '15:00'], // Preferred start times for automatic scheduling
  
  // Working hours
  WORK_START_HOUR: 8, // 8 AM
  WORK_END_HOUR: 18, // 6 PM
  WORKING_DAYS: [1, 2, 3, 4, 5], // 0=Sunday ... 6=Saturday (default: Mon-Fri)
  
  // Alternate date suggestion
  MAX_DAYS_TO_SUGGEST: 14, // Look ahead 14 days for alternatives
  
  // Database
  DB_PATH: './bookings.db'
};

