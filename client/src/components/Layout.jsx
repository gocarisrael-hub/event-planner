import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { brand } from '../brand/brand.js';
import { useUnsavedStore, useBeforeUnloadGuard } from '../store/useUnsavedStore.js';

function Tab({ to, children }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `px-3 py-2 rounded-lg text-sm font-medium transition ${
          isActive ? 'bg-ocar text-white' : 'text-slate-600 hover:bg-ocar-soft'
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export default function Layout() {
  const navigate = useNavigate();
  const dirty = useUnsavedStore((s) => s.dirty);
  const setDirty = useUnsavedStore((s) => s.setDirty);

  useBeforeUnloadGuard();

  const goHome = () => {
    if (dirty) {
      const ok = window.confirm('יש שינויים שלא נשמרו. לעזוב ולחזור לדף הבית?');
      if (!ok) return;
      setDirty(false);
    }
    navigate('/');
  };

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-4">
          <button
            type="button"
            onClick={goHome}
            aria-label={brand.name}
            className="flex items-center gap-2 cursor-pointer bg-transparent border-0 p-0"
          >
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt={brand.name} className="h-9" />
            ) : (
              <span className="text-2xl font-extrabold text-ocar">{brand.name}</span>
            )}
            <span className="text-xs text-slate-400 hidden sm:inline">{brand.tagline}</span>
          </button>
          <nav className="flex items-center gap-1 mr-auto">
            <Tab to="/">הימים שלי</Tab>
            <Tab to="/status">סטטוס</Tab>
            <Tab to="/catalog">קטלוג</Tab>
            <Tab to="/categories">קטגוריות</Tab>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
