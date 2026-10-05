import { useEffect, useState } from "react";
import { getStateInstance } from "./api";
import Chat from "./Chat";

const CREDS_KEY = "tg-creds";

function guessUrl(idInstance) {
  const digits = String(idInstance).replace(/\D/g, "");
  if (digits.length >= 4) {
    return "https://" + digits.slice(0, 4) + ".api.green-api.com";
  }
  return "https://api.green-api.com";
}

function readCreds() {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.idInstance || !data.apiTokenInstance || !data.apiUrl) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function Plane() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2.2 11.3 21.2 2.8c.8-.3 1.6.4 1.2 1.3L14.6 21c-.3.8-1.4.7-1.6-.1l-2.1-6.4-6.4-2.1c-.8-.2-.9-1.3-.3-1.1z"
      />
    </svg>
  );
}

export default function App() {
  const [creds, setCreds] = useState(null);
  const [booting, setBooting] = useState(true);
  const [idInstance, setIdInstance] = useState("");
  const [apiTokenInstance, setApiTokenInstance] = useState("");
  const [apiUrl, setApiUrl] = useState("https://api.green-api.com");
  const [urlTouched, setUrlTouched] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = readCreds();
    if (saved) setCreds(saved);
    setBooting(false);
  }, []);

  function onId(value) {
    setIdInstance(value);
    if (!urlTouched) setApiUrl(guessUrl(value));
  }

  async function onLogin(e) {
    e.preventDefault();
    setError("");

    const id = idInstance.trim();
    const token = apiTokenInstance.trim();
    let url = apiUrl.trim().replace(/\/+$/, "");

    if (!id) {
      setError("Введите idInstance");
      return;
    }
    if (!/^\d+$/.test(id)) {
      setError("idInstance должен быть числом");
      return;
    }
    if (!token) {
      setError("Введите apiTokenInstance");
      return;
    }
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;

    const next = { idInstance: id, apiTokenInstance: token, apiUrl: url };
    setLoading(true);
    try {
      await getStateInstance(next);
      localStorage.setItem(CREDS_KEY, JSON.stringify(next));
      setCreds(next);
    } catch (err) {
      setError(err.message || "Не удалось войти");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(CREDS_KEY);
    setCreds(null);
  }

  if (booting) return null;
  if (creds) return <Chat creds={creds} onLogout={logout} />;

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onLogin}>
        <div className="logo">
          <Plane />
        </div>
        <h1>Telegram</h1>
        <p className="lead">Данные инстанса из кабинета GREEN-API</p>

        <label>
          idInstance
          <input
            value={idInstance}
            onChange={(e) => onId(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="4100000000"
          />
        </label>
        <label>
          apiTokenInstance
          <input
            value={apiTokenInstance}
            onChange={(e) => setApiTokenInstance(e.target.value)}
            autoComplete="off"
            placeholder="токен из кабинета"
          />
        </label>
        <label>
          apiUrl
          <input
            value={apiUrl}
            onChange={(e) => {
              setUrlTouched(true);
              setApiUrl(e.target.value);
            }}
            autoComplete="off"
            placeholder="https://4100.api.green-api.com"
          />
        </label>

        {error && <div className="error">{error}</div>}

        <button className="primary" type="submit" disabled={loading}>
          {loading ? "Проверяю..." : "Войти"}
        </button>
      </form>
    </div>
  );
}
