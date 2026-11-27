/** PBKDF2 + AES-GCM. Secrets stay on the device. The repo only holds ciphertext. */

export const ITERATIONS = 120000;

export function bytesToB64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function utf8ToBytes(str) {
  return new TextEncoder().encode(str);
}

export function bytesToUtf8(bytes) {
  return new TextDecoder().decode(bytes);
}

export async function deriveKey(passphrase, saltBytes, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey("raw", utf8ToBytes(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptJson(value, passphrase, existingSaltB64 = null) {
  const salt = existingSaltB64 ? b64ToBytes(existingSaltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, utf8ToBytes(JSON.stringify(value)));
  return {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iter: ITERATIONS,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ct: bytesToB64(new Uint8Array(ct)),
  };
}

export async function decryptJson(envelope, passphrase) {
  const salt = b64ToBytes(envelope.salt);
  const key = await deriveKey(passphrase, salt, envelope.iter || ITERATIONS);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(envelope.iv) },
    key,
    b64ToBytes(envelope.ct)
  );
  return JSON.parse(bytesToUtf8(new Uint8Array(plain)));
}

export async function importRawKey(b64) {
  return crypto.subtle.importKey("raw", b64ToBytes(b64), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function generateJournalKey() {
  return bytesToB64(crypto.getRandomValues(new Uint8Array(32)));
}

export async function encryptString(text, keyB64) {
  const key = await importRawKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, utf8ToBytes(text));
  return { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
}

export async function decryptString(payload, keyB64) {
  const key = await importRawKey(keyB64);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(payload.iv) }, key, b64ToBytes(payload.ct));
  return bytesToUtf8(new Uint8Array(plain));
}

export async function encryptBytes(bytes, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out;
}

export async function decryptBytes(bytes, key) {
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new Uint8Array(plain);
}

function sealAnswer(answer, sealed) {
  if (!answer) return answer;
  if (answer.finished) {
    const { text, updatedAt, finished, finishedAt } = answer;
    return { text, updatedAt, finished: true, finishedAt: finishedAt || updatedAt };
  }
  if (!answer.text) return answer.private ? { private: true, iv: answer.iv, ct: answer.ct, updatedAt: answer.updatedAt, finished: false } : answer;
  return { private: true, finished: false, updatedAt: answer.updatedAt, ...sealed };
}

export async function sealForWire(state, journalKey) {
  const copy = structuredClone(state);
  if (!journalKey) return copy;
  for (const day of Object.values(copy.days || {})) {
    if (day?.tabby && !day.tabby.finished && day.tabby.text) {
      day.tabby = sealAnswer(day.tabby, await encryptString(day.tabby.text, journalKey));
    }
    if (day?.parts) {
      for (const part of Object.values(day.parts)) {
        if (part?.tabby && !part.tabby.finished && part.tabby.text) {
          part.tabby = sealAnswer(part.tabby, await encryptString(part.tabby.text, journalKey));
        }
      }
    }
  }
  const journal = [];
  for (const entry of copy.journal || []) {
    if (entry.visibility === "private" && entry.text) {
      const sealed = await encryptString(JSON.stringify({ text: entry.text, at: entry.at }), journalKey);
      journal.push({ id: entry.id, visibility: "private", updatedAt: entry.updatedAt, at: entry.at, ...sealed });
    } else if (entry.visibility === "private" && entry.ct) {
      journal.push({ id: entry.id, visibility: "private", updatedAt: entry.updatedAt, at: entry.at, iv: entry.iv, ct: entry.ct });
    } else {
      journal.push(entry);
    }
  }
  copy.journal = journal;
  return copy;
}

export async function unsealForTabby(state, journalKey) {
  if (!journalKey) return state;
  const copy = structuredClone(state);
  const openAnswer = async (answer) => {
    if (!answer?.private || !answer.ct || answer.text) return answer;
    try {
      const text = await decryptString(answer, journalKey);
      return { text, updatedAt: answer.updatedAt, finished: false };
    } catch {
      return { ...answer, locked: true };
    }
  };
  for (const day of Object.values(copy.days || {})) {
    if (day?.tabby) day.tabby = await openAnswer(day.tabby);
    if (day?.parts) {
      for (const part of Object.values(day.parts)) {
        if (part?.tabby) part.tabby = await openAnswer(part.tabby);
      }
    }
  }
  const journal = [];
  for (const entry of copy.journal || []) {
    if (entry.visibility === "private" && entry.ct && !entry.text) {
      try {
        const parsed = JSON.parse(await decryptString(entry, journalKey));
        journal.push({ ...entry, text: parsed.text, at: parsed.at || entry.at, iv: undefined, ct: undefined });
      } catch {
        journal.push({ ...entry, locked: true });
      }
    } else journal.push(entry);
  }
  copy.journal = journal;
  return copy;
}
