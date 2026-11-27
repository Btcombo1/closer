/** PBKDF2 + AES-GCM. Secrets stay on the device. The repo only holds ciphertext. */

export const ITERATIONS = 120000;

export function bytesToB64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    for (let j = 0; j < sub.length; j++) bin += String.fromCharCode(sub[j]);
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

function withoutSecrets(record, sealed, extra = {}) {
  return {
    private: true,
    finished: !!extra.finished,
    finishedAt: extra.finishedAt || null,
    updatedAt: record.updatedAt || null,
    iv: sealed.iv,
    ct: sealed.ct,
    ...extra,
  };
}

async function sealAnswer(answer, key) {
  if (!answer) return answer;
  if (answer.finished) {
    return {
      text: answer.text,
      updatedAt: answer.updatedAt,
      finished: true,
      finishedAt: answer.finishedAt || answer.updatedAt,
    };
  }
  if (!answer.text) {
    return answer.private ? { private: true, iv: answer.iv, ct: answer.ct, updatedAt: answer.updatedAt, finished: false } : answer;
  }
  return withoutSecrets(answer, await encryptString(answer.text, key), { finished: false });
}

async function sealJson(record, payload, key, extra) {
  return withoutSecrets(record, await encryptString(JSON.stringify(payload), key), extra);
}

export async function sealForWire(state, authorKey, author = "tabby") {
  const copy = structuredClone(state);
  if (!authorKey) return copy;
  for (const day of Object.values(copy.days || {})) {
    for (const who of ["tabby", "brandon"]) {
      if (who === author && day?.[who]) day[who] = await sealAnswer(day[who], authorKey);
      else if (day?.[who] && !day[who].finished && day[who].text) {
        delete day[who].text;
        day[who].private = true;
      }
    }
    if (day?.parts) {
      for (const part of Object.values(day.parts)) {
        for (const who of ["tabby", "brandon"]) {
          if (who === author && part?.[who]) part[who] = await sealAnswer(part[who], authorKey);
          else if (part?.[who] && !part[who].finished && part[who].text) {
            delete part[who].text;
            part[who].private = true;
          }
        }
      }
    }
    if (day?.exercise?.[author] && !day.exercise[author].finished && (day.exercise[author].helping || day.exercise[author].criticism)) {
      const side = day.exercise[author];
      day.exercise[author] = await sealJson(side, { helping: side.helping || "", criticism: side.criticism || "" }, authorKey, { finished: false });
    }
  }
  copy.journal = await Promise.all((copy.journal || []).map((entry) => sealJournal(entry, author, authorKey)));
  copy.questions = await Promise.all((copy.questions || []).map((q) => sealQuestion(q, author, authorKey)));
  for (const seal of Object.values(copy.phaseSeals || {})) {
    seal.additions = await Promise.all((seal.additions || []).map((add) => sealAddition(add, author, authorKey)));
  }
  if (author === "brandon") {
    copy.affirmations = await Promise.all((copy.affirmations || []).map((item) => sealAffirmation(item, authorKey)));
  } else {
    copy.affirmations = (copy.affirmations || []).map((item) => {
      if (!item.ready && item.text) {
        const { text, ...rest } = item;
        return { ...rest, private: true };
      }
      return item;
    });
  }
  return copy;
}

async function sealJournal(entry, author, key) {
  const owner = entry.by || "tabby";
  if (owner !== author) {
    if ((!entry.finished || entry.visibility === "private") && entry.text) {
      const { text, ...rest } = entry;
      return { ...rest, private: true };
    }
    if (entry.ack && !entry.ack.finished && entry.ack.text && author !== "brandon") {
      const { text, ...rest } = entry.ack;
      return { ...entry, ack: { ...rest, private: true } };
    }
    return entry;
  }
  let next = entry;
  if (!entry.finished && entry.text) {
    next = await sealJson(entry, { text: entry.text, at: entry.at, share: !!entry.share }, key, {
      finished: false,
      id: entry.id,
      by: owner,
    });
  } else if (entry.finished && entry.visibility !== "shared" && entry.text) {
    next = await sealJson(entry, { text: entry.text, at: entry.at }, key, {
      finished: true,
      finishedAt: entry.finishedAt,
      id: entry.id,
      by: owner,
      visibility: "private",
    });
  }
  if (author === "brandon" && next.ack && !next.ack.finished && next.ack.text) {
    const ack = next.ack;
    next = { ...next, ack: await sealJson(ack, { text: ack.text }, key, { finished: false, by: "brandon" }) };
  }
  return next;
}

async function sealQuestion(q, author, key) {
  const owner = q.author || q.by || "tabby";
  let next = q;
  if (owner === author && !q.finished && q.text) {
    next = await sealJson(q, { text: q.text, aboutIncident: !!q.aboutIncident, at: q.at }, key, {
      finished: false,
      id: q.id,
      author: owner,
      status: "draft",
    });
  } else if (owner !== author && !q.finished && q.text) {
    const { text, ...rest } = q;
    next = { ...rest, private: true };
  }
  next.thread = await Promise.all((q.thread || next.thread || []).map((m) => sealMessage(m, author, key)));
  return next;
}

async function sealMessage(m, author, key) {
  const owner = m.author || (m.role === "answer" ? "brandon" : "tabby");
  if (owner === author && !m.finished && m.text) {
    return sealJson(m, { text: m.text, role: m.role || "followup" }, key, {
      finished: false,
      id: m.id,
      author: owner,
      role: m.role || "followup",
    });
  }
  if (owner !== author && !m.finished && m.text) {
    const { text, ...rest } = m;
    return { ...rest, private: true };
  }
  return m;
}

async function sealAddition(add, author, key) {
  const owner = add.by || "tabby";
  if (owner === author && !add.finished && add.text) {
    return sealJson(add, { text: add.text }, key, { finished: false, id: add.id, by: owner, at: add.at });
  }
  if (owner !== author && !add.finished && add.text) {
    const { text, ...rest } = add;
    return { ...rest, private: true };
  }
  return add;
}

async function sealAffirmation(item, key) {
  if (item.ready || !item.text) return item.ready ? { ...item, private: false } : item;
  return sealJson(item, { text: item.text }, key, { finished: false, id: item.id, ready: false });
}

async function openSecret(record, key, parseJson) {
  if (!record?.private || !record.ct || record.text || record.helping) return record;
  try {
    const raw = await decryptString(record, key);
    const data = parseJson ? JSON.parse(raw) : { text: raw };
    const { iv, ct, private: _p, locked, ...rest } = record;
    return { ...rest, ...data, private: false };
  } catch {
    return { ...record, locked: true };
  }
}

export async function unsealForAuthor(state, authorKey, author = "tabby") {
  if (!authorKey) return state;
  const copy = structuredClone(state);
  for (const day of Object.values(copy.days || {})) {
    if (day?.[author]) day[author] = await openSecret(day[author], authorKey, false);
    if (day?.parts) {
      for (const part of Object.values(day.parts)) {
        if (part?.[author]) part[author] = await openSecret(part[author], authorKey, false);
      }
    }
    if (day?.exercise?.[author]?.private) day.exercise[author] = await openSecret(day.exercise[author], authorKey, true);
  }
  copy.journal = await Promise.all(
    (copy.journal || []).map(async (entry) => {
      const owner = entry.by || "tabby";
      let next = owner === author ? await openSecret(entry, authorKey, true) : entry;
      if (author === "brandon" && next.ack?.private) next = { ...next, ack: await openSecret(next.ack, authorKey, true) };
      return next;
    })
  );
  copy.questions = await Promise.all(
    (copy.questions || []).map(async (q) => {
      const owner = q.author || q.by || "tabby";
      const next = owner === author ? await openSecret(q, authorKey, true) : q;
      next.thread = await Promise.all(
        (q.thread || []).map(async (m) => {
          const ma = m.author || (m.role === "answer" ? "brandon" : "tabby");
          return ma === author ? openSecret(m, authorKey, true) : m;
        })
      );
      return next;
    })
  );
  for (const seal of Object.values(copy.phaseSeals || {})) {
    seal.additions = await Promise.all(
      (seal.additions || []).map(async (add) => ((add.by || "tabby") === author ? openSecret(add, authorKey, true) : add))
    );
  }
  if (author === "brandon") {
    copy.affirmations = await Promise.all((copy.affirmations || []).map((item) => (item.private ? openSecret(item, authorKey, true) : item)));
  }
  return copy;
}

export async function unsealForTabby(state, journalKey) {
  return unsealForAuthor(state, journalKey, "tabby");
}
