import { Injectable, LoggerService, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class AppLoggerService implements LoggerService {
  private context = 'Application';

  setContext(context: string): void {
    this.context = context;
  }

  log(message: string, context?: string): void {
    this.writeLog('info', message, context);
  }

  error(message: string, trace?: string, context?: string): void {
    this.writeLog('error', message, context, { trace });
  }

  warn(message: string, context?: string): void {
    this.writeLog('warn', message, context);
  }

  debug(message: string, context?: string): void {
    this.writeLog('debug', message, context);
  }

  verbose(message: string, context?: string): void {
    this.writeLog('verbose', message, context);
  }

  private writeLog(level: string, message: string, context?: string, extra?: Record<string, unknown>): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: context ?? this.context,
      message,
      service: process.env.APP_NAME ?? 'nf-processor',
      ...extra,
    };

    const output = JSON.stringify(logEntry);

    switch (level) {
      case 'error':
        process.stderr.write(output + '\n');
        break;
      default:
        process.stdout.write(output + '\n');
    }
  }
}
