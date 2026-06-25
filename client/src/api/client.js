import { useAuthStore } from '../store/useAuthStore.js';

const TOKEN_KEY = 'ep_auth_token';

// Attach the Bearer token (if any) to a headers object.
export function authHeaders(extra = {}) {
  const token = useAuthStore.getState().token || localStorage.getItem(TOKEN_KEY);
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}

// On any 401: clear auth + redirect to /login. Skip when already on /login.
function handle401() {
  useAuthStore.getState().clear();
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

// Thin fetch wrapper around the /api routes.
async function req(method, url, body) {
  const opts = { method, headers: authHeaders() };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (res.status === 401) {
    handle401();
    const err = new Error(`${method} ${url} → 401`);
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch {
      // non-JSON error body
    }
    const err = new Error(`${method} ${url} → ${res.status}`);
    err.status = res.status;
    err.serverMessage = body && (body.message || body.error);
    err.serverCode = body && body.error; // machine code (e.g. 'gmail_not_connected')
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  // events
  listEvents: () => req('GET', '/api/events'),
  createEvent: (data) => req('POST', '/api/events', data),
  getEvent: (id) => req('GET', `/api/events/${id}`),
  updateEvent: (id, patch) => req('PATCH', `/api/events/${id}`, patch),
  deleteEvent: (id) => req('DELETE', `/api/events/${id}`),

  // items
  addItem: (eventId, data) => req('POST', `/api/events/${eventId}/items`, data),
  updateItem: (itemId, patch) => req('PATCH', `/api/events/items/${itemId}`, patch),
  deleteItem: (itemId) => req('DELETE', `/api/events/items/${itemId}`),
  reorderItems: (eventId, orderedIds) =>
    req('PUT', `/api/events/${eventId}/items/reorder`, { ordered_ids: orderedIds }),

  // options (alternatives nested in an item)
  addOption: (itemId, data) => req('POST', `/api/events/items/${itemId}/options`, data),
  updateOption: (itemId, optionId, patch) =>
    req('PATCH', `/api/events/items/${itemId}/options/${optionId}`, patch),
  deleteOption: (itemId, optionId) =>
    req('DELETE', `/api/events/items/${itemId}/options/${optionId}`),

  // catalog + categories
  listCatalog: () => req('GET', '/api/catalog'),
  createCatalog: (data) => req('POST', '/api/catalog', data),
  updateCatalog: (id, patch) => req('PATCH', `/api/catalog/${id}`, patch),
  deleteCatalog: (id) => req('DELETE', `/api/catalog/${id}`),
  listCategories: () => req('GET', '/api/categories'),
  createCategory: (name) => req('POST', '/api/categories', { name }),
  deleteCategory: (id) => req('DELETE', `/api/categories/${id}`),

  // statuses (user-editable event statuses)
  listStatuses: () => req('GET', '/api/statuses'),
  createStatus: (label, color) => req('POST', '/api/statuses', { label, color }),
  updateStatus: (id, patch) => req('PUT', `/api/statuses/${id}`, patch),
  deleteStatus: (id) => req('DELETE', `/api/statuses/${id}`),

  // gmail integration
  gmailStatus: () => req('GET', '/api/gmail/status'),
  gmailAuthUrl: () => req('GET', '/api/gmail/auth-url'),
  gmailMessages: (max = 25) => req('GET', `/api/gmail/messages?max=${max}`),
  gmailMessage: (id) => req('GET', `/api/gmail/messages/${id}`),
  gmailCreateDay: (messageId) => req('POST', '/api/gmail/create-day', { message_id: messageId }),
  gmailDraftReply: (eventId, messageId) =>
    req('POST', '/api/gmail/draft-reply', { event_id: eventId, message_id: messageId }),

  // auth + users
  listUsers: () => req('GET', '/api/users'),
  createUser: (data) => req('POST', '/api/users', data),
  deleteUser: (id) => req('DELETE', `/api/users/${id}`),

  // day files (private attachments)
  addDayFile: async (eventId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/events/${eventId}/files`, {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    });
    if (res.status === 401) handle401();
    if (!res.ok) throw new Error('upload failed');
    return res.json(); // file object
  },
  deleteDayFile: (eventId, fileId) =>
    req('DELETE', `/api/events/${eventId}/files/${fileId}`),

  // catalog-activity files (appended to proposal PDFs)
  addCatalogFile: async (catalogId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/catalog/${catalogId}/files`, {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    });
    if (res.status === 401) handle401();
    if (!res.ok) throw new Error('upload failed');
    return res.json(); // file object
  },
  deleteCatalogFile: (catalogId, fileId) =>
    req('DELETE', `/api/catalog/${catalogId}/files/${fileId}`),

  // uploads
  uploadPhoto: async (file) => {
    const fd = new FormData();
    fd.append('photo', file);
    const res = await fetch('/api/uploads', {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    });
    if (res.status === 401) handle401();
    if (!res.ok) throw new Error('upload failed');
    return res.json(); // { path }
  },
};
