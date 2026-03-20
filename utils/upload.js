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

const EXTENSION_MIME = new Map([
  [".png", new Set(["image/png"])],
  [".jpg", new Set(["image/jpeg"])],
  [".jpeg", new Set(["image/jpeg"])],
  [".webp", new Set(["image/webp"])],
  [".gif", new Set(["image/gif"])],
  [".pdf", new Set(["application/pdf"])],
  [".txt", new Set(["text/plain"])],
  [".md", new Set(["text/markdown", "text/plain"])],
]);

function getExtension(name) {
  return path.extname(String(name || "")).toLowerCase();
}

// Only allow these mime types + extensions
const fileFilter = (_req, file, cb) => {
  const ext = getExtension(file.originalname);
  const allowed = EXTENSION_MIME.get(ext);
  if (!allowed) {
    return cb(new Error("Unsupported file extension"), false);
  }
  if (!allowed.has(file.mimetype)) {
    return cb(new Error("Unsupported file type"), false);
  }
  cb(null, true);
};

async function readHeader(filePath, length = 16) {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return buffer;
  } finally {
    await handle.close();
  }
}

const SIGNATURE_CHECKS = {
  ".png": (buf) => buf.slice(0, 8).toString("hex") === "89504e470d0a1a0a",
  ".jpg": (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  ".jpeg": (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  ".gif": (buf) => {
    const sig = buf.slice(0, 6).toString("ascii");
    return sig === "GIF87a" || sig === "GIF89a";
  },
  ".webp": (buf) => {
    const riff = buf.slice(0, 4).toString("ascii");
    const webp = buf.slice(8, 12).toString("ascii");
    return riff === "RIFF" && webp === "WEBP";
  },
  ".pdf": (buf) => buf.slice(0, 5).toString("ascii") === "%PDF-",
};

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter,
});

// Accept ANY field name, pick the first file
router.post("/", upload.any(), async (req, res) => {
  const f = (req.files || [])[0];
  if (!f) {
    return res.status(400).json({
      error: "No file uploaded",
      hint: "Send multipart/form-data with a file field (e.g., -F 'file=@/path/to/file')",
    });
  }
  const ext = getExtension(f.originalname) || getExtension(f.filename);
  const verify = SIGNATURE_CHECKS[ext];
  if (verify) {
    try {
      const header = await readHeader(f.path);
      if (!verify(header)) {
        await fs.promises.unlink(f.path);
        return res.status(400).json({ error: "File content does not match extension" });
      }
    } catch (err) {
      console.error("[upload] signature check failed:", err);
      return res.status(500).json({ error: "Upload validation failed" });
    }
  }
  return res.json({
    filename: f.filename,
    field: f.fieldname,
    url: `/uploads/${f.filename}`,
    size: f.size,
    mimetype: f.mimetype,
  });
});

router.use((err, _req, res, next) => {
  if (!err) return next();
  return res.status(400).json({ error: err.message || "Upload failed" });
});

export default router;
