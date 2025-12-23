require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const apiRouter = require('./api');

const app = express();
const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;
const MAX_PORT_RETRIES = 5;

// CORS configuration for Vercel
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    // Allow Vercel domains and localhost
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5000',
      /\.vercel\.app$/,  // All Vercel preview and production domains
    ];
    
    const isAllowed = allowedOrigins.some(pattern => {
      if (pattern instanceof RegExp) {
        return pattern.test(origin);
      }
      return pattern === origin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now, restrict in production if needed
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Middleware - ORDER MATTERS! Body parsing must come before routes
app.use(cors(corsOptions));

// Body parsing middleware - MUST be before routes
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies

// Request logging middleware for debugging
app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log('Content-Type:', req.get('Content-Type'));
    console.log('Content-Length:', req.get('Content-Length'));
  }
  next();
});

// Static files - serve from public directory
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true
}));

app.use('/api', apiRouter);

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function logServerBanner(port) {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  Mobile Car Detailing Booking System                      ║
║  Server running on http://localhost:${port}                  ║
╚═══════════════════════════════════════════════════════════╝

📍 Base Location: ${config.BASE_LOCATION.name}
📏 Service Radius: ${config.MAX_SERVICE_RADIUS_MILES} miles
🎯 Anchor Distance: ${config.MAX_DISTANCE_FROM_ANCHOR_MILES} miles
📅 Max Bookings/Day: ${config.MAX_BOOKINGS_PER_DAY}
⏱️  Booking Duration: ${config.BOOKING_DURATION_HOURS} hours

API Endpoints:
  GET    /api/bookings
  GET    /api/bookings/date/:date
  POST   /api/validate-booking
  POST   /api/auto-schedule
  POST   /api/bookings
  PUT    /api/bookings/:id
  DELETE /api/bookings/:id
  GET    /api/config
  GET    /api/health
  `);

  if (port !== DEFAULT_PORT) {
    console.warn(`⚠️  Port ${DEFAULT_PORT} was busy. Running on fallback port ${port}.`);
  }

  console.log('✓ Using FREE OpenStreetMap service (no API key required!)');
}

function startServer(port, attemptsLeft = MAX_PORT_RETRIES) {
  const server = app.listen(port, () => logServerBanner(port));

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      const nextPort = port + 1;
      console.warn(`⚠️  Port ${port} is already in use. Trying port ${nextPort}...`);
      startServer(nextPort, attemptsLeft - 1);
    } else {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  });
}

// Only start server if not in serverless environment (Vercel)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  startServer(DEFAULT_PORT);
}

module.exports = app;
