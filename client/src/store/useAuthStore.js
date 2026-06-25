import { create } from 'zustand';

const TOKEN_KEY = 'ep_auth_token';

// Auth state. Token persisted in localStorage; loadMe() validates on app start.
export const useAuthStore = create((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY) || null,
  email: null,
  role: null,
  loaded: false,

  login: async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = new Error('login failed');
      err.status = res.status;
      throw err;
    }
    const data = await res.json(); // { token, email, role }
    localStorage.setItem(TOKEN_KEY, data.token);
    set({ token: data.token, email: data.email, role: data.role, loaded: true });
    return data;
  },

  logout: async () => {
    const token = get().token;
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // best-effort; clear locally regardless
      }
    }
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null, email: null, role: null, loaded: true });
  },

  // Clear auth locally without a server round-trip (used on 401s).
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null, email: null, role: null, loaded: true });
  },

  // Validate the stored token on app start.
  loadMe: async () => {
    const token = get().token;
    if (!token) {
      set({ email: null, role: null, loaded: true });
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        localStorage.removeItem(TOKEN_KEY);
        set({ token: null, email: null, role: null, loaded: true });
        return;
      }
      const data = await res.json(); // { email, role }
      set({ email: data.email, role: data.role, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));
