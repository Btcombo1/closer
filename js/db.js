const DB = "closer";
const VER = 1;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function request(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const out = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(out?.result);
        tx.onerror = () => reject(tx.error);
        if (out?.onsuccess) {
          /* request result read in oncomplete via out.result */
        }
      })
  );
}

function get(store, key) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      })
  );
}

function set(store, key, value) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function del(store, key) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

const SETTINGS_KEY = "closer.settings";

export function defaultSettings() {
  return {
    profile: null,
    token: "",
    passphrase: "",
    journalKey: "",
    theme: "light",
    continueAfterId: "",
    continueAfterDay: "",
    lastSyncAt: null,
    lastSyncNote: "Saved on this phone",
    salt: "",
  };
}

export function loadSettings() {
  try {
    return { ...defaultSettings(), ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings) {
  const clean = { ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(clean));
}

export function loadState() {
  return get("kv", "state");
}

export function saveState(state) {
  return set("kv", "state", state);
}

export function savePhoto(id, record) {
  return set("photos", id, record);
}

export function loadPhoto(id) {
  return get("photos", id);
}

export function deletePhoto(id) {
  return del("photos", id);
}

export async function loadPhotoShas() {
  return (await get("kv", "photoShas")) || {};
}

export async function savePhotoShas(map) {
  return set("kv", "photoShas", map);
}
