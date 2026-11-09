"use client";
// Meal photos stay in this browser (IndexedDB), one per meal slug. Nothing is uploaded to a server.
// Every access is wrapped: IndexedDB can be missing or blocked, and the page then shows the placeholder.
import { useEffect, useState } from "react";
import { generatePhoto } from "./llm.js";

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
    if (jobs.get(slug)?.status === "failed") setJob(slug, null); // a photo dropped by hand ends a failed auto photo
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

// Object URL of the meal's photo in this browser, or null. With info: { url, ai } where ai marks a photo SmartBite
// made with the user's Gemini key (labelled "AI-generated photo" like the demo photos).
export function usePhoto(slug, info = false) {
  const [url, setUrl] = useState(null);
  const [ai, setAi] = useState(false);
  useEffect(() => {
    let live = true;
    let current = null;
    const load = async () => {
      const blob = await getPhoto(slug);
      if (!live) return;
      if (current) URL.revokeObjectURL(current);
      current = blob ? URL.createObjectURL(blob) : null;
      setUrl(current);
      setAi(blob?.name === AI_PHOTO_NAME);
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
  return info ? { url, ai } : url;
}

// Auto photo (decided 2026-11-09): with a Gemini key the photo is made as soon as a meal is saved. The job lives in
// this page (a reload forgets it); the recipe page shows "making", then the photo, or on failure the reason and the
// manual prompt card.
const AI_PHOTO_NAME = "smartbite-gemini-photo";
const JOB = "smartbite-photo-job";
const jobs = new Map(); // slug -> { status: "making" | "failed", error }
const setJob = (slug, job) => {
  if (job) jobs.set(slug, job); else jobs.delete(slug);
  window.dispatchEvent(new CustomEvent(JOB, { detail: slug }));
};

export async function makePhoto(slug, prompt, llm) {
  if (jobs.get(slug)?.status === "making") return;
  setJob(slug, { status: "making" });
  try {
    const blob = await generatePhoto({ prompt, llm });
    const file = new File([blob], AI_PHOTO_NAME, { type: blob.type });
    setJob(slug, (await putPhoto(slug, file)) ? null : { status: "failed", error: "The photo was made, but this browser blocks storage." });
  } catch (e) {
    setJob(slug, { status: "failed", error: e.message });
  }
}

// The meal's photo job: null, { status: "making" } or { status: "failed", error }
export function usePhotoJob(slug) {
  const [job, setState] = useState(null);
  useEffect(() => {
    const read = () => setState(jobs.get(slug) || null);
    const onJob = (e) => e.detail === slug && read();
    read();
    window.addEventListener(JOB, onJob);
    return () => window.removeEventListener(JOB, onJob);
  }, [slug]);
  return job;
}
