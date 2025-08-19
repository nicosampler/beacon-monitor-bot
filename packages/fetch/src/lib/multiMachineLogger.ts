// logger.ts
import fs from 'fs';
import path from 'path';

interface MachineLogEntry {
  timestamp: string;
  state: string;
  context?: Record<string, any>;
}

interface MachineLogger {
  machineId: string;
  currentLog: MachineLogEntry | null;
}

export class MultiMachineLogger {
  private machines: Map<string, MachineLogger> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private logFilePath: string;

  constructor() {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    this.logFilePath = path.join(logsDir, 'machines-status.log');

    // Start the display update loop
    this.startDisplayLoop();
  }

  /**
   * Register a new machine or get existing one
   */
  private getOrCreateMachine(machineId: string): MachineLogger {
    if (!this.machines.has(machineId)) {
      this.machines.set(machineId, {
        machineId,
        currentLog: null,
      });
    }
    return this.machines.get(machineId)!;
  }

  /**
   * Add a log entry for a specific machine
   */
  addLog(machineId: string, state: string, context?: Record<string, any>) {
    const machine = this.getOrCreateMachine(machineId);
    const timestamp = new Date().toLocaleTimeString();

    const logEntry: MachineLogEntry = {
      timestamp,
      state,
      context,
    };

    machine.currentLog = logEntry;
  }

  /**
   * Update the display with all machine logs
   */
  private updateDisplay() {
    const lines: string[] = [];

    // Header
    lines.push('\x1b[1;36m╔══════════════════════════════════════════════════════════════\x1b[0m');
    lines.push('\x1b[1;36m║                    NodeSentinel - Machines Dashboard\x1b[0m');
    lines.push('\x1b[1;36m╚══════════════════════════════════════════════════════════════\x1b[0m');
    lines.push('');

    if (this.machines.size === 0) {
      lines.push('\x1b[2mNo machines registered yet...\x1b[0m');
      lines.push('');
      lines.push('\x1b[2;90mPress Ctrl+C to stop • ' + new Date().toLocaleString() + '\x1b[0m');
    } else {
      for (const [machineId, machine] of this.machines) {
        // Machine header
        lines.push(
          '\x1b[1;33m┌─ ' + machineId + ' ' + '─'.repeat(60 - machineId.length) + '\x1b[0m',
        );

        if (!machine.currentLog) {
          lines.push('\x1b[2m│  Waiting for first log...\x1b[0m');
          lines.push('\x1b[1;33m└' + '─'.repeat(62) + '\x1b[0m');
          lines.push('');
          continue;
        }

        const log = machine.currentLog;

        // Timestamp
        lines.push('\x1b[1;34m│  State reached at: \x1b[37m' + log.timestamp + '\x1b[0m');

        // State
        try {
          const stateObj = JSON.parse(log.state.replace('State: ', ''));
          lines.push('\x1b[1;32m│  Current State:\x1b[0m');

          const stateStr = JSON.stringify(stateObj, null, 2);
          const stateLines = stateStr.split('\n');
          stateLines.forEach((line) => {
            lines.push('\x1b[32m│    ' + line + '\x1b[0m');
          });
        } catch {
          const stateLine = log.state.length > 50 ? log.state.substring(0, 47) + '...' : log.state;
          lines.push('\x1b[32m│  State: ' + stateLine + '\x1b[0m');
        }

        // Context
        if (log.context && Object.keys(log.context).length > 0) {
          lines.push('\x1b[1;35m│  Context:\x1b[0m');

          const contextStr = JSON.stringify(log.context, null, 2);
          const contextLines = contextStr.split('\n');
          contextLines.forEach((line) => {
            lines.push('\x1b[35m│    ' + line + '\x1b[0m');
          });
        }

        // Footer
        lines.push('\x1b[1;33m└' + '─'.repeat(62) + '\x1b[0m');
        lines.push('');
      }

      // Footer
      lines.push('\x1b[2;90mPress Ctrl+C to stop • ' + new Date().toLocaleString() + '\x1b[0m');
    }

    // Write to file - completely overwrite each time
    try {
      fs.writeFileSync(this.logFilePath, lines.join('\n') + '\n');
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }

  /**
   * Start the display update loop
   */
  private startDisplayLoop() {
    // Initial display update
    this.updateDisplay();

    this.updateInterval = setInterval(() => {
      this.updateDisplay();
    }, 1000); // Update every 1 second
  }

  /**
   * Stop the display loop and persist the final state
   */
  done() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Write final message to file
    const finalMessage = '\n✅ Multi-machine logger stopped\n';
    try {
      fs.appendFileSync(this.logFilePath, finalMessage);
    } catch (error) {
      console.error('Error writing final message:', error);
    }
  }

  /**
   * Get the log file path for external monitoring
   */
  getLogFilePath(): string {
    return this.logFilePath;
  }
}

// Global instance
let globalMultiLogger: MultiMachineLogger | null = null;

/**
 * Get or create the global multi-machine logger instance
 */
export const getMultiMachineLogger = (): MultiMachineLogger => {
  if (!globalMultiLogger) {
    globalMultiLogger = new MultiMachineLogger();
  }
  return globalMultiLogger;
};

/**
 * Convenience function to add a log entry
 */
export const addMachineLog = (machineId: string, state: string, context?: Record<string, any>) => {
  const logger = getMultiMachineLogger();
  logger.addLog(machineId, state, context);
};
