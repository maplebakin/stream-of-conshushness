import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import auth from "../middleware/auth.js";

const router = express.Router();
router.use(auth);

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = String(file.originalname).replace(/[^a-z0-9.\-_]/gi, "_");
    cb(null, `${Date.now()}_${safe}`);
  },
});

// Only allow these mime types
const allowed = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "application/pdf", "text/plain", "text/markdown",
]);
const fileFilter = (_req, file, cb) => {
  if (!allowed.has(file.mimetype)) {
    return cb(new Error("Unsupported file type"), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter,
});

// Accept ANY field name, pick the first file
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
