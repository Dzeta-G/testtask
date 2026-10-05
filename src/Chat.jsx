import { useEffect, useRef, useState } from "react";
import {
  checkAccount,
  deleteNotification,
  getStateInstance,
  receiveNotification,
  sendMessage,
} from "./api";

const avatarColors = [
  "#e17076",
  "#7bc862",
  "#65aadd",
  "#ee7aae",
  "#a695e7",
  "#eea950",
  "#6ec9cb",
  "#e5ca77",
];

function loadChats(idInstance) {
  try {
    const raw = localStorage.getItem("tg-chats:" + idInstance);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPhone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "7") {
    return (
      "+7 " +
      d.slice(1, 4) +
      " " +
      d.slice(4, 7) +
      "-" +
      d.slice(7, 9) +
      "-" +
      d.slice(9)
    );
  }
  if (!d) return "";
  return "+" + d;
}

function lastTime(chat) {
  if (chat.messages.length) return chat.messages[chat.messages.length - 1].time;
  return chat.createdAt || 0;
}

function preview(chat) {
  if (!chat.messages.length) return "нет сообщений";
  const text = chat.messages[chat.messages.length - 1].text.replace(/\s+/g, " ");
  return text.length > 48 ? text.slice(0, 48) + "…" : text;
}

function avatarColor(name) {
  const text = String(name || "?");
  let sum = 0;
  for (let i = 0; i < text.length; i++) sum += text.charCodeAt(i);
  return avatarColors[sum % avatarColors.length];
}

function letter(name) {
  const text = String(name || "").replace(/[^0-9A-Za-zА-Яа-яЁё]/g, "");
  return (text[0] || "?").toUpperCase();
}

function parseContact(value) {
  const raw = value.trim();
  if (!raw) return null;

  if (raw.startsWith("@") || /[a-zA-Z_]/.test(raw)) {
    const username = "@" + raw.replace(/^@/, "").replace(/[^a-zA-Z0-9_]/g, "");
    if (username.length < 2) return null;
    return { username };
  }

  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) {
    digits = "7" + digits.slice(1);
  }
  if (digits.length < 10 || digits.length > 15) return null;
  return { phoneNumber: Number(digits), phone: digits };
}

function subtitle(chat) {
  if (chat.phone) return formatPhone(chat.phone);
  if (chat.username) {
    return String(chat.username).startsWith("@")
      ? chat.username
      : "@" + chat.username;
  }
  return "личный чат";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function Plane() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2.2 11.3 21.2 2.8c.8-.3 1.6.4 1.2 1.3L14.6 21c-.3.8-1.4.7-1.6-.1l-2.1-6.4-6.4-2.1c-.8-.2-.9-1.3-.3-1.1z"
      />
    </svg>
  );
}

export default function Chat({ creds, onLogout }) {
  const [chats, setChats] = useState(() => loadChats(creds.idInstance));
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState("");
  const [phone, setPhone] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const [sendError, setSendError] = useState("");
  const [stateText, setStateText] = useState("");
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const selected = chats.find((c) => c.chatId === selectedId) || null;
  const msgCount = selected ? selected.messages.length : 0;

  useEffect(() => {
    localStorage.setItem("tg-chats:" + creds.idInstance, JSON.stringify(chats));
  }, [chats, creds.idInstance]);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
  }, [draft]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [msgCount, selectedId]);

  useEffect(() => {
    let stop = false;
    getStateInstance(creds)
      .then((data) => {
        if (stop) return;
        const state = data && data.stateInstance;
        const map = {
          notAuthorized: "Инстанс не авторизован. Подключите Telegram в кабинете",
          starting: "Инстанс запускается, подождите пару минут",
          blocked: "Инстанс заблокирован",
          suspended: "На аккаунте временные ограничения",
          pendingPassword: "Нужен пароль двухфакторной защиты",
        };
        if (state && state !== "authorized") {
          setStateText(map[state] || "Состояние инстанса: " + state);
        }
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [creds]);

  useEffect(() => {
    const controller = new AbortController();
    let stop = false;

    const apply = (note) => {
      const body = note && note.body;
      if (!body || body.typeWebhook !== "incomingMessageReceived") return;

      const text = body.messageData && body.messageData.textMessageData
        ? body.messageData.textMessageData.textMessage
        : "";
      if (!text) return;

      const sender = body.senderData || {};
      const chatId = String(sender.chatId || "");
      if (!chatId) return;

      const id = String(body.idMessage || note.receiptId);
      const time = (body.timestamp || Math.floor(Date.now() / 1000)) * 1000;
      const name = sender.senderContactName || sender.senderName || sender.chatName || "";

      setChats((prev) => {
        if (prev.some((c) => c.messages.some((m) => m.id === id))) return prev;

        const msg = { id, text, fromMe: false, time };
        const idx = prev.findIndex((c) => c.chatId === chatId);

        if (idx === -1) {
          return [
            {
              chatId,
              title: name || chatId,
              phone: sender.senderPhoneNumber ? String(sender.senderPhoneNumber) : "",
              username: "",
              createdAt: Date.now(),
              messages: [msg],
            },
            ...prev,
          ];
        }

        const next = prev.slice();
        const chat = next[idx];
        next[idx] = {
          ...chat,
          title: chat.title === chat.chatId && name ? name : chat.title,
          phone: chat.phone || (sender.senderPhoneNumber ? String(sender.senderPhoneNumber) : ""),
          messages: chat.messages.concat(msg),
        };
        return next;
      });
    };

    const loop = async () => {
      while (!stop) {
        try {
          const note = await receiveNotification(creds, 20, controller.signal);
          if (stop) return;
          if (!note || note.receiptId == null) {
            await sleep(1000);
            continue;
          }
          apply(note);
          try {
            await deleteNotification(creds, note.receiptId, controller.signal);
          } catch (e) {
            if (stop || e.name === "AbortError") return;
          }
        } catch (e) {
          if (stop || e.name === "AbortError") return;
          await sleep(3000);
        }
      }
    };

    loop();

    return () => {
      stop = true;
      controller.abort();
    };
  }, [creds]);

  async function createChat(e) {
    e.preventDefault();
    setFormError("");

    const contact = parseContact(phone);
    if (!contact) {
      setFormError("Введите номер или @username");
      return;
    }

    setCreating(true);
    try {
      const data = await checkAccount(creds, contact);
      if (data && data.status === false) {
        const reason = String(data.reason || "");
        if (reason.includes("not authorized")) throw new Error("Инстанс не авторизован");
        if (data.data && data.data.reason === "rate_limit_exceeded") {
          throw new Error("Слишком много проверок, подождите");
        }
        throw new Error(reason || "Не удалось проверить номер");
      }
      if (!data || !data.exist || !data.chatId) {
        throw new Error("Аккаунт Telegram не найден");
      }

      const chatId = String(data.chatId);
      const username = data.username || contact.username || "";
      const phoneValue = data.phoneNumber
        ? String(data.phoneNumber)
        : contact.phone || "";
      const title = username
        ? username.startsWith("@")
          ? username
          : "@" + username
        : formatPhone(phoneValue) || chatId;

      setChats((prev) => {
        if (prev.some((c) => c.chatId === chatId)) return prev;
        return [
          {
            chatId,
            title,
            phone: phoneValue,
            username,
            createdAt: Date.now(),
            messages: [],
          },
          ...prev,
        ];
      });
      setSelectedId(chatId);
      setPhone("");
      setShowNew(false);
      setSendError("");
    } catch (err) {
      setFormError(err.message || "Не удалось создать чат");
    } finally {
      setCreating(false);
    }
  }

  async function submitMessage(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !selected || sending) return;
    if (text.length > 4096) {
      setSendError("Сообщение длиннее 4096 символов");
      return;
    }

    const chatId = selected.chatId;
    const tempId = "local-" + Date.now();
    setSendError("");
    setDraft("");
    setSending(true);
    setChats((prev) =>
      prev.map((c) =>
        c.chatId === chatId
          ? {
              ...c,
              messages: c.messages.concat({
                id: tempId,
                text,
                fromMe: true,
                time: Date.now(),
              }),
            }
          : c
      )
    );

    try {
      const res = await sendMessage(creds, chatId, text);
      const id = res && res.idMessage ? String(res.idMessage) : tempId;
      setChats((prev) =>
        prev.map((c) => {
          if (c.chatId !== chatId) return c;
          return {
            ...c,
            messages: c.messages.map((m) => (m.id === tempId ? { ...m, id } : m)),
          };
        })
      );
    } catch (err) {
      setChats((prev) =>
        prev.map((c) => {
          if (c.chatId !== chatId) return c;
          return { ...c, messages: c.messages.filter((m) => m.id !== tempId) };
        })
      );
      setDraft(text);
      setSendError(err.message || "Не отправилось");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onDraftKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitMessage(e);
    }
  }

  const sorted = chats.slice().sort((a, b) => lastTime(b) - lastTime(a));

  return (
    <div className={selected ? "app chat-open" : "app"}>
      <aside className="sidebar">
        <div className="side-head">
          <button type="button" className="text-btn" onClick={onLogout}>
            Выйти
          </button>
          <div className="side-title">Чаты</div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Новый чат"
            onClick={() => {
              setShowNew((v) => !v);
              setFormError("");
            }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                fill="currentColor"
                d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z"
              />
            </svg>
          </button>
        </div>

        {stateText && <div className="banner">{stateText}</div>}

        {showNew && (
          <form className="new-chat" onSubmit={createChat}>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="79991234567 или @username"
              autoFocus
            />
            <button className="primary small" type="submit" disabled={creating}>
              {creating ? "..." : "Создать"}
            </button>
            {formError && <div className="error">{formError}</div>}
          </form>
        )}

        <div className="list">
          {!sorted.length && (
            <div className="hint">Создайте чат по номеру или @username</div>
          )}
          {sorted.map((c) => (
            <button
              type="button"
              key={c.chatId}
              className={c.chatId === selectedId ? "chat-item active" : "chat-item"}
              onClick={() => {
                setSelectedId(c.chatId);
                setSendError("");
              }}
            >
              <span className="avatar" style={{ background: avatarColor(c.title) }}>
                {letter(c.title)}
              </span>
              <span className="item-text">
                <span className="item-top">
                  <span className="item-name">{c.title}</span>
                  {c.messages.length > 0 && (
                    <span className="item-time">
                      {formatTime(c.messages[c.messages.length - 1].time)}
                    </span>
                  )}
                </span>
                <span className="preview">{preview(c)}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="dialog">
        {selected ? (
          <>
            <header className="dialog-head">
              <button
                type="button"
                className="back"
                aria-label="К чатам"
                onClick={() => setSelectedId(null)}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z"
                  />
                </svg>
              </button>
              <span className="avatar sm" style={{ background: avatarColor(selected.title) }}>
                {letter(selected.title)}
              </span>
              <div className="who">
                <div className="name">{selected.title}</div>
                <div className="sub">{subtitle(selected)}</div>
              </div>
            </header>

            <div className="thread">
              {!selected.messages.length && (
                <div className="empty">Напишите первое сообщение</div>
              )}
              {selected.messages.map((m) => (
                <div key={m.id} className={m.fromMe ? "row out" : "row in"}>
                  <div className={String(m.id).startsWith("local-") ? "bubble wait" : "bubble"}>
                    <span className="msg-text">{m.text}</span>
                    <span className="msg-time">{formatTime(m.time)}</span>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <form className="composer" onSubmit={submitMessage}>
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                placeholder="Сообщение"
                onChange={(e) => {
                setDraft(e.target.value);
                if (sendError) setSendError("");
              }}
                onKeyDown={onDraftKey}
              />
              <button
                className="send"
                type="submit"
                aria-label="Отправить"
                disabled={sending || !draft.trim()}
              >
                <Plane />
              </button>
              {sendError && <div className="error composer-error">{sendError}</div>}
            </form>
          </>
        ) : (
          <div className="thread alone">
            <div className="empty">Выберите чат или создайте новый</div>
          </div>
        )}
      </section>
    </div>
  );
}
