import axios, { InternalAxiosRequestConfig } from 'axios';
import { setupCache } from 'axios-cache-interceptor';
import ms from 'ms';

import { limitRequests } from '@/src/beacon/utils/rateLimiter.js';
import { logRequest, logResponse } from '@/src/lib/httpPino.js';

const _instance = axios.create();

export const instance = setupCache(_instance, {
  ttl: ms('10s'),
});

// interceptor to limit requests
instance.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  await limitRequests();
  logRequest(config);
  return config;
});
instance.interceptors.response.use(logResponse);
