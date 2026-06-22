// Gmail integration routes. Mounted at /api/gmail.
// Endpoints degrade gracefully when Gmail isn't configured/connected: they
// return a clear JSON error instead of crashing or leaking a stack trace.
import { Router } from 'express';
import { google } from 'googleapis';
import { events, items } from '../db.js';
import {
  exchangeCode,
  getAuthUrl,
  getAuthorizedClient,
  isConnected,
} from '../gmail/auth.js';
import { generateProposalPdf } from '../pdf/generate.js';

const router = Router();
const now = () => new Date().toISOString();

function withItems(event) {
  const list = items
    .where((i) => i.event_id === event.id)
    .sort((a, b) => a.order_index - b.order_index);
  return { ...event, items: list };
}

function gmailClient() {
  const auth = getAuthorizedClient();
  return google.gmail({ version: 'v1', auth });
}

// Pull a header value (case-insensitive) from a metadata-format message.
function header(payload, name) {
  const h = (payload?.headers || []).find(
    (x) => x.name.toLowerCase() === name.toLowerCase(),
  );
  return h ? h.value : '';
}

function decodeB64Url(data) {
  return Buffer.from(data, 'base64').toString('utf8');
}

// Recursively find the best plain-text body; fall back to stripped HTML.
function extractBody(payload) {
  if (!payload) return '';
  const walk = (part, wantHtml) => {
    if (!part) return '';
    if (part.mimeType === (wantHtml ? 'text/html' : 'text/plain') && part.body?.data) {
      return decodeB64Url(part.body.data);
    }
    for (const sub of part.parts || []) {
      const found = walk(sub, wantHtml);
      if (found) return found;
    }
    return '';
  };
  const plain = walk(payload, false);
  if (plain) return plain;
  const html = walk(payload, true);
  if (html) {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return '';
}

// Map a not-configured/not-connected error to a clean response.
function gmailErrorResponse(res, err, status) {
  const msg = err && err.message ? err.message : String(err);
  if (/not configured/i.test(msg)) {
    return res.status(status).json({ error: 'gmail_not_configured', message: 'Gmail אינו מוגדר בשרת' });
  }
  if (/not connected/i.test(msg)) {
    return res.status(status).json({ error: 'gmail_not_connected', message: 'Gmail אינו מחובר' });
  }
  return res.status(status).json({ error: 'gmail_error', message: msg });
}

// --- Status / OAuth -------------------------------------------------------

router.get('/status', (_req, res) => {
  try {
    res.json({ connected: isConnected() });
  } catch {
    res.json({ connected: false });
  }
});

router.get('/auth-url', (_req, res) => {
  try {
    res.json({ url: getAuthUrl() });
  } catch (err) {
    gmailErrorResponse(res, err, 409);
  }
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('<p>Missing code.</p>');
  }
  try {
    await exchangeCode(code);
  } catch (err) {
    return res
      .status(500)
      .send(`<p>שגיאה בהתחברות: ${String(err.message || err)}</p>`);
  }
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="utf-8" />
<title>התחברת בהצלחה</title>
<style>body{font-family:system-ui,Arial,sans-serif;text-align:center;padding:48px;color:#141414}</style>
</head><body>
<h2>התחברת בהצלחה</h2>
<p>אפשר לחזור לאפליקציה.</p>
<script>setTimeout(function(){ try { window.close(); } catch(e){} }, 500);</script>
</body></html>`);
});

// --- Messages -------------------------------------------------------------

router.get('/messages', async (req, res) => {
  const max = Math.min(Math.max(parseInt(req.query.max, 10) || 25, 1), 100);
  let gmail;
  try {
    gmail = gmailClient();
  } catch (err) {
    return gmailErrorResponse(res, err, 409);
  }
  try {
    const list = await gmail.users.messages.list({
      userId: 'me',
      maxResults: max,
      labelIds: ['INBOX'],
    });
    const messages = list.data.messages || [];
    const detailed = await Promise.all(
      messages.map(async (m) => {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id: m.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });
        const p = full.data.payload;
        return {
          id: full.data.id,
          threadId: full.data.threadId,
          from: header(p, 'From'),
          subject: header(p, 'Subject'),
          date: header(p, 'Date'),
          snippet: full.data.snippet || '',
        };
      }),
    );
    res.json(detailed);
  } catch (err) {
    gmailErrorResponse(res, err, 502);
  }
});

router.get('/messages/:id', async (req, res) => {
  let gmail;
  try {
    gmail = gmailClient();
  } catch (err) {
    return gmailErrorResponse(res, err, 409);
  }
  try {
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: req.params.id,
      format: 'full',
    });
    const p = full.data.payload;
    res.json({
      id: full.data.id,
      threadId: full.data.threadId,
      from: header(p, 'From'),
      subject: header(p, 'Subject'),
      date: header(p, 'Date'),
      body: extractBody(p),
    });
  } catch (err) {
    gmailErrorResponse(res, err, 502);
  }
});

// --- Create a day (event) from a message ----------------------------------

router.post('/create-day', async (req, res) => {
  const messageId = req.body?.message_id;
  if (!messageId) return res.status(400).json({ error: 'message_id required' });

  let gmail;
  try {
    gmail = gmailClient();
  } catch (err) {
    return gmailErrorResponse(res, err, 409);
  }

  let meta;
  try {
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    });
    const p = full.data.payload;
    meta = {
      message_id: full.data.id,
      thread_id: full.data.threadId,
      from: header(p, 'From'),
      subject: header(p, 'Subject'),
      date: header(p, 'Date'),
      snippet: full.data.snippet || '',
    };
  } catch (err) {
    return gmailErrorResponse(res, err, 502);
  }

  const title = meta.subject || `יום עבור ${meta.from || ''}`.trim();
  const event = events.insert({
    title,
    client_name: '',
    group_size: null,
    audience: '',
    requests: '',
    budget: null,
    target_date: null,
    target_month: null,
    target_season: null,
    status: 'draft',
    cover_photo: null,
    email: meta,
    created_at: now(),
    updated_at: now(),
  });
  res.status(201).json(withItems(event));
});

// --- Draft a reply with the no-prices proposal PDF attached ---------------

// Encode a string for a MIME header that may contain non-ASCII (RFC 2047).
function encodeHeader(value) {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function buildRawMessage({ to, subject, bodyText, pdfBuffer, pdfFilename, inReplyTo }) {
  const boundary = `bnd_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
    headers.push(`References: ${inReplyTo}`);
  }

  const filenameEnc = encodeHeader(pdfFilename);
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(bodyText, 'utf8').toString('base64'),
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filenameEnc}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filenameEnc}"`,
    '',
    pdfBuffer.toString('base64'),
    `--${boundary}--`,
    '',
  ];

  const raw = `${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}`;
  return Buffer.from(raw, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

router.post('/draft-reply', async (req, res) => {
  const eventId = req.body?.event_id;
  if (!eventId) return res.status(400).json({ error: 'event_id required' });

  const event = events.find(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });
  if (!event.email || !event.email.thread_id) {
    return res
      .status(400)
      .json({ error: 'no_linked_email', message: 'לאירוע אין מייל מקושר' });
  }

  let gmail;
  try {
    gmail = gmailClient();
  } catch (err) {
    return gmailErrorResponse(res, err, 409);
  }

  // Generate the no-prices proposal PDF.
  let pdfBuffer;
  try {
    pdfBuffer = await generateProposalPdf(withItems(event), { prices: false });
  } catch (err) {
    return res
      .status(503)
      .json({ error: 'pdf_unavailable', message: String(err.message || err) });
  }

  const origSubject = event.email.subject || '';
  const subject = origSubject.toLowerCase().startsWith('re:')
    ? origSubject
    : `Re: ${origSubject}`.trim();
  const to = event.email.from || '';
  const bodyText = `שלום,

מצורפת הצעה ליום שתכננו עבורכם. נשמח לשמוע מחשבות ולתאם המשך.

בברכה,
צוות Ocar`;

  try {
    const raw = buildRawMessage({
      to,
      subject,
      bodyText,
      pdfBuffer,
      pdfFilename: 'הצעה.pdf',
      inReplyTo: event.email.message_id,
    });
    const draft = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw,
          threadId: event.email.thread_id,
        },
      },
    });
    res.status(201).json({
      draft_id: draft.data.id,
      link: 'https://mail.google.com/mail/u/0/#drafts',
    });
  } catch (err) {
    gmailErrorResponse(res, err, 502);
  }
});

export default router;
