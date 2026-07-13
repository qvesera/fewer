/**
 * Type-safe error system for fewer.
 * Provides structured error types, severity levels, and validation results.
 */

export enum ErrorType {
  CONNECTION_INVALID = "CONNECTION_INVALID",
  FILE_SYSTEM_UNAVAILABLE = "FILE_SYSTEM_UNAVAILABLE",
  FILE_SYSTEM_PERMISSION_DENIED = "FILE_SYSTEM_PERMISSION_DENIED",
  DIRECTORY_NOT_FOUND = "DIRECTORY_NOT_FOUND",
  RENAME_FAILED = "RENAME_FAILED",
  DELETE_FAILED = "DELETE_FAILED",
  EXPORT_FAILED = "EXPORT_FAILED",
  LAYOUT_FAILED = "LAYOUT_FAILED",
  NODE_NOT_FOUND = "NODE_NOT_FOUND",
  DUPLICATE_NAME = "DUPLICATE_NAME",
  UNKNOWN = "UNKNOWN",
}

export enum ErrorSeverity {
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
  CRITICAL = "critical",
}

export interface AppError {
  id: string;
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  details?: string;
  timestamp: number;
  recoverable: boolean;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  errorType?: ErrorType;
}

/**
 * Create a structured AppError with a unique ID and timestamp.
 */
export function createAppError(
  type: ErrorType,
  message: string,
  options: {
    severity?: ErrorSeverity;
    details?: string;
    recoverable?: boolean;
  } = {}
): AppError {
  return {
    id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    severity: options.severity ?? ErrorSeverity.ERROR,
    message,
    details: options.details,
    timestamp: Date.now(),
    recoverable: options.recoverable ?? true,
  };
}

/**
 * Map a native DOMException or Error to an AppError.
 */
export function fromNativeError(err: unknown): AppError {
  if (err instanceof DOMException) {
    if (err.name === "AbortError") {
      return createAppError(
        ErrorType.UNKNOWN,
        "Operation cancelled by user.",
        { severity: ErrorSeverity.INFO, recoverable: true }
      );
    }
    if (err.name === "NotFoundError") {
      return createAppError(
        ErrorType.DIRECTORY_NOT_FOUND,
        "The file or directory was not found on disk.",
        { details: err.message, recoverable: true }
      );
    }
    if (err.name === "SecurityError") {
      return createAppError(
        ErrorType.FILE_SYSTEM_PERMISSION_DENIED,
        "Permission denied. Your browser may be blocking File System Access.",
        { details: err.message, recoverable: true }
      );
    }
  }
  if (err instanceof Error) {
    return createAppError(ErrorType.UNKNOWN, err.message, { recoverable: true });
  }
  return createAppError(ErrorType.UNKNOWN, "An unknown error occurred.", {
    recoverable: false,
  });
}
