import test from "node:test";
import assert from "node:assert/strict";
import { DAYS, PHASES, ALLOWED_QUOTES, GROUND_RULES } from "../js/program.js";
import { CHALLENGES, INTRO, challengeFor } from "../js/presence.js";
import { DATE_IDEAS } from "../js/dates.js";
import {
  mergeState,
  normalizeState,
  buildRhythm,
  defaultWorkNights,
  isDayComplete,
  answerView,
  calendarItems,
  celebrationOn,
  hasEmbeddedImage,
  sanitizeState,
  DEFAULT_CELEBRATIONS,
  todayISO,
  textToFinish,
  partnerStatus,
  stripForeignDrafts,
  describeNew,
  visibleFinishedIds,
} from "../js/logic.js";
import { encryptJson, decryptJson, sealForWire, unsealForTabby, unsealRecord, generateJournalKey, bytesToB64, b64ToBytes, utf8ToBytes, bytesToUtf8 } from "../js/crypto.js";
import { syncNow, cleanToken, explainSyncError, contentsPutBody, GITHUB_BRANCH, GITHUB_OWNER, GITHUB_REPO } from "../js/sync.js";

test("eight weeks, one date and at least one rest each week", () => {
  assert.equal(DAYS.length, 56);
  for (let week = 1; week <= 8; week++) {
    const days = DAYS.filter((d) => d.week === week);
    assert.equal(days.length, 7);
    assert.equal(days.filter((d) => d.kind === "date").length, 1);
    const breaks = days.filter((d) => d.kind === "break").length;
    assert.ok(breaks >= 1 && breaks <= 2);
  }
  for (const day of DAYS) {
    assert.ok(day.verse?.text && day.verse.ref);
    assert.ok(day.calming);
    assert.ok(day.together);
    assert.ok(day.insight?.from && day.insight.exercise);
    if (day.insight.quote) {
      assert.ok(ALLOWED_QUOTES.includes(day.insight.quote));
      assert.ok(day.insight.quoteFrom);
    }
  }
});

test("copy never asks them to pray", () => {
  const blob = JSON.stringify({ DAYS, PHASES, CHALLENGES, INTRO, DATE_IDEAS });
  assert.equal(/pray/i.test(blob), false);
});

test("incident is unnamed and centered", () => {
  const incident = DAYS.filter((d) => d.phase === "incident" && d.kind === "prompt");
  assert.ok(incident.length >= 4);
  const blob = JSON.stringify(incident).toLowerCase();
  assert.equal(blob.includes("incarcerat"), false);
  assert.match(incident[0].prompt, /will not name it/i);
});

test("required topics are covered", () => {
  const have = new Set(DAYS.flatMap((d) => d.covers || []));
  for (const id of ["bothering-now", "never-said", "stirred-recently", "trust-hurt", "not-fully-loved", "trust-received", "walls-and-all-of-her", "shown-up", "incident-what-happened", "brandon-reflect", "brandon-own", "helping", "money", "self-worth", "closure", "forward"]) {
    assert.ok(have.has(id), id);
  }
});

test("be present speaks to both of them", () => {
  const blob = `${INTRO} ${CHALLENGES.map((c) => c.detail).join(" ")}`;
  assert.equal(/tabby, put|her phone habit|you are the one on your phone/i.test(blob), false);
  assert.equal(challengeFor("2026-11-27").id, challengeFor("2026-11-27").id);
});

test("merge keeps both answers and prefers finished text", () => {
  const local = normalizeState({
    days: { w1d1: { tabby: { text: "mine", finished: true, updatedAt: 5 }, brandon: { text: "old", finished: false, updatedAt: 1 } } },
    timeline: [{ id: "a", text: "local", year: 2018, updatedAt: 2 }],
  });
  const remote = normalizeState({
    days: { w1d1: { tabby: { text: "draft", finished: false, updatedAt: 9 }, brandon: { text: "heard", finished: true, updatedAt: 4 } } },
    timeline: [{ id: "b", text: "remote", year: 2019, updatedAt: 3 }],
  });
  const merged = mergeState(local, remote);
  assert.equal(merged.days.w1d1.tabby.text, "mine");
  assert.equal(merged.days.w1d1.brandon.text, "heard");
  assert.equal(merged.timeline.length, 2);
});

test("brandon cannot see an unfinished answer", () => {
  const hidden = answerView({ text: "secret", finished: false }, "brandon", "tabby");
  assert.equal(hidden.state, "hidden");
  assert.equal(hidden.text, undefined);
  const seen = answerView({ text: "secret", finished: true }, "brandon", "tabby");
  assert.equal(seen.text, "secret");
});

test("work nights only get short dates", () => {
  const ideas = [
    { id: "a", length: "5" },
    { id: "b", length: "10" },
    { id: "c", length: "day" },
    { id: "d", length: "night" },
    { id: "e", length: "overnight" },
  ];
  const rhythm = buildRhythm({ startISO: "2026-11-30", count: 56, workNights: defaultWorkNights(), ideas, overnightEvery: 28 });
  assert.equal(rhythm.length, 56);
  const leaders = rhythm.map((r) => r.leader);
  assert.equal(leaders[0], "tabby");
  assert.notEqual(leaders[0], leaders[1]);
  for (const item of rhythm) {
    const dow = item.weekday;
    const working = !!defaultWorkNights()[dow];
    if (working) assert.ok(item.length === "5" || item.length === "10");
    if (item.length === "overnight") {
      assert.equal(working, false);
      assert.equal(!!defaultWorkNights()[(dow + 1) % 7], false);
    }
  }
  const overnights = rhythm.filter((r) => r.length === "overnight");
  assert.ok(overnights.length >= 1 && overnights.length <= 3);
  const big = rhythm.map((r, i) => (["day", "night", "overnight"].includes(r.length) ? i : -1)).filter((i) => i >= 0);
  for (let i = 1; i < big.length; i++) assert.ok(big[i] - big[i - 1] >= 2);
});

test("calendar preloads anniversary, birthday, and together-since", () => {
  const state = normalizeState({});
  const anni = state.celebrations.find((c) => c.id === "anniversary");
  assert.equal(celebrationOn(anni, "2026-11-21"), true);
  assert.equal(celebrationOn(state.celebrations.find((c) => c.id === "tabby-birthday"), "2026-04-03"), true);
  assert.equal(celebrationOn(state.celebrations.find((c) => c.id === "together"), "2026-04-01"), true);
  const items = calendarItems("2026-11-21", state, DAYS);
  assert.ok(items.some((item) => item.title === "Our anniversary"));
  assert.equal(DEFAULT_CELEBRATIONS.length, 3);
});

test("state never carries the token or a photo file", () => {
  const state = sanitizeState({ token: "github_pat_secret", passphrase: "nope", photos: [{ id: "p", caption: "hi" }] });
  assert.equal(state.token, undefined);
  assert.equal(hasEmbeddedImage({ photos: [{ id: "p", caption: "x" }] }), false);
  assert.equal(hasEmbeddedImage({ photos: [{ id: "p", caption: "data:image/png;base64,aaaa" }] }), true);
});

test("day completes only when both have answered", () => {
  const def = { id: "w1d2", kind: "prompt", owner: "tabby" };
  assert.equal(isDayComplete({ tabby: { text: "a", finished: true } }, def, {}), false);
  assert.equal(
    isDayComplete({ tabby: { text: "a", finished: true }, brandon: { text: "b", finished: true } }, def, {}),
    true
  );
  const rules = GROUND_RULES.map((r) => r.id);
  const agree = DAYS.find((d) => d.kind === "agreements");
  const rec = { accepts: { tabby: {}, brandon: {} }, tabby: { text: "ok", finished: true }, brandon: { text: "ok", finished: true } };
  for (const id of rules) {
    rec.accepts.tabby[id] = true;
    rec.accepts.brandon[id] = true;
  }
  assert.equal(isDayComplete(rec, agree, {}), true);
});

test("encryption round trip and private draft stays sealed", async () => {
  const env = await encryptJson({ hello: "tabby" }, "a long shared sentence");
  assert.equal(JSON.stringify(env).includes("tabby"), false);
  const back = await decryptJson(env, "a long shared sentence");
  assert.equal(back.hello, "tabby");
  const key = await generateJournalKey();
  const sealed = await sealForWire(
    { days: { w3d1: { tabby: { text: "the incident in her words", finished: false, updatedAt: 1 } } }, journal: [] },
    key
  );
  assert.equal(JSON.stringify(sealed).includes("incident in her words"), false);
  assert.equal(sealed.days.w3d1.tabby.private, true);
  const opened = await unsealForTabby(sealed, key);
  assert.equal(opened.days.w3d1.tabby.text, "the incident in her words");
});

test("sync merges on conflict and writes photos separately", async () => {
  const files = new Map();
  let conflict = true;
  const transport = {
    async get(path) {
      if (!files.has(path)) {
        const err = new Error("missing");
        err.status = 404;
        throw err;
      }
      return { sha: files.get(path).sha, bytes: files.get(path).bytes };
    },
    async put(path, { sha, bytes }) {
      const existing = files.get(path);
      if (existing && sha !== existing.sha) {
        const err = new Error("conflict");
        err.status = 409;
        throw err;
      }
      if (path === "state.json" && conflict) {
        conflict = false;
        files.set(path, {
          sha: "remote-sha",
          bytes: new TextEncoder().encode(JSON.stringify({ remote: true })),
        });
        const err = new Error("conflict");
        err.status = 409;
        throw err;
      }
      const next = `sha-${files.size}-${bytes.length}`;
      files.set(path, { sha: next, bytes });
      return { sha: next };
    },
  };
  const stored = { cipher: new Uint8Array([1, 2, 3, 4]), sha: null };
  const result = await syncNow({
    localState: { days: { a: { tabby: { text: "local", finished: true, updatedAt: 2 } } }, photos: [{ id: "pic" }] },
    transport,
    encryptState: async (obj) => obj,
    decryptState: async (obj) => obj,
    photos: [{ id: "pic" }],
    photoStore: {
      async getCipher() {
        return stored.cipher;
      },
      async setSha(_id, sha) {
        stored.sha = sha;
      },
      async getShas() {
        return {};
      },
    },
  });
  assert.equal(result.status, "synced");
  assert.ok(result.state.days.a);
  assert.ok(files.has("photos/pic.bin"));
  assert.ok(stored.sha);
  const second = await syncNow({
    localState: result.state,
    transport,
    encryptState: async (obj) => obj,
    decryptState: async (obj) => obj,
    photos: [],
    photoStore: { async getShas() { return { pic: stored.sha }; }, async getCipher() { return stored.cipher; } },
  });
  assert.equal(second.status, "up-to-date");
});

test("drafts stay author-only on the wire", async () => {
  const key = await generateJournalKey();
  const other = await generateJournalKey();
  const state = {
    days: {
      w3d1: {
        tabby: { text: "her private incident draft", finished: false, updatedAt: 2 },
        brandon: { text: "his private reply draft", finished: false, updatedAt: 3 },
      },
    },
    journal: [{ id: "j1", by: "tabby", text: "journal draft words", finished: false, share: false, updatedAt: 4 }],
    questions: [{ id: "q1", author: "tabby", text: "secret question words", finished: false, status: "draft", updatedAt: 5, thread: [] }],
    phaseSeals: { incident: { additions: [{ id: "a1", by: "tabby", text: "more incident words", finished: false, updatedAt: 6 }] } },
  };
  const sealed = await sealForWire(state, key, "tabby");
  const blob = JSON.stringify(sealed);
  assert.equal(blob.includes("her private incident draft"), false);
  assert.equal(blob.includes("journal draft words"), false);
  assert.equal(blob.includes("secret question words"), false);
  assert.equal(blob.includes("more incident words"), false);
  assert.equal(blob.includes("his private reply draft"), false);
  const hers = await unsealForTabby(sealed, key);
  assert.equal(hers.days.w3d1.tabby.text, "her private incident draft");
  assert.equal(hers.days.w3d1.brandon.text, undefined);
  const status = partnerStatus({
    def: { kind: "prompt", owner: "tabby", phase: "incident" },
    record: sealed.days.w3d1,
    viewer: "brandon",
    state: sealed,
  });
  assert.equal(status.label, "Tabby is writing");
  assert.equal(JSON.stringify(status).includes("incident draft"), false);
  const stripped = stripForeignDrafts(
    { days: { w3d1: { tabby: { text: "should not travel", finished: false, updatedAt: 1 } } }, journal: [], questions: [] },
    "brandon"
  );
  assert.equal(stripped.days.w3d1.tabby.text, undefined);
  const openedOther = await decryptJson(await encryptJson(sealed, "pass"), "pass");
  assert.equal(JSON.stringify(openedOther).includes("her private"), false);
  assert.ok(other);
});

test("partner notices only finished items", () => {
  const before = [];
  const state = {
    days: { w1d1: { tabby: { text: "now visible", finished: true, finishedAt: 9 } } },
    questions: [{ id: "q1", author: "tabby", text: "a real question", finished: true, finishedAt: 8, thread: [] }],
    journal: [],
  };
  const notes = describeNew(before, state, "brandon");
  assert.ok(notes.some((n) => n.includes("Your turn") || n.includes("finished")));
  assert.ok(notes.some((n) => n.includes("question")));
  const hidden = describeNew(visibleFinishedIds(state, "brandon"), state, "brandon");
  assert.equal(hidden.length, 0);
});

test("mark finished keeps the words over a sealed draft", async () => {
  assert.equal(textToFinish(undefined, "from the box"), "from the box");
  assert.equal(textToFinish("memory", null), "memory");
  const key = await generateJournalKey();
  const sealed = await sealForWire(
    { days: { w1d1: { tabby: { text: "words she wrote", finished: false, updatedAt: 4 } } }, journal: [], questions: [] },
    key,
    "tabby"
  );
  const opened = await unsealRecord(sealed.days.w1d1.tabby, key, false);
  assert.equal(opened.text, "words she wrote");
  const remote = normalizeState({
    days: { w1d1: { tabby: { private: true, ct: "cipher", iv: "iv", finished: false, updatedAt: 4 } } },
  });
  const local = normalizeState({
    days: { w1d1: { tabby: { text: "words she wrote", finished: true, finishedAt: 9, updatedAt: 9 } } },
  });
  const merged = mergeState(remote, local);
  assert.equal(merged.days.w1d1.tabby.text, "words she wrote");
  assert.equal(merged.days.w1d1.tabby.finished, true);
});

test("a newer local rule tap is not erased by an older sync", () => {
  const local = normalizeState({
    days: {
      w1d1: {
        accepts: {
          tabby: {
            finish: { on: true, updatedAt: 50 },
            pause: { on: true, updatedAt: 40 },
          },
        },
      },
    },
  });
  const remote = normalizeState({
    days: {
      w1d1: {
        accepts: {
          tabby: {
            finish: { on: false, updatedAt: 10 },
            pause: { on: false, updatedAt: 80 },
            score: { on: true, updatedAt: 30 },
          },
          brandon: { finish: { on: true, updatedAt: 20 } },
        },
        ack: { brandon: { at: 5 } },
      },
    },
  });
  const merged = mergeState(remote, local);
  const tabby = merged.days.w1d1.accepts.tabby;
  assert.equal(tabby.finish.on, true);
  assert.equal(tabby.pause.on, false);
  assert.equal(tabby.score.on, true);
  assert.equal(merged.days.w1d1.accepts.brandon.finish.on, true);
  assert.equal(merged.days.w1d1.ack.brandon.at, 5);
  const raced = mergeState(
    { days: { w1d1: { accepts: { tabby: { finish: { on: true, updatedAt: 10 } } } } } },
    { days: { w1d1: { accepts: { tabby: { finish: { on: true, updatedAt: 10 }, pause: { on: true, updatedAt: 99 } } } } } }
  );
  assert.equal(raced.days.w1d1.accepts.tabby.pause.on, true);
  assert.equal(raced.days.w1d1.accepts.tabby.finish.on, true);
  const kept = mergeState(
    { days: { w1d1: { accepts: { tabby: { finish: { on: true, updatedAt: 5000 }, pause: { on: false, updatedAt: 5000 } } } } } },
    { days: { w1d1: { accepts: { tabby: { finish: false, pause: true } } } } }
  );
  assert.equal(kept.days.w1d1.accepts.tabby.finish.on, true);
  assert.equal(kept.days.w1d1.accepts.tabby.pause.on, false);
});

test("token cleanup and GitHub errors are specific", () => {
  assert.equal(cleanToken("  Bearer github_pat_abc\n"), "github_pat_abc");
  assert.equal(GITHUB_OWNER, "Btcombo1");
  assert.equal(GITHUB_REPO, "closer-data");
  assert.equal(GITHUB_BRANCH, "main");
  assert.match(explainSyncError({ status: 401 }), /^401/);
  assert.match(explainSyncError({ status: 403, detail: { message: "Resource not accessible by personal access token" } }), /403/);
  assert.match(explainSyncError({ status: 404 }), /404/);
  assert.match(explainSyncError({ name: "TypeError", message: "Failed to fetch" }), /could not reach GitHub/i);
  const body = contentsPutBody({ bytes: utf8ToBytes("hello"), message: "Update Closer" });
  assert.equal(body.branch, "main");
  assert.equal(body.sha, undefined);
  assert.equal(bytesToUtf8(b64ToBytes(body.content)), "hello");
  assert.equal(bytesToB64(utf8ToBytes("hi")), btoa("hi"));
});

test("todayISO uses the local calendar day", () => {
  assert.match(todayISO(new Date(2026, 10, 27, 12)), /^2026-11-27$/);
});
