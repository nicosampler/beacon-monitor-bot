import pinoms from "pino-multi-stream";
import childProcess from "child_process";
import stream from "stream";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// Convert the URL of the current module to a file path.
const __filename = fileURLToPath(import.meta.url);
// Get the directory name of the current module to ensure file paths are correct.
const __dirname = dirname(__filename);

// Paths where logs should be saved.
const logPath = `${__dirname}/../../logs/logs.log`;

// Display the full paths where log files are generated.
console.log(`Logs will be saved to: ${logPath}`);

// Resolve the path to the pino-tee script, ensuring it's correctly located.
const pinoTeePath = `${__dirname}/../../node_modules/pino-tee/tee.js`;
console.log(`Using pino-tee at: ${pinoTeePath}`);

// Spawn a child process to handle logs with pino-tee for filtering and saving to files.
const child = childProcess.spawn(
  process.execPath,
  [pinoTeePath, "warn", logPath, "info", logPath, "error", logPath],
  { cwd: __dirname, env: process.env } // Set the working directory and environment for the child process.
);

// Create a pass-through stream to pipe logs to the child process.
const logThrough = new stream.PassThrough();
// Create a pretty printing stream for console output.
const prettyStream = pinoms.prettyStream();

// Setup multiple streams for logging: one for the pass-through and one for pretty printing.
const streams = [{ stream: logThrough }, { stream: prettyStream }];

// Pipe the logThrough stream to the stdin of the child process handling pino-tee.
logThrough.pipe(child.stdin);

// Initialize the pino logger with multiple streams configuration.
const logger = pinoms({ streams });

export const createLogger = (context: string) => {
  return {
    info: (message: string, ...args: any[]) => {
      logger.info(`${context} - ${message}`, ...args);
    },
    warn: (message: string, ...args: any[]) => {
      logger.warn(`${context} - ${message}`, ...args);
    },
    error: (message: string, ...args: any[]) => {
      logger.error(`${context} - ${message}`, ...args);
    },
    debug: (message: string, ...args: any[]) => {
      logger.debug(`${context} - ${message}`, ...args);
    },
  };
};

export default createLogger;

export { logger };
