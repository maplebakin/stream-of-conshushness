import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import Upload from '../models/Upload.js';
import auth from '../middleware/auth.js';
import { logRequestError } from './errorHandler.js';
import {
  MAX_UPLOAD_BYTES,
  createOpaqueId,
  ensurePrivateUploadDir,
  privateUploadUrl,
  removeStoredUpload,
  sanitizeOriginalFilename,
  storagePathFor,
} from './privateUploadStorage.js';

const router = express.Router();
router.use(auth);

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const DOCUMENT_MIME_TYPES = new Set(['application/pdf', 'text/plain', 'text/markdown']);
const EXPECTED_FIELDS = new Set(['profilePicture', 'image', 'file']);

const EXTENSION_MIME = new Map([
  ['.png', new Set(['image/png'])],
  ['.jpg', new Set(['image/jpeg'])],
  ['.jpeg', new Set(['image/jpeg'])],
  ['.webp', new Set(['image/webp'])],
  ['.gif', new Set(['image/gif'])],
  ['.pdf', new Set(['application/pdf'])],
  ['.txt', new Set(['text/plain'])],
  ['.md', new Set(['text/markdown', 'text/plain'])],
]);

function getExtension(name) {
  return path.extname(String(name || '')).toLowerCase();
}

function allowedMimeForField(fieldname, mimetype) {
  return fieldname === 'profilePicture' || fieldname === 'image'
    ? IMAGE_MIME_TYPES.has(mimetype)
    : IMAGE_MIME_TYPES.has(mimetype) || DOCUMENT_MIME_TYPES.has(mimetype);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      cb(null, ensurePrivateUploadDir());
    } catch (error) {
      cb(error);
    }
  },
  filename: (_req, _file, cb) => cb(null, createOpaqueId()),
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
    fields: 8,
    fieldNameSize: 64,
  },
  fileFilter: (_req, file, cb) => {
    if (!EXPECTED_FIELDS.has(file.fieldname)) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    }
    const extensionMimes = EXTENSION_MIME.get(getExtension(file.originalname));
    if (!extensionMimes || !extensionMimes.has(file.mimetype) || !allowedMimeForField(file.fieldname, file.mimetype)) {
      return cb(new Error('Unsupported upload type'));
    }
    return cb(null, true);
  },
});

const receiveOneUpload = upload.fields([
  { name: 'profilePicture', maxCount: 1 },
  { name: 'image', maxCount: 1 },
  { name: 'file', maxCount: 1 },
]);

function uploadedFiles(req) {
  return Object.values(req.files || {}).flat();
}

async function removeIncomingFiles(req) {
  await Promise.all(uploadedFiles(req).map(async (file) => {
    try {
      await fs.promises.unlink(file.path);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }));
}

async function readHeader(filePath, length = 16) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return buffer;
  } finally {
    await handle.close();
  }
}

const SIGNATURE_CHECKS = {
  '.png': (buf) => buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a',
  '.jpg': (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  '.jpeg': (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  '.gif': (buf) => ['GIF87a', 'GIF89a'].includes(buf.slice(0, 6).toString('ascii')),
  '.webp': (buf) => buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP',
  '.pdf': (buf) => buf.slice(0, 5).toString('ascii') === '%PDF-',
};

function uploadErrorResponse(error) {
  if (error?.code === 'LIMIT_FILE_SIZE') return 'File is too large';
  if (error?.code === 'LIMIT_FILE_COUNT') return 'Only one file may be uploaded at a time';
  if (error?.code === 'LIMIT_UNEXPECTED_FILE') return 'Unexpected upload field';
  return 'Upload rejected';
}

router.post('/', (req, res) => {
  receiveOneUpload(req, res, async (error) => {
    if (error) {
      try {
        await removeIncomingFiles(req);
      } catch (cleanupError) {
        logRequestError('upload rejection cleanup failed', cleanupError, req, 500);
      }
      logRequestError('upload rejected', error, req, 400);
      return res.status(400).json({ error: uploadErrorResponse(error) });
    }

    const files = uploadedFiles(req);
    const file = files[0];
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (files.length !== 1 || file.size < 1) {
      await removeIncomingFiles(req);
      return res.status(400).json({ error: file.size < 1 ? 'Empty files are not allowed' : 'Only one file may be uploaded at a time' });
    }

    const extension = getExtension(file.originalname);
    const verify = SIGNATURE_CHECKS[extension];
    try {
      await fs.promises.chmod(file.path, 0o600);
      if (verify && !verify(await readHeader(file.path))) {
        await removeIncomingFiles(req);
        return res.status(400).json({ error: 'File content does not match its declared type' });
      }

      const fileId = createOpaqueId();
      const metadata = await Upload.create({
        fileId,
        ownerId: req.user.userId,
        originalName: sanitizeOriginalFilename(file.originalname),
        mimeType: file.mimetype,
        size: file.size,
        storageName: file.filename,
        resourceType: file.fieldname === 'profilePicture' ? 'profile-picture' : 'unattached',
        resourceId: file.fieldname === 'profilePicture' ? req.user.userId : null,
      });

      return res.status(201).json({
        id: metadata.fileId,
        field: file.fieldname,
        url: privateUploadUrl(metadata.fileId),
        filename: metadata.originalName,
        originalName: metadata.originalName,
        size: metadata.size,
        mimetype: metadata.mimeType,
      });
    } catch (uploadError) {
      try {
        await removeIncomingFiles(req);
      } catch (cleanupError) {
        logRequestError('upload metadata failure cleanup failed', cleanupError, req, 500);
      }
      logRequestError('upload metadata creation failed', uploadError, req, 500);
      return res.status(500).json({ error: 'Upload failed' });
    }
  });
});

router.get('/:fileId', async (req, res) => {
  try {
    const uploadMetadata = await Upload.findOne({
      fileId: req.params.fileId,
      ownerId: req.user.userId,
      deletedAt: null,
    }).lean();
    if (!uploadMetadata) return res.status(404).json({ error: 'File not found' });

    const storagePath = storagePathFor(uploadMetadata.storageName);
    const stats = await fs.promises.stat(storagePath);
    if (!stats.isFile()) return res.status(404).json({ error: 'File not found' });

    res.setHeader('Content-Type', uploadMetadata.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeOriginalFilename(uploadMetadata.originalName).replace(/"/g, '')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(storagePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      logRequestError('private upload storage object missing', error, req, 404);
      return res.status(404).json({ error: 'File not found' });
    }
    logRequestError('private upload download failed', error, req, 500);
    return res.status(500).json({ error: 'File unavailable' });
  }
});

export async function retireOwnedUpload(fileId, ownerId) {
  if (!fileId) return false;
  const uploadMetadata = await Upload.findOne({ fileId, ownerId, deletedAt: null });
  if (!uploadMetadata) return false;
  uploadMetadata.deletedAt = new Date();
  await uploadMetadata.save();
  try {
    await removeStoredUpload(uploadMetadata.storageName);
  } catch (error) {
    logRequestError('private upload retirement storage cleanup failed', error, null, 500);
  }
  return true;
}

export { MAX_UPLOAD_BYTES };
export default router;
