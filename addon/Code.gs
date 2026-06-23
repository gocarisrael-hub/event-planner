/**
 * Ocar Fun Day — Gmail add-on
 *
 * While reading a client's request email, the user can:
 *   1. "צור יום ב-Ocar"  — create a fun day in the hosted app with this email attached.
 *   2. "השב עם הצעה (ללא מחירים)" — attach a no-prices proposal PDF to a draft reply.
 *
 * The add-on runs AS the user (Apps Script). It reads the current message and
 * creates the draft itself via GmailApp. It only calls the backend to:
 *   (a) create the day, and (b) fetch the proposal PDF.
 *
 * Backend contract:
 *   POST {BACKEND_URL}/api/addon/create-day
 *        JSON { message_id, thread_id, from, subject, date, snippet, body }
 *        -> 201 { event_id, url }
 *   GET  {BACKEND_URL}/api/addon/proposal-pdf?event_id=<id>   (or ?thread_id=<t>)
 *        -> 200 application/pdf
 *   All requests send header  X-Addon-Key: <ADDON_API_KEY>
 *
 * Config is read from Script Properties: BACKEND_URL, ADDON_API_KEY.
 */

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

/**
 * Reads BACKEND_URL / ADDON_API_KEY from Script Properties.
 * Returns { ok:true, backendUrl, apiKey } or { ok:false, card } where card
 * is a CardService card explaining what is missing.
 */
function cfg_() {
  var props = PropertiesService.getScriptProperties();
  var backendUrl = (props.getProperty('BACKEND_URL') || '').replace(/\/+$/, '');
  var apiKey = props.getProperty('ADDON_API_KEY') || '';

  if (!backendUrl || !apiKey) {
    var missing = [];
    if (!backendUrl) missing.push('BACKEND_URL');
    if (!apiKey) missing.push('ADDON_API_KEY');
    var card = CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader().setTitle('Ocar Fun Day — הגדרה חסרה'))
      .addSection(
        CardService.newCardSection().addWidget(
          CardService.newTextParagraph().setText(
            'חסרים מאפייני סקריפט: <b>' + missing.join(', ') + '</b>.<br><br>' +
            'יש להגדיר אותם ב-Project Settings → Script Properties:<br>' +
            '• <b>BACKEND_URL</b> — כתובת האפליקציה (למשל https://your-app.up.railway.app)<br>' +
            '• <b>ADDON_API_KEY</b> — מפתח שתואם לזה שבשרת.'
          )
        )
      )
      .build();
    return { ok: false, card: card };
  }
  return { ok: true, backendUrl: backendUrl, apiKey: apiKey };
}

/* ------------------------------------------------------------------ */
/* Thread -> event mapping                                             */
/* ------------------------------------------------------------------ */
/*
 * After a day is created we remember { event_id, url } keyed by the Gmail
 * thread id, so the reply button knows which event's PDF to fetch. We use
 * Script Properties (durable, shared across the user's sessions) with a
 * namespaced key. (CacheService would expire after ~6h; properties persist.)
 */

function mapKey_(threadId) {
  return 'thread:' + threadId;
}

function rememberEvent_(threadId, eventId, url) {
  if (!threadId) return;
  PropertiesService.getScriptProperties().setProperty(
    mapKey_(threadId),
    JSON.stringify({ event_id: eventId, url: url })
  );
}

function lookupEvent_(threadId) {
  if (!threadId) return null;
  var raw = PropertiesService.getScriptProperties().getProperty(mapKey_(threadId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Message access                                                      */
/* ------------------------------------------------------------------ */

/**
 * Grants access to the current message and returns the GmailMessage.
 * `e` is the Gmail add-on event object.
 */
function currentMessage_(e) {
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  return GmailApp.getMessageById(e.gmail.messageId);
}

/* ------------------------------------------------------------------ */
/* Contextual trigger — build the panel                               */
/* ------------------------------------------------------------------ */

function onGmailMessage(e) {
  var conf = cfg_();
  // We still show the panel even if config is missing, so the user sees why.
  var message = currentMessage_(e);
  var subject = message.getSubject() || '(ללא נושא)';
  var from = message.getFrom() || '';
  var threadId = message.getThread().getId();

  var existing = lookupEvent_(threadId);

  var builder = CardService.newCardBuilder().setHeader(
    CardService.newCardHeader()
      .setTitle('Ocar Fun Day')
      .setSubtitle('יצירת יום כיף מתוך פניית לקוח')
  );

  var info = CardService.newCardSection()
    .addWidget(
      CardService.newDecoratedText()
        .setTopLabel('נושא')
        .setText(escapeHtml_(subject))
        .setWrapText(true)
    )
    .addWidget(
      CardService.newDecoratedText()
        .setTopLabel('מאת')
        .setText(escapeHtml_(from))
        .setWrapText(true)
    );
  builder.addSection(info);

  if (!conf.ok) {
    // Re-use the config card's message inline.
    return conf.card;
  }

  var actions = CardService.newCardSection();

  var createBtn = CardService.newTextButton()
    .setText('צור יום ב-Ocar')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setOnClickAction(
      CardService.newAction().setFunctionName('createDay')
    );
  actions.addWidget(createBtn);

  if (existing && existing.url) {
    actions.addWidget(
      CardService.newDecoratedText()
        .setText('יום קיים לשרשור זה')
        .setBottomLabel('נוצר כבר — אפשר להשיב עם הצעה')
        .setWrapText(true)
    );
    actions.addWidget(
      CardService.newTextButton()
        .setText('פתח את היום')
        .setOpenLink(CardService.newOpenLink().setUrl(existing.url))
    );
  }

  var replyBtn = CardService.newTextButton()
    .setText('השב עם הצעה (ללא מחירים)')
    .setOnClickAction(
      CardService.newAction().setFunctionName('draftReply')
    );
  actions.addWidget(replyBtn);

  builder.addSection(actions);

  // --- Optional: link this email to an EXISTING day -----------------------
  var days = fetchDays_(conf);
  if (days && days.length) {
    var linkSection = CardService.newCardSection()
      .addWidget(
        CardService.newTextParagraph().setText('או קשר לפניית יום קיים:')
      );

    var dropdown = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.DROPDOWN)
      .setTitle('בחר יום קיים')
      .setFieldName('existingDay');

    for (var i = 0; i < days.length; i++) {
      var d = days[i];
      var label = d.title || '(ללא שם)';
      if (d.when) label += ' — ' + d.when;
      dropdown.addItem(label, d.id, i === 0);
    }
    linkSection.addWidget(dropdown);

    linkSection.addWidget(
      CardService.newTextButton()
        .setText('קשר מייל ליום קיים')
        .setOnClickAction(CardService.newAction().setFunctionName('linkDay'))
    );

    builder.addSection(linkSection);
  }

  return builder.build();
}

/**
 * Fetches the lightweight list of existing days from the backend.
 * Returns an array of { id, title, client_name, when } or [] on any failure.
 */
function fetchDays_(conf) {
  if (!conf || !conf.ok) return [];
  try {
    var resp = UrlFetchApp.fetch(conf.backendUrl + '/api/addon/days', {
      method: 'get',
      headers: { 'X-Addon-Key': conf.apiKey },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) return [];
    var data = JSON.parse(resp.getContentText());
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Action: create the fun day                                         */
/* ------------------------------------------------------------------ */

function createDay(e) {
  var conf = cfg_();
  if (!conf.ok) {
    return notify_('חסרה הגדרת BACKEND_URL / ADDON_API_KEY');
  }

  var message = currentMessage_(e);
  var thread = message.getThread();

  var payload = {
    message_id: message.getId(),
    thread_id: thread.getId(),
    from: message.getFrom() || '',
    subject: message.getSubject() || '',
    date: message.getDate() ? message.getDate().toISOString() : '',
    snippet: (message.getPlainBody() || '').slice(0, 300),
    body: message.getPlainBody() || ''
  };

  var resp;
  try {
    resp = UrlFetchApp.fetch(conf.backendUrl + '/api/addon/create-day', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Addon-Key': conf.apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    return notify_('שגיאת רשת ביצירת היום: ' + err);
  }

  var code = resp.getResponseCode();
  if (code !== 201 && code !== 200) {
    return notify_('יצירת היום נכשלה (קוד ' + code + '). ' + shortBody_(resp));
  }

  var data;
  try {
    data = JSON.parse(resp.getContentText());
  } catch (err) {
    return notify_('השרת החזיר תשובה לא תקינה.');
  }
  if (!data || !data.event_id) {
    return notify_('השרת לא החזיר מזהה יום.');
  }

  rememberEvent_(thread.getId(), data.event_id, data.url);

  // Build a result card with an OpenLink to the new day.
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('היום נוצר בהצלחה'))
    .addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newTextParagraph().setText(
            'נוצר יום כיף חדש והמייל צורף אליו. כעת אפשר להשיב ללקוח עם הצעה.'
          )
        )
        .addWidget(
          CardService.newTextButton()
            .setText('פתח את היום')
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setOpenLink(CardService.newOpenLink().setUrl(data.url || conf.backendUrl))
        )
        .addWidget(
          CardService.newTextButton()
            .setText('השב עם הצעה (ללא מחירים)')
            .setOnClickAction(CardService.newAction().setFunctionName('draftReply'))
        )
    )
    .build();

  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification().setText('היום נוצר ב-Ocar')
    )
    .setOpenLink(CardService.newOpenLink().setUrl(data.url || conf.backendUrl))
    .build();
}

/* ------------------------------------------------------------------ */
/* Action: link the email to an existing day                          */
/* ------------------------------------------------------------------ */

function linkDay(e) {
  var conf = cfg_();
  if (!conf.ok) {
    return notify_('חסרה הגדרת BACKEND_URL / ADDON_API_KEY');
  }

  var message = currentMessage_(e);
  var thread = message.getThread();

  // Read the selected event id from the dropdown form input.
  var eventId = '';
  try {
    eventId = e.commonEventObject.formInputs.existingDay.stringInputs.value[0];
  } catch (err) {
    eventId = (e.formInput && e.formInput.existingDay) || '';
  }
  if (!eventId) {
    return notify_('בחר/י יום מהרשימה');
  }

  var payload = {
    event_id: eventId,
    message_id: message.getId(),
    thread_id: thread.getId(),
    from: message.getFrom() || '',
    subject: message.getSubject() || '',
    date: message.getDate() ? message.getDate().toISOString() : '',
    snippet: (message.getPlainBody() || '').slice(0, 300)
  };

  var resp;
  try {
    resp = UrlFetchApp.fetch(conf.backendUrl + '/api/addon/link-day', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Addon-Key': conf.apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    return notify_('שגיאת רשת בקישור היום: ' + err);
  }

  var code = resp.getResponseCode();
  if (code !== 201 && code !== 200) {
    return notify_('קישור היום נכשל (קוד ' + code + '). ' + shortBody_(resp));
  }

  var data;
  try {
    data = JSON.parse(resp.getContentText());
  } catch (err) {
    return notify_('השרת החזיר תשובה לא תקינה.');
  }
  if (!data || !data.event_id) {
    return notify_('השרת לא החזיר מזהה יום.');
  }

  rememberEvent_(thread.getId(), data.event_id, data.url);

  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('המייל קושר ליום'))
    .addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newTextParagraph().setText(
            'המייל קושר ליום הקיים. כעת אפשר להשיב ללקוח עם הצעה.'
          )
        )
        .addWidget(
          CardService.newTextButton()
            .setText('פתח את היום')
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setOpenLink(CardService.newOpenLink().setUrl(data.url || conf.backendUrl))
        )
        .addWidget(
          CardService.newTextButton()
            .setText('השב עם הצעה (ללא מחירים)')
            .setOnClickAction(CardService.newAction().setFunctionName('draftReply'))
        )
    )
    .build();

  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification().setText('המייל קושר ליום')
    )
    .setOpenLink(CardService.newOpenLink().setUrl(data.url || conf.backendUrl))
    .build();
}

/* ------------------------------------------------------------------ */
/* Action: draft a reply with the proposal PDF                        */
/* ------------------------------------------------------------------ */

function draftReply(e) {
  var conf = cfg_();
  if (!conf.ok) {
    return notify_('חסרה הגדרת BACKEND_URL / ADDON_API_KEY');
  }

  var message = currentMessage_(e);
  var thread = message.getThread();
  var threadId = thread.getId();

  var mapping = lookupEvent_(threadId);
  if (!mapping || !mapping.event_id) {
    return notify_('יש ליצור קודם יום ב-Ocar (כפתור "צור יום ב-Ocar"), ואז להשיב עם ההצעה.');
  }

  var url = conf.backendUrl + '/api/addon/proposal-pdf?event_id=' +
    encodeURIComponent(mapping.event_id);

  var resp;
  try {
    resp = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { 'X-Addon-Key': conf.apiKey },
      muteHttpExceptions: true
    });
  } catch (err) {
    return notify_('שגיאת רשת בקבלת ההצעה: ' + err);
  }

  if (resp.getResponseCode() !== 200) {
    return notify_('קבלת קובץ ההצעה נכשלה (קוד ' + resp.getResponseCode() + '). ' + shortBody_(resp));
  }

  var blob = resp.getBlob().setName('הצעה.pdf');

  var htmlBody =
    'שלום,<br><br>' +
    'תודה על פנייתכם. מצורפת הצעה ראשונית ליום הכיף.<br>' +
    'נשמח לתאם פרטים ולעדכן בהתאם לצרכים שלכם.<br><br>' +
    'בברכה,<br>צוות Ocar';

  try {
    // createDraftReply is a GmailThread method (not GmailMessage).
    thread.createDraftReply('', {
      htmlBody: htmlBody,
      attachments: [blob]
    });
  } catch (err) {
    return notify_('יצירת הטיוטה נכשלה: ' + err);
  }

  // Do NOT navigate to a hardcoded /u/0 drafts URL: the account index is
  // browser-specific and unknowable from the add-on, so it can land on the
  // wrong account's (empty) Drafts. The draft is already created in the
  // correct account; just notify the user.
  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification().setText('טיוטה עם ההצעה נוצרה בתיבת הטיוטות שלך')
    )
    .build();
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Returns an ActionResponse that just shows a notification. */
function notify_(text) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(text))
    .build();
}

/** A short, safe snippet of a response body for error messages. */
function shortBody_(resp) {
  try {
    var t = resp.getContentText() || '';
    return t.slice(0, 200);
  } catch (err) {
    return '';
  }
}

/** Minimal HTML escaping for values shown in DecoratedText. */
function escapeHtml_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
