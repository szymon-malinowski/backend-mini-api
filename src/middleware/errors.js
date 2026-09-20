export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorHandler(logger = console) {
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.too.large') error = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 64 KiB.');
    else if (error.type === 'entity.parse.failed') error = new ApiError(400, 'INVALID_JSON', 'Malformed JSON body.');
    else if (error.status === 415) error = new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use UTF-8 application/json without compression.');
    else if (error.type === 'request.aborted' || error.type === 'request.size.invalid') {
      error = new ApiError(400, 'INVALID_REQUEST', 'Invalid request body.');
    }
    if (!(error instanceof ApiError)) {
      // Deliberately allowlist log fields: error messages can contain SQL or credentials.
      logger.error({ event: 'request_failed', requestId: req.id });
      error = new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
    }
    const body = { code: error.code, message: error.message };
    if (error.details) body.details = error.details;
    res.status(error.status).json({ error: body });
  };
}
