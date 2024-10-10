import { logRequest, logResponse } from "@/src/utils/http/index.js";
import { limitRequests } from "@/src/utils/rateLimiter/beaconRateLimiter.js";
import axios, { InternalAxiosRequestConfig } from "axios";
import * as AxiosLogger from "axios-logger";

export const instance = axios.create();

// interceptor to limit requests
instance.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    await limitRequests(() => Promise.resolve());
    logRequest(config);
    return config;
  }
);
instance.interceptors.response.use(logResponse);

AxiosLogger.setGlobalConfig({
  data: false,
});
