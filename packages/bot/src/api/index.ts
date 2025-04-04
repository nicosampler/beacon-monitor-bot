import axios from 'axios';

import { env } from '../env.js';

// Create and export axios instance with base configuration
export const api = axios.create({
  baseURL: env.NODE_SENTINEL_API_URL,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.NODE_SENTINEL_API_SECRET_KEY}`,
  },
});
