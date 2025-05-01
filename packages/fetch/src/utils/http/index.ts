import { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import createLogger from '@/src/lib/pino.js';

export function logRequest(request: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const logger = createLogger(null, false);
  logger.info(`${request.method?.toUpperCase()} ${request.url}`);
  return request;
}

export function logResponse(response: AxiosResponse): AxiosResponse {
  const logger = createLogger(null, false);
  const message = `<< ${
    response.status
  } ${response.config?.method?.toUpperCase()} ${response.config?.url}`;

  if (response.status == 200) {
    logger.info(message);
  } else {
    logger.error(message, response.data);
  }

  return response;
}
