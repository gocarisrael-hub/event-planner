// Render the proposal HTML to a PDF Buffer via headless Puppeteer.
// A single browser instance is reused across calls.
import { readFile } from 'node:fs/promises';
import { dirname, basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Jimp } from 'jimp';
import { PDFDocument } from 'pdf-lib';
import { catalog } from '../db.js';
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
  // The cover/hero photo is embedded like any other so the hero band can render
  // it as a base64 data URI (Puppeteer has no base URL).
  if (event.cover_photo) paths.add(event.cover_photo);
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
const MIME_BY_EXT = {
  '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.avif': 'image/avif', '.bmp': 'image/bmp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};

async function buildPhotoMap(event) {
  const map = {};
  await Promise.all(
    collectPhotoPaths(event).map(async (src) => {
      const file = join(UPLOAD_DIR, basename(src));
      try {
        const img = await Jimp.read(file);
        if (img.width > MAX_WIDTH) img.resize({ w: MAX_WIDTH });
        const buf = await img.getBuffer('image/jpeg', { quality: JPEG_QUALITY });
        map[src] = `data:image/jpeg;base64,${buf.toString('base64')}`;
      } catch {
        // Jimp can't decode some formats (notably WebP). Rather than silently
        // drop the image, embed the original bytes so Chromium — which renders
        // those formats — still shows it (just not downscaled).
        try {
          const raw = await readFile(file);
          const mime = MIME_BY_EXT[extname(file).toLowerCase()] || 'image/jpeg';
          map[src] = `data:${mime};base64,${raw.toString('base64')}`;
        } catch (err) {
          // Truly missing/unreadable — omit it and say so in the logs.
          console.warn(`PDF: dropping image "${src}" — ${err.message}`);
        }
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

// Bundled fallback hero ("fun people") used when an event has no cover_photo and
// no activity/option photos at all, so the PDF always opens with a lively photo
// instead of the branded dark band. Embedded as a base64 data URI (Puppeteer has
// no base URL). Returns null if the file is missing so the branded cover stands in.
const DEFAULT_HERO_PATH = join(__dirname, '..', 'assets', 'default-hero.jpg');

async function readDefaultHeroDataUri() {
  try {
    const buf = await readFile(DEFAULT_HERO_PATH);
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

// Does the event have any usable hero photo embedded in the photo map? Mirrors
// the template's pickHero resolution (cover_photo → first activity/option photo).
function hasEmbeddedHero(event, photos) {
  if (event.cover_photo && photos[event.cover_photo]) return true;
  for (const it of event.items || []) {
    if (it.photos?.[0] && photos[it.photos[0]]) return true;
    for (const o of it.options || []) {
      if (o.photos?.[0] && photos[o.photos[0]]) return true;
    }
  }
  return false;
}

// Gather the unique files attached to the catalog activities used by this
// event's items (and their options). Deduped by file id; schedule order is
// preserved (items in schedule order, then options within each item).
function collectAttachments(event) {
  const seen = new Set();
  const out = [];
  const addFrom = (catalogId) => {
    if (!catalogId) return;
    const c = catalog.find(catalogId);
    if (!c) return;
    for (const f of c.files || []) {
      if (!f || !f.id || seen.has(f.id)) continue;
      // Only files explicitly marked for the proposal are appended.
      if (f.in_pdf !== true) continue;
      seen.add(f.id);
      out.push(f);
    }
  };
  for (const it of event.items || []) {
    addFrom(it.catalog_activity_id);
    for (const o of it.options || []) addFrom(o.catalog_activity_id);
  }
  return out;
}

const isPdf = (f) =>
  (f.type || '') === 'application/pdf' || extname(f.name || '').toLowerCase() === '.pdf';
const isJpeg = (f) =>
  /^image\/jpe?g$/.test(f.type || '') ||
  ['.jpg', '.jpeg'].includes(extname(f.name || '').toLowerCase());
const isPng = (f) =>
  (f.type || '') === 'image/png' || extname(f.name || '').toLowerCase() === '.png';

// Append the attached catalog files to the proposal PDF (whole files as pages):
// PDFs are copied page-for-page; JPEG/PNG images each get a fitted A4 page;
// any other type (docx/xlsx/…) is skipped with a warning. Wrapped so a bad
// attachment never breaks generation — on any failure the original buffer is
// returned unchanged. Returns the original buffer when there are no files.
async function appendAttachments(proposalBuffer, event) {
  const attachments = collectAttachments(event);
  if (attachments.length === 0) return proposalBuffer;
  try {
    const merged = await PDFDocument.load(proposalBuffer);
    for (const f of attachments) {
      try {
        const bytes = await readFile(join(UPLOAD_DIR, basename(f.url || f.name || '')));
        if (isPdf(f)) {
          const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const pages = await merged.copyPages(src, src.getPageIndices());
          for (const p of pages) merged.addPage(p);
        } else if (isJpeg(f) || isPng(f)) {
          const img = isPng(f) ? await merged.embedPng(bytes) : await merged.embedJpg(bytes);
          // A4 portrait at 72dpi, with a margin; scale the image to fit.
          const PAGE_W = 595.28;
          const PAGE_H = 841.89;
          const MARGIN = 28;
          const page = merged.addPage([PAGE_W, PAGE_H]);
          const maxW = PAGE_W - MARGIN * 2;
          const maxH = PAGE_H - MARGIN * 2;
          const scale = Math.min(maxW / img.width, maxH / img.height, 1);
          const w = img.width * scale;
          const h = img.height * scale;
          page.drawImage(img, {
            x: (PAGE_W - w) / 2,
            y: (PAGE_H - h) / 2,
            width: w,
            height: h,
          });
        } else {
          console.warn(`Skipping un-mergeable proposal attachment: ${f.name || f.url}`);
        }
      } catch (err) {
        console.warn(`Failed to append attachment "${f.name || f.url}": ${err.message}`);
      }
    }
    const out = await merged.save();
    return Buffer.from(out);
  } catch (err) {
    // A corrupt proposal buffer or any unexpected failure → fall back.
    console.warn(`Attachment merge failed, returning un-merged PDF: ${err.message}`);
    return proposalBuffer;
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

  // Reuse a healthy instance, but drop a crashed/disconnected one so a single
  // Chromium crash (e.g. an OOM on a memory-tight host) doesn't wedge EVERY
  // subsequent PDF until the server restarts.
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.connected) return existing;
    } catch {
      // A prior launch rejected; fall through and relaunch.
    }
    browserPromise = null;
  }

  browserPromise = puppeteer
    .launch({
      headless: true,
      // Use Puppeteer's bundled Chrome (env unset → undefined). The Debian
      // system Chromium would not launch in this container; the bundled build
      // does. Standard headless-in-container flags: --no-sandbox (no user
      // namespaces available), --disable-dev-shm-usage (route shared memory to
      // /tmp instead of the tiny /dev/shm), --disable-gpu (no GPU/display).
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    })
    .then((browser) => {
      // If Chromium dies later (crash/OOM/idle-kill), clear the cache so the
      // next call relaunches instead of handing out a dead browser.
      browser.on('disconnected', () => {
        browserPromise = null;
      });
      return browser;
    })
    .catch((err) => {
      browserPromise = null; // allow a retry on next call
      throw new Error(`PDF generation unavailable: could not launch headless Chromium (${err.message})`);
    });
  return browserPromise;
}

// Decode an image Jimp can't read (notably WebP) by handing it to Chromium —
// which renders every format the browser supports — and re-encoding it as JPEG
// through a canvas. Used by the Word export, whose .docx container accepts only
// jpg/png/gif/bmp/svg, so a WebP photo would otherwise be lost. `square` cover-
// crops to a box the way CSS object-fit: cover does, `cover` does the same to an
// explicit {w,h} band; otherwise the image is only downscaled to `maxWidthPx`.
// Returns { data, width, height }.
// Throws if Chromium is unavailable — callers treat that as "skip this photo".
export async function jpegViaChromium(buffer, mime, { square = 0, cover = null, maxWidthPx = 0 } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const uri = `data:${mime};base64,${buffer.toString('base64')}`;
    const out = await page.evaluate(
      async (src, box, maxW) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (box) {
          // Cover-crop: scale so the shorter side fills the box, center the rest.
          canvas.width = box.w;
          canvas.height = box.h;
          const scale = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight);
          const w = img.naturalWidth * scale;
          const h = img.naturalHeight * scale;
          ctx.drawImage(img, (box.w - w) / 2, (box.h - h) / 2, w, h);
        } else {
          const scale = maxW && img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
        return {
          dataUrl: canvas.toDataURL('image/jpeg', 0.8),
          width: canvas.width,
          height: canvas.height,
        };
      },
      uri,
      cover || (square ? { w: square, h: square } : null),
      maxWidthPx,
    );
    return {
      data: Buffer.from(out.dataUrl.slice(out.dataUrl.indexOf(',') + 1), 'base64'),
      width: out.width,
      height: out.height,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

export async function generateProposalPdf(event, { prices, budget = true, option = null } = { prices: false, budget: true, option: null }) {
  // Pre-resize/encode all photos before rendering so the PDF embeds small
  // JPEGs instead of full-size originals.
  const photos = await buildPhotoMap(event);
  const logo = await readLogoDataUri();
  // The hero/cover image: explicit cover_photo if present (and embeddable),
  // else the template derives one from the first activity photo in `photos`.
  let cover = event.cover_photo ? photos[event.cover_photo] || null : null;
  // Last resort: when the event has NO embeddable hero at all (no cover_photo and
  // no activity/option photos resolved), fall back to the bundled default "fun
  // people" hero so the top of the PDF always shows a lively photo instead of the
  // branded dark band. If the default file is missing, readDefaultHeroDataUri
  // returns null and the template renders the branded cover as before.
  if (!cover && !hasEmbeddedHero(event, photos)) {
    cover = await readDefaultHeroDataUri();
  }
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // 'load' (not 'networkidle0') with a bounded timeout so a slow/unreachable
    // font or image URL can't hang draft-reply indefinitely.
    await page.setContent(proposalHtml(event, { prices, budget, photos, logo, cover, option }), { waitUntil: 'load', timeout: 15000 });
    // A slim header/footer carries the wordmark + page numbers. The page `margin`
    // here reserves vertical space for them; the body CSS uses `@page{margin:0}`
    // and its own .page padding, so content never overlaps the footer band.
    const FOOT = '#9a9aa0';
    const out = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="width:100%; padding:0 12mm; font-family:Heebo,Arial,sans-serif;
          font-size:8px; color:${FOOT}; display:flex; justify-content:space-between; align-items:center;">
          <span>star הפקות · בונים ימי כיף וימי גיבוש</span>
          <span>עמוד <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
      margin: { top: '5mm', bottom: '8mm', left: '0mm', right: '0mm' },
    });
    // Modern Puppeteer returns a Uint8Array; normalize to a Node Buffer so
    // callers can rely on buffer.toString('base64') etc.
    const proposalBuffer = Buffer.isBuffer(out) ? out : Buffer.from(out);
    // Append any files attached to the catalog activities used by this event.
    return appendAttachments(proposalBuffer, event);
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
