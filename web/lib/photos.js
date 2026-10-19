"use client";
// Meal photos stay in this browser (IndexedDB), one per meal slug. Nothing is uploaded to a server.
// Every access is wrapped: IndexedDB can be missing or blocked, and the page then shows the placeholder.
import { useEffect, useState } from "react";

const DB = "smartbite";
const STORE = "photos";
const CHANGED = "smartbite-photo";
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getPhoto(slug) {
  try {
    return (await run("readonly", (s) => s.get(slug))) || null;
  } catch {
    return null;
  }
}

// true when saved; the old photo of the meal is replaced
export async function putPhoto(slug, blob) {
  try {
    await run("readwrite", (s) => s.put(blob, slug));
    window.dispatchEvent(new CustomEvent(CHANGED, { detail: slug }));
    return true;
  } catch {
    return false;
  }
}

export async function deletePhoto(slug) {
  try {
    await run("readwrite", (s) => s.delete(slug));
    window.dispatchEvent(new CustomEvent(CHANGED, { detail: slug }));
  } catch {}
}

// Object URL of the meal's photo in this browser, or null
export function usePhoto(slug) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    let current = null;
    const load = async () => {
      const blob = await getPhoto(slug);
      if (!live) return;
      if (current) URL.revokeObjectURL(current);
      current = blob ? URL.createObjectURL(blob) : null;
      setUrl(current);
    };
    const onChange = (e) => e.detail === slug && load();
    load();
    window.addEventListener(CHANGED, onChange);
    return () => {
      live = false;
      window.removeEventListener(CHANGED, onChange);
      if (current) URL.revokeObjectURL(current);
    };
  }, [slug]);
  return url;
}
