// Thin fetch wrapper around the /api routes.
async function req(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}`);
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

  // catalog + vendors
  listCatalog: () => req('GET', '/api/catalog'),
  createCatalog: (data) => req('POST', '/api/catalog', data),
  updateCatalog: (id, patch) => req('PATCH', `/api/catalog/${id}`, patch),
  deleteCatalog: (id) => req('DELETE', `/api/catalog/${id}`),
  listVendors: () => req('GET', '/api/vendors'),
  createVendor: (data) => req('POST', '/api/vendors', data),
  updateVendor: (id, patch) => req('PATCH', `/api/vendors/${id}`, patch),
  deleteVendor: (id) => req('DELETE', `/api/vendors/${id}`),

  // uploads
  uploadPhoto: async (file) => {
    const fd = new FormData();
    fd.append('photo', file);
    const res = await fetch('/api/uploads', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('upload failed');
    return res.json(); // { path }
  },
};
