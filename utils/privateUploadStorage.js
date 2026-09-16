import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const PRIVATE_UPLOAD_DIR = path.resolve(
  process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private-uploads')
);
export const PRIVATE_UPLOAD_URL_PREFIX = '/api/upload/';
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const OPAQUE_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9-]{27}$/i;

export function ensurePrivateUploadDir() {
  fs.mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true, mode: 0o700 });
  // An existing directory may have been created under a permissive umask.
  // Keep private diary attachments readable only by the service account.
  fs.chmodSync(PRIVATE_UPLOAD_DIR, 0o700);
  const stats = fs.statSync(PRIVATE_UPLOAD_DIR);
  if (!stats.isDirectory()) throw new Error('Private upload path is not a directory');
  fs.accessSync(PRIVATE_UPLOAD_DIR, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
  return PRIVATE_UPLOAD_DIR;
}

export function createOpaqueId() {
  return crypto.randomUUID();
}

export function privateUploadUrl(fileId) {
  return `${PRIVATE_UPLOAD_URL_PREFIX}${fileId}`;
}

export function fileIdFromPrivateUploadUrl(value) {
  if (typeof value !== 'string') return null;
  const fileId = value.trim().slice(PRIVATE_UPLOAD_URL_PREFIX.length);
  return value.trim().startsWith(PRIVATE_UPLOAD_URL_PREFIX) && OPAQUE_ID_PATTERN.test(fileId) ? fileId : null;
}

export function storagePathFor(storageName) {
  if (!OPAQUE_ID_PATTERN.test(String(storageName || ''))) throw new Error('Invalid upload storage key');
  return path.join(PRIVATE_UPLOAD_DIR, storageName);
}

export function sanitizeOriginalFilename(value) {
  const base = path.basename(String(value || 'upload'))
    .replace(/[\u0000-\u001f\u007f]/g, '_')
    .replace(/[^a-z0-9._ -]/gi, '_')
    .replace(/^\.+/, '')
    .trim();
  return (base || 'upload').slice(0, 120);
}

export async function removeStoredUpload(storageName) {
  try {
    await fs.promises.unlink(storagePathFor(storageName));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}
