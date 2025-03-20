import memoizee from 'memoizee';
import ms from 'ms';

import { env } from '../env.js';

async function fetchTokenPrice(): Promise<number> {
  try {
    const response = await fetch(
      `${env.COINGECKO_TOKEN_PRICE_API_URL}?ids=${env.COINGECKO_TOKEN_NAME}&vs_currencies=usd`,
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data[env.COINGECKO_TOKEN_NAME].usd;
  } catch (error) {
    console.error('Error fetching token price:', error);
    throw error;
  }
}

// Memoize the function with a 1-minute TTL
export const getTokenPrice = memoizee(fetchTokenPrice, {
  promise: true, // Handle async function
  maxAge: ms('1m'), // 1 minute in milliseconds
  preFetch: true, // Start fetching new value before cache expires
  primitive: true, // No complex cache key comparison needed
});

// Optional: Add a method to clear the cache if needed
export const clearTokenPriceCache = () => {
  getTokenPrice.clear();
};
