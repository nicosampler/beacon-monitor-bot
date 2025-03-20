type AppErrorType =
  | 'GENERAL_ERROR'
  | 'BD_ERROR'
  | 'EVM_ERROR'
  | 'TELEGRAM_DATA_ERROR'
  | 'TELEGRAM_INTERACTION_ERROR'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'BOT_LIMIT_REACHED'
  | 'UNAUTHORIZED';

export class AppError extends Error {
  public errorCode: string;
  public originalError?: unknown;

  constructor(message: string, errorCode: AppErrorType, originalError?: unknown) {
    super(message);
    this.name = 'BotError';
    this.errorCode = errorCode;
    this.originalError = originalError;
    Error.captureStackTrace(this, AppError);
  }

  toString(): string {
    return `${this.name}-${this.errorCode}:  ${this.message}`;
  }
}
