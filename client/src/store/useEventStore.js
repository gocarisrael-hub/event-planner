import { create } from 'zustand';
import { api } from '../api/client.js';

// Holds the day currently being edited in DayBuilder.
export const useEventStore = create((set, get) => ({
  event: null,
  items: [],
  loading: false,

  load: async (id) => {
    set({ loading: true });
    const event = await api.getEvent(id);
    set({ event, items: event.items || [], loading: false });
  },

  updateEvent: async (patch) => {
    const event = await api.updateEvent(get().event.id, patch);
    set({ event: { ...get().event, ...event } });
  },

  // Private day-file attachments (kept on event.files in the store).
  addFile: async (eventId, file) => {
    const created = await api.addDayFile(eventId, file);
    const ev = get().event;
    if (ev && ev.id === eventId) {
      set({ event: { ...ev, files: [...(ev.files || []), created] } });
    }
    return created;
  },

  removeFile: async (eventId, fileId) => {
    await api.deleteDayFile(eventId, fileId);
    const ev = get().event;
    if (ev && ev.id === eventId) {
      set({ event: { ...ev, files: (ev.files || []).filter((f) => f.id !== fileId) } });
    }
  },

  // Add an item. opts: { from_catalog_id } to pull from catalog,
  // otherwise a fresh activity that is auto-saved to the catalog.
  addItem: async (data) => {
    const item = await api.addItem(get().event.id, data);
    set({ items: [...get().items, item] });
    return item;
  },

  updateItem: async (id, patch) => {
    // optimistic
    set({ items: get().items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
    await api.updateItem(id, patch);
  },

  removeItem: async (id) => {
    set({ items: get().items.filter((i) => i.id !== id) });
    await api.deleteItem(id);
  },

  // Options (alternatives) nested inside an item.
  addOption: async (itemId, data) => {
    const option = await api.addOption(itemId, data);
    set({
      items: get().items.map((i) =>
        i.id === itemId ? { ...i, options: [...(i.options || []), option] } : i,
      ),
    });
    return option;
  },

  updateOption: async (itemId, optionId, patch) => {
    // optimistic
    set({
      items: get().items.map((i) =>
        i.id === itemId
          ? { ...i, options: (i.options || []).map((o) => (o.id === optionId ? { ...o, ...patch } : o)) }
          : i,
      ),
    });
    await api.updateOption(itemId, optionId, patch);
  },

  removeOption: async (itemId, optionId) => {
    set({
      items: get().items.map((i) =>
        i.id === itemId ? { ...i, options: (i.options || []).filter((o) => o.id !== optionId) } : i,
      ),
    });
    await api.deleteOption(itemId, optionId);
  },

  setItemsOrder: async (orderedItems) => {
    set({ items: orderedItems });
    await api.reorderItems(get().event.id, orderedItems.map((i) => i.id));
  },
}));
