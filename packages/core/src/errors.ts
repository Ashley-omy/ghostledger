/** Same error codes as docs/openapi.yaml, so the UI can treat local and proxy errors the same way. */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_IMAGE'
  | 'EXTRACTION_FAILED'
  | 'MODE_UNAVAILABLE'
  | 'MODEL_NOT_DOWNLOADED'
  | 'INTERNAL';

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  BAD_REQUEST: 'Something in the request is invalid.',
  NOT_FOUND: 'Not found.',
  PAYLOAD_TOO_LARGE: 'The image is larger than 10 MB.',
  INVALID_IMAGE: 'This file is not an image.',
  EXTRACTION_FAILED: 'Could not read a receipt from this image. Try a sharper photo.',
  MODE_UNAVAILABLE: 'Neither Offline nor Online mode can be used right now.',
  MODEL_NOT_DOWNLOADED: 'Download the offline model in Settings first.',
  INTERNAL: 'Something went wrong.',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? DEFAULT_MESSAGES[code], options);
    this.name = 'AppError';
    this.code = code;
  }
}

/** `message` is safe to show in the UI as-is. */
export function toUserMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  return DEFAULT_MESSAGES.INTERNAL;
}
