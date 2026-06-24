import { create } from 'zustand';
import { api } from '../api/client.js';

// Dynamic, server-backed event statuses. Kept sorted by `order`.
const byOrder = (list) => [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

export const useStatusStore = create((set, get) => ({
  statuses: [],
  loaded: false,

  load: async () => {
    const statuses = await api.listStatuses();
    set({ statuses: byOrder(statuses), loaded: true });
  },

  add: async (label, color) => {
    const row = await api.createStatus(label, color);
    set({ statuses: byOrder([...get().statuses, row]) });
    return row;
  },

  update: async (id, patch) => {
    const row = await api.updateStatus(id, patch);
    set({ statuses: byOrder(get().statuses.map((s) => (s.id === id ? row : s))) });
    return row;
  },

  remove: async (id) => {
    await api.deleteStatus(id);
    set({ statuses: get().statuses.filter((s) => s.id !== id) });
  },
}));
