function endpoint(creds, method) {
  const base = String(creds.apiUrl || "").replace(/\/+$/, "");
  return (
    base +
    "/waInstance" +
    encodeURIComponent(creds.idInstance) +
    "/" +
    method +
    "/" +
    encodeURIComponent(creds.apiTokenInstance)
  );
}

function explain(status, data) {
  const raw =
    typeof data === "string"
      ? data
      : data && (data.message || data.error || data.reason || "");
  const text = String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/webhook/i.test(text)) {
    return "В кабинете заполнен webhookUrl, очистите его и подождите минуту";
  }
  if (status === 401) return "Неверные idInstance или токен";
  if (/idInstance/i.test(text)) return "Проверьте idInstance";
  if (/apiToken/i.test(text)) return "Проверьте apiTokenInstance";
  if (!text || /<!doctype|<html|forbidden/i.test(text)) {
    return "Сервер GREEN-API отклонил запрос (" + status + ")";
  }
  return text.length > 180 ? text.slice(0, 180) : text;
}

async function request(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error("Нет ответа от сервера. Проверьте apiUrl");
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = text;
    }
  }

  if (!res.ok) throw new Error(explain(res.status, data));
  return data;
}

export function getStateInstance(creds, signal) {
  return request(endpoint(creds, "getStateInstance"), {
    method: "GET",
    cache: "no-store",
    signal,
  });
}

export function sendMessage(creds, chatId, message) {
  return request(endpoint(creds, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId: String(chatId), message }),
  });
}

export function checkAccount(creds, contact) {
  const body = contact.username
    ? { username: contact.username }
    : { phoneNumber: contact.phoneNumber };

  return request(endpoint(creds, "checkAccount"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function receiveNotification(creds, timeout, signal) {
  return request(
    endpoint(creds, "receiveNotification") + "?receiveTimeout=" + timeout,
    { method: "GET", cache: "no-store", signal }
  );
}

export function deleteNotification(creds, receiptId, signal) {
  return request(
    endpoint(creds, "deleteNotification") + "/" + receiptId,
    { method: "DELETE", cache: "no-store", signal }
  );
}
