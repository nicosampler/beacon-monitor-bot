import createLogger from "@/src/lib/pino.js";
import { AxiosResponse, InternalAxiosRequestConfig } from "axios";

const LOGS_ENABLED = false;

export function logRequest(
  request: InternalAxiosRequestConfig
): InternalAxiosRequestConfig {
  const logger = createLogger(null, LOGS_ENABLED);
  logger.info(
    // body: request.data,
    `${request.method?.toUpperCase()} ${request.url}`
  );
  return request;
}

export function logResponse(response: AxiosResponse): AxiosResponse {
  const logger = createLogger(null, LOGS_ENABLED);
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
