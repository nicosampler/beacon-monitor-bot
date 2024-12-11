import Pino, { DestinationStream, pino } from "pino";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "@/src/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log configuration
const LOG_OUTPUT = env.LOG_OUTPUT || "console";
const logsDir = path.join(__dirname, "../../logs");

// Function to get the current day's log file name
const getCurrentLogFileName = () => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  return `${day}-${month}-${year}.log`;
};

// Function to create a logger with optional context
const createLogger = (context: string | null, enabled: boolean = true) => {
  const logWithContext = (
    level: "info" | "warn" | "error" | "debug",
    message: string,
    ...args: any[]
  ) => {
    // Only log if enabled is true
    if (!enabled) return;

    const logObject = context ? { context, ...args } : args;
    logger[level](logObject, message);
  };

  return {
    info: (message: string, ...args: any[]) =>
      logWithContext("info", message, ...args),
    warn: (message: string, ...args: any[]) =>
      logWithContext("warn", message, ...args),
    error: (message: string, error: any) => {
      console.error(message, error);
      logWithContext("error", message, error);
    },
    debug: (message: string, ...args: any[]) =>
      logWithContext("debug", message, ...args),
  };
};
// Define the Logger type using ReturnType based on the createLogger function
export type CustomLogger = ReturnType<typeof createLogger>;

// Modify the logger creation to be a function
const createPinoLogger = () => {
  let logDestination: DestinationStream | undefined;
  let transport;
  if (LOG_OUTPUT === "file") {
    const logPath = path.join(logsDir, getCurrentLogFileName());
    logDestination = Pino.destination({ dest: logPath, sync: false });
    transport = {
      target: "pino-pretty",
      options: {
        destination: logPath,
        colorize: false, // Disable colors for file output
      },
    };
  } else {
    transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
      },
    };
  }

  return pino(
    {
      level: env.LOG_LEVEL || "info",
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
      base: null, // This removes pid and hostname
      transport, // Use the transport configuration here
    },
    LOG_OUTPUT === "file" ? logDestination : undefined
  );
};

// Create the initial logger
let logger = createPinoLogger();

// Ensure the logs directory exists if file output is used
if (LOG_OUTPUT === "file") {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Function to rotate logs daily
const rotateLogsDaily = () => {
  if (LOG_OUTPUT === "file") {
    // Create a new logger instance with the new file
    logger = createPinoLogger();
    console.log("Log rotated to new file:", getCurrentLogFileName());
  }
};

// Calculate milliseconds until midnight
const msUntilMidnight = () => {
  const now = new Date();
  const midnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );
  return midnight.getTime() - now.getTime();
};

// Set up daily log rotation at midnight
setTimeout(() => {
  rotateLogsDaily();
  setInterval(rotateLogsDaily, 24 * 60 * 60 * 1000);
}, msUntilMidnight());

export default createLogger;
