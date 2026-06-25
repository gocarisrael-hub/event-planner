import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { brand } from '../brand/brand.js';
import { useAuthStore } from '../store/useAuthStore.js';

const field =
  'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ocar';

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { role } = await login(email.trim(), password);
      navigate(role === 'viewer' ? '/status' : '/', { replace: true });
    } catch {
      setError('אימייל או סיסמה שגויים');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <div className="flex flex-col items-center gap-2 mb-6">
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt={brand.name} className="h-12" />
          ) : (
            <span className="text-2xl font-extrabold text-ocar">{brand.name}</span>
          )}
          <h1 className="text-lg font-bold text-slate-700">התחברות</h1>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">אימייל</label>
            <input
              type="email"
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">סיסמה</label>
            <input
              type="password"
              className={field}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-ocar text-white py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'מתחבר…' : 'התחבר'}
          </button>
        </form>
      </div>
    </div>
  );
}
