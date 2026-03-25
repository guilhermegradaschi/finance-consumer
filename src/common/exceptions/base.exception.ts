export class BaseException extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
  }
}

export class BusinessException extends BaseException {
  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message, code, context);
  }
}

export class InfrastructureException extends BaseException {
  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message, code, context);
  }
}
