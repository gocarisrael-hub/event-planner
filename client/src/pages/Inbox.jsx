import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleString('he-IL');
}

export default function Inbox() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // loading | connected | disconnected
  const [notConfigured, setNotConfigured] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [creatingId, setCreatingId] = useState(null);
  const [error, setError] = useState('');
  const [polling, setPolling] = useState(false);
  const pollRef = useRef(null);

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const loadMessages = async () => {
    setLoadingMessages(true);
    setError('');
    try {
      const list = await api.gmailMessages(25);
      setMessages(Array.isArray(list) ? list : []);
    } catch {
      setError('לא הצלחנו לטעון את ההודעות. נסה לרענן.');
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const checkStatus = async () => {
    try {
      const res = await api.gmailStatus();
      return !!(res && res.connected);
    } catch {
      // Status endpoint failed — treat as disconnected, don't crash.
      return false;
    }
  };

  // Initial status check on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const connected = await checkStatus();
      if (cancelled) return;
      if (connected) {
        setStatus('connected');
        loadMessages();
      } else {
        setStatus('disconnected');
      }
    })();
    return () => {
      cancelled = true;
      clearPoll();
    };
  }, []);

  const connect = async () => {
    setError('');
    setNotConfigured(false);
    let url;
    try {
      const res = await api.gmailAuthUrl();
      url = res && res.url;
    } catch {
      // Backend can't produce an auth URL → Gmail isn't set up yet.
      setNotConfigured(true);
      return;
    }
    if (!url) {
      setNotConfigured(true);
      return;
    }
    const popup = window.open(url, 'gmail', 'width=520,height=640');
    // Poll until the popup completes the OAuth flow.
    clearPoll();
    setPolling(true);
    pollRef.current = setInterval(async () => {
      const connected = await checkStatus();
      if (connected) {
        clearPoll();
        setPolling(false);
        setStatus('connected');
        loadMessages();
        return;
      }
      // Popup closed without authorizing → stop polling instead of looping forever.
      if (popup && popup.closed) {
        clearPoll();
        setPolling(false);
      }
    }, 3000);
  };

  const createDay = async (msg) => {
    setCreatingId(msg.id);
    setError('');
    try {
      const event = await api.gmailCreateDay(msg.id);
      if (event && event.id) {
        navigate(`/day/${event.id}`);
      } else {
        setError('היום נוצר אך לא התקבל מזהה. נסה שוב.');
        setCreatingId(null);
      }
    } catch {
      setError('לא הצלחנו ליצור יום מהמייל. נסה שוב.');
      setCreatingId(null);
    }
  };

  if (status === 'loading') {
    return <p className="text-slate-400">טוען…</p>;
  }

  if (status === 'disconnected') {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-1">מיילים</h1>
        <p className="text-slate-500 mb-6">חברו את תיבת ה-Gmail כדי לבנות ימים ישירות מהפניות שמגיעות אליכם.</p>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          {notConfigured ? (
            <div className="text-sm text-slate-600">
              <p className="font-medium mb-1">חיבור ה-Gmail עדיין לא מוגדר.</p>
              <p className="text-slate-500">
                נדרשת הגדרה חד-פעמית של Google בצד השרת. ברגע שזה יוכן, תוכלו להתחבר מכאן.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600 mb-4">
                לאחר החיבור נציג כאן את ההודעות האחרונות, ותוכלו ליצור יום מתוך כל מייל בלחיצה אחת.
              </p>
              <button
                onClick={connect}
                className="bg-ocar text-white px-5 py-2 rounded-lg font-medium hover:opacity-90"
              >
                התחבר ל-Gmail
              </button>
              {polling && (
                <p className="text-xs text-slate-400 mt-3">ממתינים לאישור החיבור בחלון שנפתח…</p>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // status === 'connected'
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">מיילים</h1>
        <button
          onClick={loadMessages}
          className="text-sm text-slate-500 hover:text-ocar"
          disabled={loadingMessages}
        >
          רענון
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {loadingMessages ? (
        <p className="text-slate-400">טוען הודעות…</p>
      ) : messages.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <p className="text-slate-500">אין הודעות</p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-medium truncate">{msg.from || 'ללא שולח'}</span>
                  <span className="text-xs text-slate-400">{formatDate(msg.date)}</span>
                </div>
                <div className="font-bold mt-0.5 truncate">{msg.subject || '(ללא נושא)'}</div>
                {msg.snippet && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{msg.snippet}</p>}
              </div>
              <button
                onClick={() => createDay(msg)}
                disabled={creatingId === msg.id}
                className="shrink-0 bg-ocar text-white px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
              >
                {creatingId === msg.id ? 'יוצר…' : 'צור יום מהמייל'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
