# 🚗 Mobile Car Detailing Booking System

A smart, route-optimized booking management system for mobile car detailing businesses. Features an **anchor-based scheduling algorithm** that automatically groups nearby bookings on the same day to minimize travel time and maximize efficiency.

## 🎯 Key Features

### Smart Route Optimization
- **Dynamic Anchor Booking System**: First booking of the day sets the route direction
- **Automatic Distance Validation**: Ensures bookings are within service area (70 miles from base)
- **Proximity Checking**: Only allows additional bookings within 15 miles of the anchor
- **Travel Time Calculation**: Uses Google Maps API for accurate route planning
- **Alternate Date Suggestions**: Automatically suggests better dates when bookings don't fit

### Business Logic
- ✅ Service area: 70-mile radius from Lowell, Massachusetts
- ✅ Each booking takes ~3 hours
- ✅ Maximum 3 bookings per day
- ✅ First booking = anchor (defines the day's route)
- ✅ Additional bookings must be within 15 miles of anchor
- ✅ Real-time validation with clear status messages

### User Interface
- 📝 Clean booking form with validation
- 📅 Interactive calendar showing availability
- 📊 Real-time booking statistics
- 🗺️ Distance and travel time calculations
- 💡 Smart alternate date suggestions
- ⚙️ One-click auto scheduling for internal dispatchers
- 📱 Responsive design for mobile and desktop

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND (HTML/CSS/JS)              │
│  - Booking Form                                         │
│  - Calendar View                                        │
│  - Real-time Validation Display                         │
└─────────────────┬───────────────────────────────────────┘
                  │
                  │ REST API
                  │
┌─────────────────▼───────────────────────────────────────┐
│                  EXPRESS SERVER (Node.js)               │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Booking Validator Service              │  │
│  │  - Check distance from Lowell                    │  │
│  │  - Check distance from anchor                    │  │
│  │  - Check daily capacity                          │  │
│  │  - Suggest alternate dates                       │  │
│  └────────────────┬─────────────────────────────────┘  │
│                   │                                     │
│  ┌────────────────▼─────────────────────────────────┐  │
│  │        Google Maps Service                       │  │
│  │  - Distance Matrix API                           │  │
│  │  - Geocoding API                                 │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │            SQLite Database                       │  │
│  │  - Bookings table                                │  │
│  │  - Customer information                          │  │
│  │  - Route metrics                                 │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 📊 Database Schema

```sql
CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Customer Information
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  
  -- Location Data
  address TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  
  -- Booking Details
  booking_date TEXT NOT NULL,
  booking_time TEXT NOT NULL,
  service_type TEXT DEFAULT 'standard',
  
  -- Distance Metrics
  distance_from_lowell REAL NOT NULL,
  travel_time_from_lowell INTEGER NOT NULL,
  
  -- Anchor System
  is_anchor BOOLEAN DEFAULT 0,
  distance_from_anchor REAL,
  travel_time_from_anchor INTEGER,
  
  -- Status
  status TEXT DEFAULT 'confirmed',
  notes TEXT,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 🔧 Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- Google Maps API Key (with Distance Matrix and Geocoding APIs enabled)

### Step 1: Install Dependencies

```bash
cd "booking app"
npm install
```

### Step 2: Configure Google Maps API Key

1. Get your API key from [Google Cloud Console](https://console.cloud.google.com/google/maps-apis)
2. Enable these APIs:
   - Distance Matrix API
   - Geocoding API

3. Create a `.env` file in the project root:

```bash
cp .env.example .env
```

4. Edit `.env` and add your API key:

```env
GOOGLE_MAPS_API_KEY=your_actual_api_key_here
PORT=3000
```

### Step 3: Initialize Database

```bash
npm run init-db
```

This creates the SQLite database with the bookings table.

### Step 4: Start the Server

```bash
npm start
```

Or for development with auto-restart:

```bash
npm run dev
```

### Step 5: Open the Application

Open your browser and navigate to:
```
http://localhost:3000
```

## 📡 API Endpoints

### Bookings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/bookings` | Get all bookings |
| `GET` | `/api/bookings/date/:date` | Get bookings for specific date |
| `GET` | `/api/bookings/range/:start/:end` | Get bookings in date range |
| `POST` | `/api/bookings` | Create new booking |
| `PUT` | `/api/bookings/:id` | Update booking |
| `DELETE` | `/api/bookings/:id` | Delete booking |

### Validation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/validate-booking` | Validate booking without creating |
| `POST` | `/api/auto-schedule` | Auto-pick the best date/time based on anchor rules |

### Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/config` | Get system configuration |
| `GET` | `/api/health` | Health check |

## 🎨 How It Works: Booking Validation Flow

```
New Booking Request
        ↓
1. Geocode Address
   (Get lat/lng coordinates)
        ↓
2. Check Distance from Lowell
   ├─ > 70 miles? → ❌ REJECT (outside service area)
   └─ ≤ 70 miles? → Continue
        ↓
3. Get Existing Bookings for Date
        ↓
4. Check Daily Capacity
   ├─ Already 3 bookings? → ❌ REJECT (day full)
   └─ < 3 bookings? → Continue
        ↓
5. Check Anchor Status
   ├─ No bookings yet? → ✅ ACCEPT (becomes anchor)
   └─ Has anchor? → Continue to step 6
        ↓
6. Calculate Distance from Anchor
   ├─ > 15 miles? → ❌ REJECT (too far from route)
   ├─ > 30 min? → ❌ REJECT (travel time too long)
   └─ Within limits? → ✅ ACCEPT (good fit!)
        ↓
7. Suggest Alternate Date (if rejected)
   - Find next available day
   - Check if location fits with that day's route

## 🧠 Auto Scheduling Flow (Internal Use)

1. **Enter customer name + address** (optionally select an earliest acceptable date)
2. **Click “Auto Schedule For Me.”**
3. The backend scans the next 14 days, respecting:
        - 70-mile radius from Lowell
        - 15-mile radius (or 30-minute drive) from the anchor booking
        - Daily capacity (max three slots)
        - Preferred time slots defined in `config.DEFAULT_TIME_SLOTS`
4. The UI auto-fills the suggested date/time and shows why it fits
5. **Click “Confirm Booking”** to save it to SQLite

This keeps the tool owner-facing—no customer logins or self-serve flows—while still optimizing daily routes automatically.
```

## 🔄 Example Use Cases

### Scenario 1: First Booking of the Day
```
Customer: John Doe
Address: 123 Main St, Nashua, NH
Date: 2025-12-21

Result: ✅ ACCEPTED (Anchor Booking)
Reason: First booking sets the route for this day
Distance from Lowell: 15.2 miles
```

### Scenario 2: Good Second Booking
```
Customer: Jane Smith
Address: 456 Oak Ave, Nashua, NH
Date: 2025-12-21 (same day as anchor)

Result: ✅ ACCEPTED
Reason: Only 3.5 miles from anchor booking
Distance from Lowell: 17.8 miles
Distance from Anchor: 3.5 miles
```

### Scenario 3: Rejected - Too Far from Anchor
```
Customer: Bob Wilson
Address: 789 Elm St, Amesbury, MA
Date: 2025-12-21 (same day as anchor)

Result: ❌ REJECTED
Reason: 25.3 miles from anchor (max: 15 miles)
Suggested Date: 2025-12-22 (available)
```

### Scenario 4: Rejected - Outside Service Area
```
Customer: Alice Brown
Address: 321 Pine Rd, Portland, ME
Date: 2025-12-21

Result: ❌ REJECTED
Reason: 105.7 miles from Lowell (max: 70 miles)
No alternate date suggested (location always too far)
```

## ⚙️ Configuration

Edit `config.js` to customize business rules:

```javascript
module.exports = {
  BASE_LOCATION: {
    name: 'Lowell, Massachusetts',
    lat: 42.6334,
    lng: -71.3162
  },
  MAX_SERVICE_RADIUS_MILES: 70,           // Service area limit
  MAX_DISTANCE_FROM_ANCHOR_MILES: 15,     // Anchor proximity limit
  MAX_TRAVEL_TIME_FROM_ANCHOR_MINUTES: 30,
  BOOKING_DURATION_HOURS: 3,
  MAX_BOOKINGS_PER_DAY: 3,
  TRAVEL_BUFFER_MINUTES: 15,
        DEFAULT_TIME_SLOTS: ['08:00', '11:30', '15:00'],
  WORK_START_HOUR: 8,
  WORK_END_HOUR: 18,
  MAX_DAYS_TO_SUGGEST: 14                 // Alternate date search range
};
```

## 📁 Project Structure

```
booking app/
├── server.js                 # Express server & API routes
├── config.js                 # Business rules configuration
├── database.js               # SQLite database wrapper
├── package.json              # Dependencies
├── .env                      # Environment variables (API keys)
├── .env.example             # Environment template
├── bookings.db              # SQLite database (created on init)
│
├── services/
│   ├── bookingValidator.js  # Core validation logic
│   └── mapsService.js       # Google Maps API integration
│
├── scripts/
│   └── initDatabase.js      # Database initialization script
│
└── public/
    ├── index.html           # Main UI
    ├── styles.css           # Styling
    └── app.js               # Frontend logic
```

## 🚀 Future Enhancements

Potential improvements for v2.0:

- [ ] User authentication and multi-user support
- [ ] SMS/Email notifications for customers
- [ ] Payment integration
- [ ] Route optimization algorithm (TSP solver)
- [ ] Weather-based scheduling
- [ ] Employee/crew assignment
- [ ] Customer history and preferences
- [ ] Invoice generation
- [ ] Mobile app (React Native)
- [ ] Real-time GPS tracking
- [ ] Automated reminders

## 🐛 Troubleshooting

### Google Maps API Errors

**Problem**: "Google Maps API key not configured"
**Solution**: Make sure `.env` file exists with valid API key

**Problem**: "Geocoding failed" or "Route calculation failed"
**Solution**: 
- Verify APIs are enabled in Google Cloud Console
- Check API key restrictions
- Ensure billing is enabled

### Database Issues

**Problem**: "Cannot open database"
**Solution**: Run `npm run init-db` to create the database

**Problem**: "Table doesn't exist"
**Solution**: Delete `bookings.db` and run `npm run init-db` again

### Port Already in Use

**Problem**: "Port 3000 already in use"
**Solution**: Change `PORT` in `.env` file or kill the process using port 3000

## 📝 License

This project is provided as-is for educational and commercial use.

## 🤝 Support

For issues or questions:
1. Check the troubleshooting section
2. Review the API documentation
3. Verify your Google Maps API configuration
4. Check server logs for detailed error messages

---

Built with ❤️ for efficient mobile car detailing operations
