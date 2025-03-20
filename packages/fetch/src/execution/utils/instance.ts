import axios, { InternalAxiosRequestConfig } from 'axios';
import * as AxiosLogger from 'axios-logger';

import { limitRequests } from '@/src/execution/utils/rateLimiter.js';
import { logRequest, logResponse } from '@/src/utils/http/index.js';

export const instance = axios.create();

// interceptor to limit requests
instance.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  await limitRequests(() => Promise.resolve());
  logRequest(config);
  return config;
});
instance.interceptors.response.use(logResponse);

AxiosLogger.setGlobalConfig({
  data: false,
});
