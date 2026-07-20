import path from 'path';

const VALID_NODE_ENVS = new Set(['development', 'test', 'production']);

function isHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isHttpOrigin(value) {
  const normalized = String(value || '').trim();
  try {
    const parsed = new URL(normalized);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && parsed.origin === normalized
      && !parsed.username
      && !parsed.password;
  } catch {
    return false;
  }
}

function isMongoUrl(value) {
  return /^mongodb(?:\+srv)?:\/\//i.test(String(value || '').trim());
}

function configured(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validPort(value) {
  const normalized = String(value || '').trim();
  if (!/^\d+$/.test(normalized)) return false;
  const port = Number(normalized);
  return Number.isSafeInteger(port) && port >= 1 && port <= 65_535;
}

/**
 * Return configuration errors without ever embedding environment values.
 * Production is deliberately strict because this application stores private
 * journal text and owner-scoped uploads.
 */
export function runtimeConfigErrors(env = process.env) {
  const errors = [];
  const nodeEnv = String(env.NODE_ENV || 'development').trim();

  if (!VALID_NODE_ENVS.has(nodeEnv)) errors.push('NODE_ENV must be development, test, or production');
  if (nodeEnv !== 'production') return errors;

  if (!isMongoUrl(env.MONGODB_URI)) errors.push('MONGODB_URI must be a MongoDB connection URL');

  const jwtSecret = String(env.JWT_SECRET || '');
  if (jwtSecret.length < 32 || /your[_-]|change[_-]?me|example/i.test(jwtSecret)) {
    errors.push('JWT_SECRET must be a non-placeholder value of at least 32 characters');
  }

  if (!isHttpOrigin(env.CLIENT_ORIGIN)) errors.push('CLIENT_ORIGIN must be an exact HTTP(S) origin without a path');

  if (configured(env.PORT) && !validPort(env.PORT)) {
    errors.push('PORT must be an integer from 1 through 65535');
  }

  if (configured(env.TRUST_PROXY_HOPS)) {
    const hops = String(env.TRUST_PROXY_HOPS).trim();
    if (!/^\d+$/.test(hops) || Number(hops) < 0 || Number(hops) > 10) {
      errors.push('TRUST_PROXY_HOPS must be an integer from 0 through 10');
    }
  }

  const smtpKeys = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
  const smtpConfigured = smtpKeys.some((key) => configured(env[key]));
  if (smtpConfigured && smtpKeys.some((key) => !configured(env[key]))) {
    errors.push('SMTP_HOST, SMTP_USER, and SMTP_PASS must be configured together');
  }
  if (smtpConfigured && !isHttpUrl(env.APP_BASE_URL)) {
    errors.push('APP_BASE_URL must be an absolute HTTP(S) URL when email is enabled');
  }
  if (smtpConfigured && configured(env.SMTP_PORT) && !validPort(env.SMTP_PORT)) {
    errors.push('SMTP_PORT must be an integer from 1 through 65535');
  }

  const uploadDir = String(env.PRIVATE_UPLOAD_DIR || '').trim();
  const isFilesystemRoot = path.isAbsolute(uploadDir)
    && path.resolve(uploadDir) === path.parse(path.resolve(uploadDir)).root;
  if (!configured(uploadDir) || !path.isAbsolute(uploadDir) || isFilesystemRoot) {
    errors.push('PRIVATE_UPLOAD_DIR must be an explicit absolute persistent-storage path');
  }

  if (String(env.EXPOSE_AUTH_TEST_CREDENTIALS || '').toLowerCase() === 'true') {
    errors.push('EXPOSE_AUTH_TEST_CREDENTIALS cannot be enabled in production');
  }
  if (String(env.EXPOSE_ROUTE_INSPECTOR || '').toLowerCase() === 'true') {
    errors.push('EXPOSE_ROUTE_INSPECTOR cannot be enabled in production');
  }

  return errors;
}

export function assertRuntimeConfig(env = process.env) {
  const errors = runtimeConfigErrors(env);
  if (!errors.length) return;
  const error = new Error(`Invalid runtime configuration: ${errors.join('; ')}`);
  error.code = 'E_RUNTIME_CONFIG';
  throw error;
}
