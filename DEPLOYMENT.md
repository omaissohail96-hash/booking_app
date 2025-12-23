# Vercel Deployment Guide

## ⚠️ Important Notice: SQLite Limitation on Vercel

**Your current app uses SQLite, which will NOT work properly on Vercel** because:
- Vercel uses serverless functions with ephemeral (temporary) file systems
- Any data written to SQLite will be lost after each request
- The database file cannot persist between function invocations

## Options for Deployment:

### Option 1: Switch to a Cloud Database (Recommended for Production)
Replace SQLite with one of these free cloud databases:

**A. Vercel Postgres (Recommended)**
- Free tier available
- Managed by Vercel
- Easy integration
- Install: `npm install @vercel/postgres`

**B. MongoDB Atlas**
- Free tier available
- NoSQL database
- Install: `npm install mongodb mongoose`

**C. PlanetScale (MySQL)**
- Free tier available
- Serverless MySQL
- Install: `npm install mysql2`

**D. Supabase (PostgreSQL)**
- Free tier available
- Real-time capabilities
- Install: `npm install @supabase/supabase-js`

### Option 2: Deploy to a Different Platform
If you want to keep SQLite, consider these alternatives:
- **Railway.app** - Supports persistent storage
- **Render.com** - Free tier with persistent disk
- **DigitalOcean App Platform** - Persistent storage available
- **Fly.io** - Supports volumes for databases
- **Heroku** - With PostgreSQL addon (not SQLite)

## Current Vercel Setup

I've created the necessary files:
- `vercel.json` - Vercel configuration
- Updated `.gitignore` - Excludes Vercel files

## Steps to Deploy (After Database Migration):

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy:**
   ```bash
   vercel
   ```

4. **For Production:**
   ```bash
   vercel --prod
   ```

## Quick Start with Vercel Postgres

If you choose Vercel Postgres:

1. Install the package:
   ```bash
   npm install @vercel/postgres
   ```

2. Add Vercel Postgres to your project through Vercel dashboard
3. Update `database.js` to use Vercel Postgres instead of SQLite
4. Update environment variables in Vercel dashboard

Would you like me to help you migrate to a cloud database?
