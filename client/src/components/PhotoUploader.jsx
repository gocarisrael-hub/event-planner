import { useRef, useState } from 'react';
import { api } from '../api/client.js';

// Shows existing photos + an "add" tile. Calls onChange(newPhotosArray).
export default function PhotoUploader({ photos = [], onChange, small }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    try {
      const uploaded = [];
      for (const f of files) {
        const { path } = await api.uploadPhoto(f);
        uploaded.push(path);
      }
      onChange([...photos, ...uploaded]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeAt = (i) => onChange(photos.filter((_, idx) => idx !== i));
  const size = small ? 'h-14 w-14' : 'h-20 w-20';

  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p, i) => (
        <div key={p + i} className={`relative ${size} rounded-lg overflow-hidden border border-slate-200`}>
          <img src={p} alt="" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => removeAt(i)}
            className="absolute top-0 left-0 bg-black/50 text-white text-xs w-5 h-5 leading-5 text-center"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`${size} rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-ocar hover:text-ocar text-2xl`}
      >
        {busy ? '…' : '+'}
      </button>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={pick} />
    </div>
  );
}
