import Pino, { DestinationStream, pino } from "pino";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log configuration
const LOG_OUTPUT = process.env.LOG_OUTPUT || "console";
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
const createLogger = (context: string | null) => {
  const logWithContext = (
    level: "info" | "warn" | "error" | "debug",
    message: string,
    ...args: any[]
  ) => {
    const logObject = context ? { context, ...args } : args;

    if (
      context?.includes("pullAttestations") ||
      context?.includes("pullCommittee")
    )
      return;

    logger[level](logObject, message);
  };

  return {
    info: (message: string, ...args: any[]) =>
      logWithContext("info", message, ...args),
    warn: (message: string, ...args: any[]) =>
      logWithContext("warn", message, ...args),
    error: (message: string, ...args: any[]) =>
      logWithContext("error", message, ...args),
    debug: (message: string, ...args: any[]) =>
      logWithContext("debug", message, ...args),
  };
};
// Define the Logger type using ReturnType based on the createLogger function
export type CustomLogger = ReturnType<typeof createLogger>;

// Configure log destination and prettifier
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

// Create the logger
const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    base: null, // This removes pid and hostname
    transport, // Use the transport configuration here
  },
  LOG_OUTPUT === "file" ? logDestination : undefined
);

// Ensure the logs directory exists if file output is used
if (LOG_OUTPUT === "file") {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Function to rotate logs daily
const rotateLogsDaily = () => {
  if (LOG_OUTPUT === "file" && logDestination) {
    const newLogPath = path.join(logsDir, getCurrentLogFileName());
    (logDestination as any).reopen(newLogPath);
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
