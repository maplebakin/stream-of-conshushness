// utils/upload.js (ESM)
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = String(file.originalname).replace(/[^a-z0-9.\-_]/gi, "_");
    cb(null, `${Date.now()}_${safe}`);
  },
});

// Accept typical doc/image types; tweak as needed
const allowed = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "application/pdf", "text/plain", "text/markdown",
]);
const fileFilter = (_req, file, cb) => {
  // allow unknowns too; just warn
  if (!allowed.has(file.mimetype)) {
    console.warn("[upload] unusual mimetype:", file.mimetype);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter,
});

// Accept ANY field name and pick the first file
router.post("/", upload.any(), (req, res) => {
  const f = (req.files || [])[0];
  if (!f) {
    return res.status(400).json({
      error: "No file uploaded",
      hint: "Send multipart/form-data with a file field (e.g., -F 'file=@/path/to/file')",
    });
  }
  return res.json({
    filename: f.filename,
    field: f.fieldname,
    url: `/uploads/${f.filename}`,
    size: f.size,
    mimetype: f.mimetype,
  });
});

export default router;
