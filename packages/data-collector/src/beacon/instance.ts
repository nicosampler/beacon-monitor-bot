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

// log response
// instance.interceptors.response.use(async (response) => {
//   debugger;
//   // write down your response intercept.
//   console.log(new Date().toISOString());
//   if (response.status == 404) {
//     console.log("404 error");
//   } else {
//     AxiosLogger.responseLogger(response as any);
//   }
//   return response;
// });

AxiosLogger.setGlobalConfig({
  data: false,
});
