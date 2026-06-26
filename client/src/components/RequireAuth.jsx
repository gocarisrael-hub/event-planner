import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore.js';

// Guards the authed app shell:
//  - validates the stored token on first mount (loadMe)
//  - unauthed → /login
//  - authed viewer → may ONLY be at /status (read-only); anything else
//    (including /day/*) redirects to /status
//  - authed admin → full access
export default function RequireAuth() {
  const { token, role, loaded, loadMe } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (!loaded) loadMe();
  }, [loaded, loadMe]);

  if (!loaded) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center text-slate-400">
        טוען…
      </div>
    );
  }

  if (!token || !role) {
    return <Navigate to="/login" replace />;
  }

  if (role === 'viewer' && location.pathname !== '/status') {
    return <Navigate to="/status" replace />;
  }

  return <Outlet />;
}
