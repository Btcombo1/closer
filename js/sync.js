/** GitHub contents API sync. Transport is injectable for tests. */

import { canonical } from "./logic.js";
import { bytesToB64, b64ToBytes, utf8ToBytes, bytesToUtf8 } from "./crypto.js";

export const GITHUB_OWNER = "Btcombo1";
export const GITHUB_REPO = "closer-data";
export const GITHUB_BRANCH = "main";
const REPO = `${GITHUB_OWNER}/${GITHUB_REPO}`;
const API = "https://api.github.com";

export function cleanToken(raw) {
  let token = String(raw || "").trim();
  if (/^bearer\s+/i.test(token)) token = token.replace(/^bearer\s+/i, "");
  return token.replace(/\s+/g, "");
}

export function explainSyncError(err) {
  if (!err) return "Sync did not finish.";
  if (err.code === "passphrase") return err.message;
  const status = err.status || 0;
  const gh = err.detail?.message ? ` ${err.detail.message}` : "";
  if (status === 401) return "401. GitHub rejected this token. Paste it again with no spaces, or make a new fine-grained token.";
  if (status === 403) return `403. This token cannot read or write Btcombo1/closer-data. Set Contents to Read and write on that repo only.${gh}`;
  if (status === 404) return "404. GitHub cannot find Btcombo1/closer-data for this token. Choose Only select repositories and include closer-data.";
  if (status === 422) return `422. GitHub refused the file.${gh || " A new file is sent without an old version id."}`;
  if (!status || err.name === "TypeError") {
    return "The phone could not reach GitHub. Check the signal, leave Closer open, and tap Test connection. On iPhone this needs ordinary internet access.";
  }
  return `${status}.${gh || " GitHub did not accept the sync."}`;
}

export function contentsPutBody({ sha, bytes, message }) {
  return {
    message,
    content: bytesToB64(bytes),
    branch: GITHUB_BRANCH,
    ...(sha ? { sha } : {}),
  };
}

async function readError(res) {
  let detail = null;
  try {
    detail = await res.json();
  } catch {
    detail = null;
  }
  const err = new Error(detail?.message || `GitHub ${res.status}`);
  err.status = res.status;
  err.detail = detail;
  return err;
}

export function githubTransport(token) {
  const headers = {
    Authorization: `Bearer ${cleanToken(token)}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const contentsUrl = (path) => `${API}/repos/${REPO}/contents/${path}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
  return {
    async repo() {
      const res = await fetch(`${API}/repos/${REPO}`, { headers, cache: "no-store" });
      if (!res.ok) throw await readError(res);
      return res.json();
    },
    async get(path) {
      const res = await fetch(contentsUrl(path), { headers, cache: "no-store" });
      if (res.status === 404) {
        const err = await readError(res);
        err.code = "missing";
        throw err;
      }
      if (!res.ok) throw await readError(res);
      const json = await res.json();
      const b64 = String(json.content || "").replace(/\n/g, "");
      return { sha: json.sha, bytes: b64ToBytes(b64) };
    },
    async put(path, { sha, bytes, message }) {
      const res = await fetch(`${API}/repos/${REPO}/contents/${path}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(contentsPutBody({ sha, bytes, message })),
      });
      if (!res.ok) throw await readError(res);
      const json = await res.json();
      return { sha: json.content?.sha || json.commit?.sha };
    },
    async remove(path, { sha, message }) {
      const res = await fetch(`${API}/repos/${REPO}/contents/${path}`, {
        method: "DELETE",
        headers: { ...headers, "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ message, sha, branch: GITHUB_BRANCH }),
      });
      if (!res.ok && res.status !== 404) throw await readError(res);
    },
  };
}

export async function testConnection(token) {
  const clean = cleanToken(token);
  if (!clean) return { ok: false, status: 0, message: "Paste the token first." };
  if (!clean.startsWith("github_pat_") && !clean.startsWith("ghp_")) {
    return { ok: false, status: 0, message: "This does not look like a GitHub token. It should start with github_pat_." };
  }
  try {
    const transport = githubTransport(clean);
    const repo = await transport.repo();
    if (repo.default_branch && repo.default_branch !== GITHUB_BRANCH) {
      return { ok: false, status: 409, message: `This repo’s default branch is ${repo.default_branch}, not main. Closer writes to main.` };
    }
    try {
      await transport.get("README.md");
    } catch (err) {
      if (err.status === 404) {
        return { ok: false, status: 404, message: "404. The token can see the repo, but not the files on branch main. Set Contents to Read and write." };
      }
      throw err;
    }
    return { ok: true, status: 200, message: "Connected to Btcombo1/closer-data on branch main. Writing the shared file next." };
  } catch (err) {
    return { ok: false, status: err.status || 0, message: explainSyncError(err) };
  }
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
        if (err.status !== 404 && err.code !== "missing") throw err;
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
  let repoChecked = false;
  for (let attempt = 0; attempt < retries; attempt++) {
    let remoteSha = null;
    let remoteState = null;
    try {
      const file = await transport.get("state.json");
      remoteSha = file.sha;
      remoteState = await decryptState(JSON.parse(bytesToUtf8(file.bytes)));
    } catch (err) {
      if (err.status === 404 || err.code === "missing") {
        if (!repoChecked && transport.repo) {
          repoChecked = true;
          await transport.repo();
        }
      } else if (err.name === "OperationError" || err.code === "passphrase") {
        const wrapped = new Error("The passphrase did not open the shared journal.");
        wrapped.code = "passphrase";
        throw wrapped;
      } else {
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
      return { state: merged, status: remoteSha ? "synced" : "created" };
    } catch (err) {
      if (err.status !== 409 || attempt === retries - 1) throw err;
    }
  }
  throw new Error("Sync could not finish.");
}
