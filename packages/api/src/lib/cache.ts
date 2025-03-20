import NodeCache from 'node-cache';

// Create cache instance with default TTL of 60 seconds
export const cache = new NodeCache({
  stdTTL: 60, // Time to live in seconds
  checkperiod: 120, // Cleanup dead entries every 2 minutes
});
