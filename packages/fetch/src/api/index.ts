import axios from 'axios';

// Create and export axios instance with base configuration
export const api = axios.create({
  baseURL: 'delete me',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer delete me`,
  },
});
