import { useEffect, useState } from "react";

export function readLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("alto-storage", { detail: key }));
    return true;
  } catch {
    return false;
  }
}

export function useLocalCollection(key) {
  const [items, setItems] = useState(() => readLocal(key, []));
  useEffect(() => {
    const refresh = () => setItems(readLocal(key, []));
    refresh();
    window.addEventListener("alto-storage", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("alto-storage", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [key]);
  return [items, (value) => writeLocal(key, value)];
}

export const savedKey = (userId) => `alto:saved:${userId}`;
export const messageKey = (message) =>
  `${message.conversation_id ? "dm" : "channel"}:${message.conversation_id || message.channel_id}:${message.id}`;

export function notify(message) {
  window.dispatchEvent(new CustomEvent("alto-toast", { detail: message }));
}
