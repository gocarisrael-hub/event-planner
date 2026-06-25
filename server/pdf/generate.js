// Render the proposal HTML to a PDF Buffer via headless Puppeteer.
// A single browser instance is reused across calls.
import { readFile } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Jimp } from 'jimp';
import { proposalHtml } from './template.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve uploads the same way server/routes/uploads.js does so a stored photo
// path like "/uploads/<file>" maps to "<UPLOADS_DIR>/<basename>".
const UPLOAD_DIR = process.env.UPLOADS_DIR || join(__dirname, '..', 'uploads');

const MAX_WIDTH = 1000; // only downscale, never upscale
const JPEG_QUALITY = 78;

// Collect every photo path referenced anywhere in the event (item.photos[] and
// option.photos[]), de-duplicated.
function collectPhotoPaths(event) {
  const paths = new Set();
  for (const it of event.items || []) {
    for (const p of it.photos || []) if (p) paths.add(p);
    for (const o of it.options || []) {
      for (const p of o.photos || []) if (p) paths.add(p);
    }
  }
  return [...paths];
}

// Build a map { originalStoredPath: dataUri } where each photo has been read
// from disk, downscaled to MAX_WIDTH (only if larger), re-encoded as JPEG and
// base64-embedded. Missing/unreadable files are skipped. This replaces the old
// full-size synchronous embedding and shrinks the PDF dramatically.
async function buildPhotoMap(event) {
  const map = {};
  await Promise.all(
    collectPhotoPaths(event).map(async (src) => {
      try {
        const img = await Jimp.read(join(UPLOAD_DIR, basename(src)));
        if (img.width > MAX_WIDTH) img.resize({ w: MAX_WIDTH });
        const buf = await img.getBuffer('image/jpeg', { quality: JPEG_QUALITY });
        map[src] = `data:image/jpeg;base64,${buf.toString('base64')}`;
      } catch {
        // Missing or unreadable — omit it; the template drops the <img>.
      }
    }),
  );
  return map;
}

// Read the brand logo from disk and base64-encode it as a data URI. Puppeteer's
// setContent has no base URL, so the logo must be embedded (not a /brand path).
// Returns null if the file is missing/unreadable so PDF generation still works.
const LOGO_PATH = join(__dirname, '..', 'assets', 'star-logo.jpeg');

async function readLogoDataUri() {
  try {
    const buf = await readFile(LOGO_PATH);
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

let browserPromise = null;

async function getBrowser() {
  // Lazy-require puppeteer so a missing/broken install only fails at call time
  // (and produces a clear error), never at module load.
  let puppeteer;
  try {
    ({ default: puppeteer } = await import('puppeteer'));
  } catch (err) {
    throw new Error(`PDF generation unavailable: puppeteer not installed (${err.message})`);
  }

  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
      .catch((err) => {
        browserPromise = null; // allow a retry on next call
        throw new Error(`PDF generation unavailable: could not launch headless Chromium (${err.message})`);
      });
  }
  return browserPromise;
}

export async function generateProposalPdf(event, { prices } = { prices: false }) {
  // Pre-resize/encode all photos before rendering so the PDF embeds small
  // JPEGs instead of full-size originals.
  const photos = await buildPhotoMap(event);
  const logo = await readLogoDataUri();
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // 'load' (not 'networkidle0') with a bounded timeout so a slow/unreachable
    // font or image URL can't hang draft-reply indefinitely.
    await page.setContent(proposalHtml(event, { prices, photos, logo }), { waitUntil: 'load', timeout: 15000 });
    const out = await page.pdf({ format: 'A4', printBackground: true });
    // Modern Puppeteer returns a Uint8Array; normalize to a Node Buffer so
    // callers can rely on buffer.toString('base64') etc.
    return Buffer.isBuffer(out) ? out : Buffer.from(out);
  } finally {
    await page.close().catch(() => {});
  }
}

export async function closeBrowser() {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      await b.close();
    } catch {
      // ignore
    }
    browserPromise = null;
  }
}
