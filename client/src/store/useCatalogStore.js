import { create } from 'zustand';
import { api } from '../api/client.js';

export const useCatalogStore = create((set, get) => ({
  catalog: [],
  vendors: [],
  loaded: false,

  load: async () => {
    const [catalog, vendors] = await Promise.all([api.listCatalog(), api.listVendors()]);
    set({ catalog, vendors, loaded: true });
  },

  refresh: async () => {
    const catalog = await api.listCatalog();
    set({ catalog });
  },

  vendorName: (id) => get().vendors.find((v) => v.id === id)?.name || '',

  addCatalog: async (data) => {
    const row = await api.createCatalog(data);
    set({ catalog: [...get().catalog, row] });
    return row;
  },
  updateCatalog: async (id, patch) => {
    const row = await api.updateCatalog(id, patch);
    set({ catalog: get().catalog.map((c) => (c.id === id ? row : c)) });
  },
  removeCatalog: async (id) => {
    await api.deleteCatalog(id);
    set({ catalog: get().catalog.filter((c) => c.id !== id) });
  },

  addVendor: async (data) => {
    const row = await api.createVendor(data);
    set({ vendors: [...get().vendors, row] });
    return row;
  },
  updateVendor: async (id, patch) => {
    const row = await api.updateVendor(id, patch);
    set({ vendors: get().vendors.map((v) => (v.id === id ? row : v)) });
  },
  removeVendor: async (id) => {
    await api.deleteVendor(id);
    set({ vendors: get().vendors.filter((v) => v.id !== id) });
  },
}));
