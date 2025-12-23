# Mobile Car Detailing Booking System - Technical Documentation

## System Architecture Deep Dive

### Core Algorithm: Anchor-Based Booking

The anchor-based booking system is the heart of this application. Here's how it works:

#### 1. Anchor Booking Concept

When the first booking is made on any given day, it becomes the **anchor booking** for that day. This anchor:
- Defines the geographic working area for the day
- Sets the route direction (e.g., north, south, east, west from Lowell)
- Remains the anchor even if deleted (next booking becomes anchor)

#### 2. Validation Logic Pseudocode

```javascript
FUNCTION validateBooking(address, date):
    // Step 1: Geocode address
    coordinates = geocodeAddress(address)
    
    // Step 2: Check service area
    distanceFromBase = calculateDistance(LOWELL, coordinates)
    IF distanceFromBase > 70 miles:
        RETURN REJECT("Outside 70-mile service area")
    
    // Step 3: Check daily capacity
    existingBookings = getBookingsForDate(date)
    IF existingBookings.count >= 3:
        alternateDate = findAlternateDate(coordinates)
        RETURN REJECT("Day full", alternateDate)
    
    // Step 4: Handle first booking (anchor)
    IF existingBookings.count == 0:
        RETURN ACCEPT("Anchor booking", isAnchor=true)
    
    // Step 5: Check proximity to anchor
    anchorBooking = existingBookings.findAnchor()
    distanceFromAnchor = calculateDistance(anchorBooking, coordinates)
    travelTime = calculateTravelTime(anchorBooking, coordinates)
    
    IF distanceFromAnchor > 15 miles OR travelTime > 30 minutes:
        alternateDate = findAlternateDate(coordinates)
        RETURN REJECT("Too far from anchor", alternateDate)
    
    // Step 6: All checks passed
    RETURN ACCEPT("Good fit for this route")
END FUNCTION
```

#### 3. Alternate Date Algorithm

```javascript
FUNCTION findAlternateDate(coordinates):
    currentDate = requestedDate
    
    FOR i = 1 TO 14: // Check next 14 days
        checkDate = currentDate + i days
        bookings = getBookingsForDate(checkDate)
        
        // Case 1: Empty day (best option)
        IF bookings.count == 0:
            RETURN checkDate, "Day is available"
        
        // Case 2: Day not full, check anchor proximity
        IF bookings.count < 3:
            anchor = bookings.findAnchor()
            distance = calculateDistance(anchor, coordinates)
            
            IF distance <= 15 miles:
                RETURN checkDate, "Fits with existing route"
        
        // Case 3: Day full, continue searching
        CONTINUE
    END FOR
    
    // If no perfect match, return first non-full day
    FOR i = 1 TO 14:
        checkDate = currentDate + i days
        bookings = getBookingsForDate(checkDate)
        
        IF bookings.count < 3:
            RETURN checkDate, "Has availability"
    END FOR
    
    RETURN null // No dates available in next 14 days
END FUNCTION
```

### 4. Automatic Scheduling Algorithm

```javascript
FUNCTION autoSchedule(address, earliestDate):
  coordinates = geocodeAddress(address)
  lowellCheck = checkDistanceFromLowell(coordinates)
  IF !lowellCheck.valid:
    RETURN REJECT("Outside service area")

  startDate = max(today, earliestDate)

  FOR offset = 0 TO MAX_DAYS_TO_SUGGEST:
    candidateDate = startDate + offset days
    bookings = getBookingsForDate(candidateDate)

    IF bookings.count >= MAX_BOOKINGS_PER_DAY:
      CONTINUE

    IF bookings.count == 0:
      anchorCheck = null // becomes anchor
    ELSE:
      anchor = bookings.findAnchor() OR bookings[0]
      anchorCheck = checkDistanceFromAnchor(anchor, coordinates)
      IF !anchorCheck.valid:
        CONTINUE

    timeSlot = pickFirstAvailableSlot(bookings, DEFAULT_TIME_SLOTS)
    IF timeSlot exists:
      RETURN ACCEPT(candidateDate, timeSlot, anchorCheck)

  RETURN REJECT("No slots within window")
```

The helper `pickFirstAvailableSlot` walks through `config.DEFAULT_TIME_SLOTS` (defaults: `08:00`, `11:30`, `15:00`) and selects the first start time not already assigned on that date.

## Distance Calculation Methods

### 1. Google Maps Distance Matrix API
- **Use**: Primary method for route planning
- **Provides**: Actual driving distance and time
- **Accuracy**: Considers roads, traffic patterns
- **Cost**: API calls (paid after free tier)

```javascript
const result = await getDistanceAndTime(origin, destination);
// Returns: { distance: 15.3, duration: 22 }
```

### 2. Haversine Formula (Straight-line)
- **Use**: Quick checks, API fallback
- **Provides**: "As the crow flies" distance
- **Accuracy**: Good for rough estimates
- **Cost**: Free (calculated locally)

```javascript
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth's radius in miles
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}
```

## API Request/Response Examples

### POST /api/validate-booking

**Request:**
```json
{
  "customer_name": "John Doe",
  "address": "123 Main St, Nashua, NH",
  "booking_date": "2025-12-21",
  "booking_time": "09:00"
}
```

**Response (Valid - Anchor):**
```json
{
  "success": true,
  "validation": {
    "valid": true,
    "reason": "anchor_booking",
    "message": "Perfect! This will be the anchor booking for this day.",
    "isAnchor": true,
    "geocode": {
      "lat": 42.7654,
      "lng": -71.4676,
      "formatted_address": "123 Main St, Nashua, NH 03060, USA"
    },
    "distanceFromLowell": 15.2,
    "travelTimeFromLowell": 23
  }
}
```

**Response (Valid - Additional Booking):**
```json
{
  "success": true,
  "validation": {
    "valid": true,
    "reason": "valid_booking",
    "message": "Great fit! This location is 3.5 miles from the anchor booking.",
    "isAnchor": false,
    "geocode": {
      "lat": 42.7890,
      "lng": -71.4523,
      "formatted_address": "456 Oak Ave, Nashua, NH 03060, USA"
    },
    "distanceFromLowell": 17.8,
    "travelTimeFromLowell": 26,
    "distanceFromAnchor": 3.5,
    "travelTimeFromAnchor": 8
  }
}
```

**Response (Invalid - Too Far):**
```json
{
  "success": true,
  "validation": {
    "valid": false,
    "reason": "too_far_from_anchor",
    "message": "This location is 25.3 miles from today's route (anchor: 123 Main St, Nashua, NH). Maximum allowed is 15 miles.",
    "details": {
      "distance": 25.3,
      "travelTime": 35,
      "anchorAddress": "123 Main St, Nashua, NH 03060, USA"
    },
    "alternateDate": {
      "date": "2025-12-22",
      "reason": "Day is available (no bookings yet)"
    }
  }
}
```

**Response (Invalid - Outside Service Area):**
```json
{
  "success": true,
  "validation": {
    "valid": false,
    "reason": "outside_service_area",
    "message": "This location is 105.7 miles from Lowell, which exceeds our 70-mile service area.",
    "details": {
      "valid": false,
      "distance": 105.7,
      "travelTime": 112
    }
  }
}
```

### POST /api/bookings

**Request:**
```json
{
  "customer_name": "John Doe",
  "customer_phone": "978-555-0123",
  "customer_email": "john@example.com",
  "address": "123 Main St, Nashua, NH",
  "booking_date": "2025-12-21",
  "booking_time": "09:00",
  "service_type": "premium",
  "notes": "Large SUV, need extra time"
}
```

### POST /api/auto-schedule

**Request:**
```json
{
  "customer_name": "Dispatch Only",
  "address": "789 Central St, Leominster, MA",
  "service_type": "standard",
  "preferred_start_date": "2025-12-21"
}
```

**Response (Success):**
```json
{
  "success": true,
  "autoSchedule": {
    "scheduled": true,
    "valid": true,
    "booking_date": "2025-12-22",
    "booking_time": "11:30",
    "isAnchor": false,
    "message": "Scheduled 4.1 miles from anchor (123 Main St, Nashua, NH 03060, USA).",
    "geocode": {
      "lat": 42.598,
      "lng": -71.441,
      "formatted_address": "789 Central St, Leominster, MA 01453, USA"
    },
    "distanceFromLowell": 26.4,
    "travelTimeFromLowell": 39,
    "distanceFromAnchor": 4.1,
    "travelTimeFromAnchor": 11,
    "anchorAddress": "123 Main St, Nashua, NH 03060, USA"
  }
}
```

**Response (Failure):**
```json
{
  "success": false,
  "autoSchedule": {
    "scheduled": false,
    "valid": false,
    "reason": "no_slot_available",
    "message": "Unable to auto-schedule within the next 14 days. Consider widening the window."
  },
  "error": "Unable to auto-schedule within the next 14 days. Consider widening the window."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Booking created successfully",
  "data": {
    "id": 1,
    "customer_name": "John Doe",
    "customer_phone": "978-555-0123",
    "customer_email": "john@example.com",
    "address": "123 Main St, Nashua, NH 03060, USA",
    "latitude": 42.7654,
    "longitude": -71.4676,
    "booking_date": "2025-12-21",
    "booking_time": "09:00",
    "service_type": "premium",
    "distance_from_lowell": 15.2,
    "travel_time_from_lowell": 23,
    "is_anchor": true,
    "distance_from_anchor": null,
    "travel_time_from_anchor": null,
    "status": "confirmed",
    "notes": "Large SUV, need extra time",
    "created_at": "2025-12-20T14:30:00Z"
  },
  "validation": {
    "valid": true,
    "reason": "anchor_booking",
    "message": "Perfect! This will be the anchor booking for this day.",
    "isAnchor": true
  }
}
```

## Performance Considerations

### Caching Strategy
- Cache geocoding results for frequently used addresses
- Cache distance calculations between common location pairs
- Implement Redis for production environments

### API Rate Limiting
- Google Maps API has usage limits
- Implement request throttling
- Use straight-line distance for pre-filtering

### Database Indexing
```sql
CREATE INDEX idx_booking_date ON bookings(booking_date);
CREATE INDEX idx_is_anchor ON bookings(is_anchor);
CREATE INDEX idx_booking_date_anchor ON bookings(booking_date, is_anchor);
```

## Security Best Practices

1. **API Key Protection**
   - Never expose Google Maps API key in frontend
   - Use environment variables
   - Set up API key restrictions in Google Cloud Console

2. **Input Validation**
   - Sanitize all user inputs
   - Validate date formats
   - Check address formats

3. **Rate Limiting**
   - Implement request rate limiting
   - Prevent abuse of validation endpoint

## Testing Strategies

### Unit Tests
```javascript
// Test distance validation
test('should reject bookings outside 70-mile radius', async () => {
  const result = await validateBooking({
    address: 'Portland, ME',
    booking_date: '2025-12-21'
  });
  expect(result.valid).toBe(false);
  expect(result.reason).toBe('outside_service_area');
});

// Test anchor detection
test('first booking should be anchor', async () => {
  const result = await validateBooking({
    address: 'Nashua, NH',
    booking_date: '2025-12-21'
  });
  expect(result.valid).toBe(true);
  expect(result.isAnchor).toBe(true);
});
```

### Integration Tests
- Test full booking flow
- Test API endpoints
- Test database operations

### Manual Test Cases
1. Create anchor booking
2. Add nearby booking (should succeed)
3. Add far booking (should fail with alternate date)
4. Fill day to capacity (should reject 4th booking)
5. Test outside service area
6. Test alternate date suggestions
7. Run auto-schedule to ensure it finds the first valid slot and pre-fills the UI

## Deployment Considerations

### Production Checklist
- [ ] Set up proper Google Maps API billing alerts
- [ ] Configure API key restrictions
- [ ] Set up database backups
- [ ] Implement logging (Winston, Morgan)
- [ ] Set up monitoring (PM2, New Relic)
- [ ] Configure HTTPS
- [ ] Set up reverse proxy (Nginx)
- [ ] Implement error tracking (Sentry)
- [ ] Set up CI/CD pipeline

### Environment Variables
```env
# Production
NODE_ENV=production
PORT=3000
GOOGLE_MAPS_API_KEY=your_production_key
DATABASE_PATH=/var/data/bookings.db

# Optional
LOG_LEVEL=info
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX_REQUESTS=100
```

## Scalability Notes

### Current Limitations
- Single SQLite database (good for small businesses)
- No horizontal scaling
- Synchronous validation (could be async)

### Scaling to 1000+ Bookings
1. Migrate to PostgreSQL or MySQL
2. Implement caching layer (Redis)
3. Use background jobs for validation (Bull/Bee-Queue)
4. Add database read replicas
5. Implement CDN for static assets
6. Use load balancer for multiple servers

### Microservices Architecture
For very large scale, consider splitting into:
- Booking Service
- Validation Service
- Notification Service
- Analytics Service
- Route Optimization Service

---

This technical documentation provides deep insights into the system's inner workings, helping developers understand, maintain, and extend the application.
