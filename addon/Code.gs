/**
 * star הפקות — Gmail add-on
 *
 * While reading a client's request email, the user can:
 *   1. "צור יום ב-star הפקות"  — create a fun day in the hosted app with this email attached.
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

// The mailbox to open links in (forces the right Google account under
// multi-login, instead of the browser's default /u/0).
var GMAIL_ACCOUNT = 'gocarisrael@gmail.com';

// Gmail label applied to threads that already have a fun day, so they are
// visible as such directly in the inbox list.
var DAY_LABEL = 'יום ב-star הפקות ✅';

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
      .setHeader(CardService.newCardHeader().setTitle('star הפקות — הגדרה חסרה'))
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
 * Thread→day resolution is done against the backend (fetchEventByThread_),
 * which is the single source of truth — so deleting a day in the app
 * immediately stops the add-on from claiming a day exists. (We previously
 * cached the mapping in Script Properties, but those entries went stale on
 * delete and produced false "יום קיים" banners.)
 */

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

  var builder = CardService.newCardBuilder().setHeader(
    CardService.newCardHeader()
      .setTitle('star הפקות')
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

  // If a day already exists for this thread, show a prominent banner at the
  // top (above the info section) and make sure the thread carries the label.
  var existingDay = fetchEventByThread_(conf, threadId);
  if (existingDay && existingDay.exists) {
    tagThreadAsDay_(message);

    var bannerText = '<b><font color="#188038">✓ כבר קיים יום לפנייה הזו</font></b>';
    if (existingDay.title) {
      bannerText += '<br>' + escapeHtml_(existingDay.title);
    }
    var banner = CardService.newCardSection().addWidget(
      CardService.newDecoratedText()
        .setText(bannerText)
        .setWrapText(true)
    );
    banner.addWidget(
      CardService.newTextButton()
        .setText('פתח את היום')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOpenLink(
          CardService.newOpenLink()
            .setUrl(dayUrl_(conf, existingDay.id))
            .setOpenAs(CardService.OpenAs.FULL_SIZE)
            .setOnClose(CardService.OnClose.NOTHING)
        )
    );
    // Insert the banner as the first section, before the info section.
    var bannerBuilder = CardService.newCardBuilder().setHeader(
      CardService.newCardHeader()
        .setTitle('star הפקות')
        .setSubtitle('יצירת יום כיף מתוך פניית לקוח')
    );
    bannerBuilder.addSection(banner);
    bannerBuilder.addSection(info);
    builder = bannerBuilder;
  }

  var actions = CardService.newCardSection();

  var createBtn = CardService.newTextButton()
    .setText('צור יום ב-star הפקות')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setOnClickAction(
      CardService.newAction().setFunctionName('createDay')
    );
  actions.addWidget(createBtn);

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
 * Asks the backend whether a day already exists for this Gmail thread.
 * Returns { exists, id, title } or { exists:false } on any failure.
 */
function fetchEventByThread_(conf, threadId) {
  if (!conf || !conf.ok || !threadId) return { exists: false };
  try {
    var resp = UrlFetchApp.fetch(
      conf.backendUrl + '/api/addon/event-by-thread?thread_id=' +
        encodeURIComponent(threadId),
      {
        method: 'get',
        headers: { 'X-Addon-Key': conf.apiKey },
        muteHttpExceptions: true
      }
    );
    if (resp.getResponseCode() !== 200) return { exists: false };
    var data = JSON.parse(resp.getContentText());
    return data && data.exists ? data : { exists: false };
  } catch (err) {
    return { exists: false };
  }
}

/** Builds the hosted URL for a day, forcing the right Google account. */
function dayUrl_(conf, eventId) {
  return conf.backendUrl + '/day/' + encodeURIComponent(eventId) +
    '?authuser=' + encodeURIComponent(GMAIL_ACCOUNT);
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
    body: (message.getPlainBody() || '').slice(0, 10000)
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

  tagThreadAsDay_(message);

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
            .setOpenLink(CardService.newOpenLink().setUrl(data.url || conf.backendUrl).setOpenAs(CardService.OpenAs.FULL_SIZE).setOnClose(CardService.OnClose.NOTHING))
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
      CardService.newNotification().setText('היום נוצר ב-star הפקות')
    )
    .setNavigation(CardService.newNavigation().pushCard(card))
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
    snippet: (message.getPlainBody() || '').slice(0, 300),
    body: (message.getPlainBody() || '').slice(0, 10000)
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

  tagThreadAsDay_(message);

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
            .setOpenLink(CardService.newOpenLink().setUrl(data.url || conf.backendUrl).setOpenAs(CardService.OpenAs.FULL_SIZE).setOnClose(CardService.OnClose.NOTHING))
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
    .setNavigation(CardService.newNavigation().pushCard(card))
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

  var found = fetchEventByThread_(conf, threadId);
  if (!found || !found.exists || !found.id) {
    return notify_('יש ליצור קודם יום ב-star הפקות (כפתור "צור יום ב-star הפקות"), ואז להשיב עם ההצעה.');
  }

  var url = conf.backendUrl + '/api/addon/proposal-pdf?event_id=' +
    encodeURIComponent(found.id);

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
    'בברכה,<br>צוות star הפקות';

  try {
    // createDraftReply is a GmailThread method (not GmailMessage).
    thread.createDraftReply('', {
      htmlBody: htmlBody,
      attachments: [blob]
    });
  } catch (err) {
    return notify_('יצירת הטיוטה נכשלה: ' + err);
  }

  // Open the Drafts of the CORRECT account via ?authuser=<email> (not /u/0,
  // which is browser-specific and can land on the wrong account). The new
  // draft is at the top. setOpenAs FULL_SIZE makes it open automatically.
  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification().setText('טיוטה עם ההצעה נוצרה — נפתחת')
    )
    .setOpenLink(
      CardService.newOpenLink()
        .setUrl('https://mail.google.com/mail/?authuser=' + GMAIL_ACCOUNT + '#drafts')
        .setOpenAs(CardService.OpenAs.FULL_SIZE)
        .setOnClose(CardService.OnClose.NOTHING)
    )
    .build();
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Returns (creating if needed) the Gmail label used to mark fun-day threads. */
function ensureLabel_() {
  return GmailApp.getUserLabelByName(DAY_LABEL) || GmailApp.createLabel(DAY_LABEL);
}

/**
 * Tags the given message's thread with the fun-day label. Best-effort: a
 * labeling failure (e.g. missing scope) must never break the surrounding flow.
 */
function tagThreadAsDay_(message) {
  try {
    if (!message) return;
    message.getThread().addLabel(ensureLabel_());
  } catch (err) {
    // Intentionally swallowed — labeling is a nicety, not critical path.
  }
}

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
