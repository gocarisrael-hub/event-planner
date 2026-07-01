import { create } from 'zustand';
import { api } from '../api/client.js';

export const useCatalogStore = create((set, get) => ({
  catalog: [],
  categories: [],
  spaces: [],
  clients: [],
  owners: [],
  loaded: false,

  load: async () => {
    const [catalog, categories, spaces, clients, owners] = await Promise.all([
      api.listCatalog(),
      api.listCategories(),
      api.listSpaces(),
      api.listClients(),
      api.listOwners(),
    ]);
    set({ catalog, categories, spaces, clients, owners, loaded: true });
  },

  refresh: async () => {
    const catalog = await api.listCatalog();
    set({ catalog });
  },

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

  // Defined category list (editable; used for selection + later filtering).
  addCategory: async (name) => {
    const row = await api.createCategory(name);
    if (!get().categories.some((c) => c.id === row.id)) {
      set({ categories: [...get().categories, row] });
    }
    return row;
  },
  removeCategory: async (id) => {
    await api.deleteCategory(id);
    set({ categories: get().categories.filter((c) => c.id !== id) });
  },

  // Defined space (מרחב) list.
  addSpace: async (name) => {
    const row = await api.createSpace(name);
    if (!get().spaces.some((s) => s.id === row.id)) {
      set({ spaces: [...get().spaces, row] });
    }
    return row;
  },
  removeSpace: async (id) => {
    await api.deleteSpace(id);
    set({ spaces: get().spaces.filter((s) => s.id !== id) });
  },

  // Defined client (לקוח) list.
  addClient: async (name) => {
    const row = await api.createClient(name);
    if (!get().clients.some((c) => c.id === row.id)) {
      set({ clients: [...get().clients, row] });
    }
    return row;
  },
  removeClient: async (id) => {
    await api.deleteClient(id);
    set({ clients: get().clients.filter((c) => c.id !== id) });
  },

  // Defined owner (אחראי) list.
  addOwner: async (name) => {
    const row = await api.createOwner(name);
    if (!get().owners.some((o) => o.id === row.id)) {
      set({ owners: [...get().owners, row] });
    }
    return row;
  },
  removeOwner: async (id) => {
    await api.deleteOwner(id);
    set({ owners: get().owners.filter((o) => o.id !== id) });
  },
}));
