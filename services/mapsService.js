const axios = require('axios');
const config = require('../config');

/**
 * OpenStreetMap-based Distance Service (FREE, no API key required!)
 * Calculates distances and travel times between locations using:
 * - OpenStreetMap Nominatim for geocoding (free)
 * - Haversine formula for accurate distance calculations
 * - Average driving speed for time estimation
 */
class MapsService {
  constructor() {
    this.nominatimUrl = 'https://nominatim.openstreetmap.org';
    // Average driving speed for time estimation (considering city + highway)
    this.averageSpeedMph = 35;
    // Cache geocoding results to reduce API calls
    this.geocodeCache = new Map();
  }

  /**
   * Calculate distance and travel time between two locations
   * @param {string} origin - Origin address or coordinates
   * @param {string} destination - Destination address or coordinates
   * @returns {Promise<{distance: number, duration: number}>} Distance in miles, duration in minutes
   */
  async getDistanceAndTime(origin, destination) {
    try {
      // Get coordinates for both addresses
      const originCoords = await this.geocodeAddress(origin);
      const destCoords = await this.geocodeAddress(destination);

      // Calculate straight-line distance using Haversine formula
      const distance = this.calculateStraightLineDistance(
        originCoords.lat,
        originCoords.lng,
        destCoords.lat,
        destCoords.lng
      );

      // Estimate driving distance (roads aren't straight - typically 1.2-1.3x longer)
      const drivingDistance = distance * 1.25;
      
      // Estimate travel time based on average driving speed
      const durationInMinutes = Math.ceil((drivingDistance / this.averageSpeedMph) * 60);

      return {
        distance: Math.round(drivingDistance * 10) / 10, // Round to 1 decimal
        duration: durationInMinutes,
        distanceText: `${Math.round(drivingDistance * 10) / 10} mi`,
        durationText: `${durationInMinutes} mins`
      };
    } catch (error) {
      console.error('Error calculating distance:', error.message);
      throw error;
    }
  }

  /**
   * Get coordinates for an address using OpenStreetMap Nominatim (FREE!)
   * @param {string} address - Address to geocode
   * @returns {Promise<{lat: number, lng: number}>}
   */
  async geocodeAddress(address) {
    try {
      // Check cache first
      if (this.geocodeCache.has(address)) {
        return this.geocodeCache.get(address);
      }

      const response = await axios.get(`${this.nominatimUrl}/search`, {
        params: {
          q: address,
          format: 'json',
          limit: 1,
          addressdetails: 1
        },
        headers: {
          'User-Agent': 'MobileCarDetailingApp/1.0' // Required by Nominatim
        }
      });

      if (!response.data || response.data.length === 0) {
        throw new Error(`Address not found: ${address}`);
      }

      const result = response.data[0];
      const location = {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        formatted_address: result.display_name
      };

      // Cache the result
      this.geocodeCache.set(address, location);

      return location;
    } catch (error) {
      console.error('Error geocoding address:', error.message);
      throw new Error(`Unable to find address: ${address}. Please check the address and try again.`);
    }
  }

  /**
   * Calculate straight-line distance between two coordinates (Haversine formula)
   * Useful for quick checks before calling the API
   * @param {number} lat1 - Latitude of point 1
   * @param {number} lon1 - Longitude of point 1
   * @param {number} lat2 - Latitude of point 2
   * @param {number} lon2 - Longitude of point 2
   * @returns {number} Distance in miles
   */
  calculateStraightLineDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return Math.round(distance * 10) / 10; // Round to 1 decimal
  }

  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }
}

module.exports = new MapsService();
