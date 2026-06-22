// Photo uploads (multer → server/uploads, served statically at /uploads).
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import multer from 'multer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOADS_DIR || join(__dirname, '..', 'uploads');

// Ensure the upload target exists (e.g. a fresh Railway volume).
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

const router = Router();

router.post('/', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no image uploaded' });
  res.status(201).json({ path: `/uploads/${req.file.filename}` });
});

export default router;
