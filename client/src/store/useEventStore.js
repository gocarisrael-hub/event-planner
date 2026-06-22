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

  setItemsOrder: async (orderedItems) => {
    set({ items: orderedItems });
    await api.reorderItems(get().event.id, orderedItems.map((i) => i.id));
  },
}));
