// Render the proposal HTML to a PDF Buffer via headless Puppeteer.
// A single browser instance is reused across calls.
import { proposalHtml } from './template.js';

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
      .launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
      .catch((err) => {
        browserPromise = null; // allow a retry on next call
        throw new Error(`PDF generation unavailable: could not launch headless Chromium (${err.message})`);
      });
  }
  return browserPromise;
}

export async function generateProposalPdf(event, { prices } = { prices: false }) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // 'load' (not 'networkidle0') with a bounded timeout so a slow/unreachable
    // font or image URL can't hang draft-reply indefinitely.
    await page.setContent(proposalHtml(event, { prices }), { waitUntil: 'load', timeout: 15000 });
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
