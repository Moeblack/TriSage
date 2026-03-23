const LOG_LEVELS: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private static instance: Logger;
  private logLevel: string = "info";

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLogLevel(level: string): void {
    this.logLevel = level;
  }

  private shouldLog(level: string): boolean {
    return (LOG_LEVELS[level] ?? 1) >= (LOG_LEVELS[this.logLevel] ?? 1);
  }

  private format(level: string, msg: string): string {
    return `[${new Date().toISOString()}] [${level.toUpperCase()}] [TriSage] ${msg}`;
  }

  debug(msg: string, ...args: any[]) { if (this.shouldLog("debug")) console.debug(this.format("debug", msg), ...args); }
  info(msg: string, ...args: any[]) { if (this.shouldLog("info")) console.info(this.format("info", msg), ...args); }
  warn(msg: string, ...args: any[]) { if (this.shouldLog("warn")) console.warn(this.format("warn", msg), ...args); }
  error(msg: string, ...args: any[]) { if (this.shouldLog("error")) console.error(this.format("error", msg), ...args); }
}

export const logger = Logger.getInstance();
