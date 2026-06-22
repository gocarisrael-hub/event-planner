import { useEffect } from 'react';
import { create } from 'zustand';

// Tiny global flag so any page can mark itself as having unsaved edits.
// The header logo (and a beforeunload guard) read this before leaving.
export const useUnsavedStore = create((set) => ({
  dirty: false,
  setDirty: (dirty) => set({ dirty: !!dirty }),
}));

// Warns on a full browser refresh/close while there are unsaved changes.
// Subscribes to the store so the listener is added/removed as `dirty` flips.
export function useBeforeUnloadGuard() {
  const dirty = useUnsavedStore((s) => s.dirty);
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}
