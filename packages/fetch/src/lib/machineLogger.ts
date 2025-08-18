import logUpdate, { createLogUpdate } from 'log-update';

interface MachineLoggerOptions {
  machineId: string;
  showCursor?: boolean;
}

export class MachineLogger {
  private machineId: string;
  private logUpdate: typeof logUpdate;

  constructor(options: MachineLoggerOptions) {
    this.machineId = options.machineId;
    this.logUpdate = options.showCursor
      ? createLogUpdate(process.stdout, { showCursor: true })
      : logUpdate;
  }

  updateState(state: string, context?: Record<string, any>) {
    const timestamp = new Date().toLocaleTimeString();
    const contextStr = context ? ` | ${JSON.stringify(context)}` : '';

    this.logUpdate(`[${timestamp}] ${this.machineId}: ${state}${contextStr}`);
  }

  updateStateWithProgress(
    state: string,
    progress: { current: number; total: number },
    context?: Record<string, any>,
  ) {
    const timestamp = new Date().toLocaleTimeString();
    const percentage = Math.round((progress.current / progress.total) * 100);
    const progressBar = this.createProgressBar(percentage);
    const contextStr = context ? ` | ${JSON.stringify(context)}` : '';

    this.logUpdate(
      `[${timestamp}] ${this.machineId}: ${state} ${progressBar} ${percentage}% (${progress.current}/${progress.total})${contextStr}`,
    );
  }

  private createProgressBar(percentage: number): string {
    const width = 20;
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;

    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  done(message?: string) {
    const timestamp = new Date().toLocaleTimeString();
    const finalMessage = message ? ` - ${message}` : '';

    this.logUpdate.done();
    console.log(`[${timestamp}] ${this.machineId}: Completed${finalMessage}`);
  }

  error(error: string | Error) {
    const timestamp = new Date().toLocaleTimeString();
    const errorMessage = error instanceof Error ? error.message : error;

    this.logUpdate.done();
    console.error(`[${timestamp}] ${this.machineId}: ERROR - ${errorMessage}`);
  }

  clear() {
    this.logUpdate.clear();
  }
}

// Factory function to create machine loggers
export const createMachineLogger = (machineId: string, options?: { showCursor?: boolean }) => {
  return new MachineLogger({ machineId, ...options });
};
