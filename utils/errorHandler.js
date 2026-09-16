// Centralized, privacy-safe error handling utilities.

const SENSITIVE_FIELD_PATTERN = /(password|pass|token|secret|authorization|cookie|session|jwt|reset|text|content|html|notes?|description|title|source|excerpt|query|search|file|upload)/i;
const SAFE_FIELD_NAME_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/i;
const SAFE_IDENTIFIER_PATTERN = /^[a-z0-9_.:-]{1,128}$/i;
const SAFE_ERROR_NAMES = new Set([
  'Error', 'TypeError', 'SyntaxError', 'RangeError', 'ValidationError', 'CastError',
  'MongoServerError', 'MongooseError', 'JsonWebTokenError', 'TokenExpiredError', 'MulterError',
]);
const SAFE_ERROR_CODES = new Set([
  'E11000', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'LIMIT_FILE_SIZE',
  'LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE', 'E_WRITE_FAILED',
]);

function safeIdentifier(value) {
  const normalized = String(value || '').trim();
  return SAFE_IDENTIFIER_PATTERN.test(normalized) ? normalized : undefined;
}

function safeErrorCode(value) {
  if (Number.isInteger(value)) return value;
  const normalized = String(value || '').trim();
  return SAFE_ERROR_CODES.has(normalized) ? normalized : undefined;
}

function safeErrorName(value) {
  return SAFE_ERROR_NAMES.has(value) ? value : 'UnknownError';
}

function approximateJsonSize(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
  } catch {
    return undefined;
  }
}

function safeBodyFieldNames(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  return Object.keys(body)
    .filter((key) => SAFE_FIELD_NAME_PATTERN.test(key))
    .filter((key) => !SENSITIVE_FIELD_PATTERN.test(key))
    .slice(0, 30);
}

function safeMimeTypes(files) {
  const allFiles = Array.isArray(files) ? files : files ? [files] : [];
  return [...new Set(allFiles
    .map((file) => String(file?.mimetype || '').trim().toLowerCase())
    .filter((mimetype) => /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mimetype)))]
    .slice(0, 10);
}

function safeStackFrames(error) {
  if (typeof error?.stack !== 'string') return undefined;
  const frames = error.stack
    .split('\n')
    .slice(1)
    .map((line) => line.match(/\(?((?:file:\/\/)?[a-z0-9_./-]+\.m?js):(\d+):(\d+)\)?\s*$/i))
    .filter(Boolean)
    .slice(0, 12)
    .map((match) => `${match[1]}:${match[2]}:${match[3]}`);
  return frames.length ? frames : undefined;
}

/**
 * Produces operational metadata without serializing request values, headers,
 * queries, cookies, raw errors, or raw stacks. Keep this allowlist small.
 */
export function buildSafeErrorLog({ error, req, status, event = 'Unhandled request error' } = {}) {
  const body = req?.body;
  const requestId = safeIdentifier(req?.id);
  const userId = safeIdentifier(req?.user?.userId || req?.user?.id || req?.user?._id);
  const route = typeof req?.route?.path === 'string' ? req.route.path : undefined;
  const path = typeof req?.path === 'string' ? req.path : undefined;
  const fileList = Array.isArray(req?.files) ? req.files : req?.file ? [req.file] : [];
  const log = {
    timestamp: new Date().toISOString(),
    event,
    method: typeof req?.method === 'string' ? req.method : undefined,
    route,
    path,
    requestId,
    userId,
    status: Number.isInteger(status) ? status : undefined,
    errorName: safeErrorName(error?.name),
    errorCode: safeErrorCode(error?.code),
    bodyFieldNames: safeBodyFieldNames(body),
    bodyFieldCount: body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).length : 0,
    bodyBytes: approximateJsonSize(body),
    uploadCount: fileList.length || undefined,
    uploadMimeTypes: safeMimeTypes(fileList),
    stackFrames: safeStackFrames(error),
  };

  return Object.fromEntries(Object.entries(log).filter(([, value]) => value !== undefined));
}

export function logRequestError(event, error, req, status) {
  console.error(event, buildSafeErrorLog({ event, error, req, status }));
}

export function logSafeError(event, error, { status } = {}) {
  console.error(event, buildSafeErrorLog({ event, error, status }));
}

/**
 * Sanitize error messages for client responses.
 */
export function sanitizeError(error, context = '') {
  logSafeError(context || 'Sanitized error', error);
  return { error: 'An error occurred. Please try again later.' };
}

export const errorResponses = {
  badRequest: (res, message = 'Invalid request') => res.status(400).json({ error: message }),
  unauthorized: (res, message = 'Authentication required') => res.status(401).json({ error: message }),
  forbidden: (res, message = 'Access denied') => res.status(403).json({ error: message }),
  notFound: (res, message = 'Resource not found') => res.status(404).json({ error: message }),
  conflict: (res, message = 'Resource conflict') => res.status(409).json({ error: message }),
  validationError: (res, message = 'Validation failed') => res.status(422).json({ error: message }),
  tooManyRequests: (res, message = 'Too many requests. Please try again later.') => res.status(429).json({ error: message }),
  internalError: (res, context = '', error = null) => {
    if (error) logSafeError(context || 'Internal error', error, { status: 500 });
    const message = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : `Internal server error: ${context}`;
    return res.status(500).json({ error: message });
  },
};

/** Express error handling middleware. Place this at the end of the stack. */
export function globalErrorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  logRequestError('Unhandled request error', err, req, status);

  res.status(status).json({ error: 'An unexpected error occurred' });
}
