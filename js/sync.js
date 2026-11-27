/** GitHub contents API sync. Transport is injectable for tests. */

import { canonical } from "./logic.js";
import { bytesToB64, b64ToBytes, utf8ToBytes, bytesToUtf8 } from "./crypto.js";

const REPO = "Btcombo1/closer-data";

export function githubTransport(token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
  const url = (path) => `https://api.github.com/repos/${REPO}/contents/${path}`;
  return {
    async get(path) {
      const res = await fetch(url(path), { headers });
      if (res.status === 404) {
        const err = new Error("missing");
        err.status = 404;
        throw err;
      }
      if (!res.ok) {
        const err = new Error(`GitHub ${res.status}`);
        err.status = res.status;
        throw err;
      }
      const json = await res.json();
      const b64 = String(json.content || "").replace(/\n/g, "");
      return { sha: json.sha, bytes: b64ToBytes(b64) };
    },
    async put(path, { sha, bytes, message }) {
      const res = await fetch(url(path), {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message,
          content: bytesToB64(bytes),
          ...(sha ? { sha } : {}),
        }),
      });
      if (!res.ok) {
        const err = new Error(`GitHub ${res.status}`);
        err.status = res.status;
        try {
          err.detail = await res.json();
        } catch {
          /* ignore */
        }
        throw err;
      }
      const json = await res.json();
      return { sha: json.content?.sha || json.commit?.sha };
    },
    async remove(path, { sha, message }) {
      const res = await fetch(url(path), {
        method: "DELETE",
        headers,
        body: JSON.stringify({ message, sha }),
      });
      if (!res.ok && res.status !== 404) {
        const err = new Error(`GitHub ${res.status}`);
        err.status = res.status;
        throw err;
      }
    },
  };
}

async function syncPhotos(photos, transport, photoStore) {
  if (!photoStore) return;
  const shas = (await photoStore.getShas?.()) || {};
  for (const photo of photos || []) {
    if (!photo?.id || photo.removed) continue;
    const cipher = await photoStore.getCipher?.(photo.id);
    if (cipher && !shas[photo.id]) {
      const put = await transport.put(`photos/${photo.id}.bin`, {
        bytes: cipher,
        message: "Add a Closer photo",
      });
      await photoStore.setSha?.(photo.id, put.sha);
    } else if (!cipher) {
      try {
        const file = await transport.get(`photos/${photo.id}.bin`);
        await photoStore.setCipher?.(photo.id, file.bytes);
        await photoStore.setSha?.(photo.id, file.sha);
        if (photoStore.decrypt) {
          const plain = await photoStore.decrypt(file.bytes);
          if (plain) await photoStore.setPlain?.(photo.id, plain);
        }
      } catch (err) {
        if (err.status !== 404) throw err;
      }
    }
  }
}

export async function syncNow({
  localState,
  transport,
  encryptState,
  decryptState,
  photos = [],
  photoStore,
  retries = 3,
}) {
  const { mergeState } = await import("./logic.js");
  let local = localState;
  for (let attempt = 0; attempt < retries; attempt++) {
    let remoteSha = null;
    let remoteState = null;
    try {
      const file = await transport.get("state.json");
      remoteSha = file.sha;
      remoteState = await decryptState(JSON.parse(bytesToUtf8(file.bytes)));
    } catch (err) {
      if (err.status !== 404) {
        if (err.name === "OperationError" || err.code === "passphrase") {
          const wrapped = new Error("The passphrase did not open the shared journal.");
          wrapped.code = "passphrase";
          throw wrapped;
        }
        throw err;
      }
    }
    const merged = remoteState ? mergeState(local, remoteState) : local;
    local = merged;
    const changed = !remoteState || canonical(merged) !== canonical(remoteState);
    if (!changed) {
      await syncPhotos(photos.length ? photos : merged.photos, transport, photoStore);
      return { state: merged, status: "up-to-date" };
    }
    try {
      const envelope = await encryptState(merged);
      await transport.put("state.json", {
        sha: remoteSha || undefined,
        bytes: utf8ToBytes(JSON.stringify(envelope)),
        message: "Update Closer",
      });
      await syncPhotos(photos.length ? photos : merged.photos, transport, photoStore);
      return { state: merged, status: "synced" };
    } catch (err) {
      if (err.status !== 409 || attempt === retries - 1) throw err;
    }
  }
  throw new Error("Sync could not finish.");
}
