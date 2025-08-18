import chalk from 'chalk';
import logUpdate from 'log-update';

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

  constructor() {
    // Start the display update loop
    this.startDisplayLoop();

    // Force initial display
    setTimeout(() => {
      this.updateDisplay();
    }, 50);
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

    // Header - ALWAYS show this first
    lines.push(chalk.bold.cyan('╔══════════════════════════════════════════════════════════════'));
    lines.push(chalk.bold.cyan('║                    NodeSentinel - Machines Dashboard'));
    lines.push(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════'));

    // Always add a small gap after header
    lines.push('');

    if (this.machines.size === 0) {
      lines.push(chalk.dim('No machines registered yet...'));
      lines.push('');
      lines.push(chalk.dim.gray('Press Ctrl+C to stop • ' + new Date().toLocaleString()));
      logUpdate(lines.join('\n'));
      return;
    }

    for (const [machineId, machine] of this.machines) {
      // Machine header
      lines.push(chalk.bold.yellow(`┌─ ${machineId} ${'─'.repeat(60 - machineId.length)}`));

      if (!machine.currentLog) {
        lines.push(chalk.dim('│  Waiting for first log...'));
        lines.push(chalk.bold.yellow('└' + '─'.repeat(62)));
        lines.push(''); // Add gap between machines
        continue;
      }

      const log = machine.currentLog;

      // Timestamp
      lines.push(chalk.bold.blue(`│  State reached at: ${chalk.white(log.timestamp)}`));

      // State
      try {
        const stateObj = JSON.parse(log.state.replace('State: ', ''));
        lines.push(chalk.bold.green(`│  Current State:`));

        const stateStr = JSON.stringify(stateObj, null, 2);
        const stateLines = stateStr.split('\n');
        stateLines.forEach((line, index) => {
          lines.push(chalk.green(`│    ${line}`));
        });
      } catch {
        const stateLine = log.state.length > 50 ? log.state.substring(0, 47) + '...' : log.state;
        lines.push(chalk.green(`│  State: ${stateLine}`));
      }

      // Context
      if (log.context && Object.keys(log.context).length > 0) {
        lines.push(chalk.bold.magenta(`│  Context:`));

        const contextStr = JSON.stringify(log.context, null, 2);
        const contextLines = contextStr.split('\n');
        contextLines.forEach((line) => {
          lines.push(chalk.magenta(`│    ${line}`));
        });
      }

      // Footer
      lines.push(chalk.bold.yellow('└' + '─'.repeat(62)));
      lines.push(''); // Add gap between machines
    }

    // Footer
    lines.push(chalk.dim.gray('Press Ctrl+C to stop • ' + new Date().toLocaleString()));

    logUpdate(lines.join('\n'));
  }

  /**
   * Start the display update loop
   */
  private startDisplayLoop() {
    // Initial display update
    this.updateDisplay();

    this.updateInterval = setInterval(() => {
      this.updateDisplay();
    }, 100); // Update every 100ms for smooth display
  }

  /**
   * Stop the display loop and persist the final state
   */
  done() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    logUpdate.done();
    console.log(chalk.green('\n✅ Multi-machine logger stopped'));
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
