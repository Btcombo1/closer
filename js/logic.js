/** Pure state, merge, privacy, schedule, and calendar rules. No DOM. */

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function defaultWorkNights() {
  return { 0: true, 1: false, 2: false, 3: false, 4: false, 5: true, 6: true };
}

export function emptyState() {
  return {
    v: 1,
    days: {},
    phaseSeals: {},
    timeline: [],
    projects: [],
    budget: { limit: "", note: "", updatedAt: null, updatedBy: null },
    questions: [],
    journal: [],
    affirmations: [],
    closure: {
      said: "",
      released: "",
      keeping: "",
      brandonHeard: "",
      tabbyClosed: null,
      brandonClosed: null,
      closedAt: null,
    },
    schedule: {
      workNights: defaultWorkNights(),
      shiftLabel: "Weekend nights at GE Aerospace",
      startISO: null,
      overnightEvery: 28,
    },
    datePlans: {},
    customIdeas: [],
    photos: [],
    celebrations: [],
    presence: {},
    justUs: { lists: {}, notes: {}, checkins: [], ideas: [] },
    updatedAt: null,
  };
}

export const DEFAULT_CELEBRATIONS = [
  {
    id: "anniversary",
    title: "Our anniversary",
    month: 11,
    day: 21,
    year: 2020,
    annual: true,
    kind: "anniversary",
    note: "Married November 21, 2020.",
    system: true,
  },
  {
    id: "tabby-birthday",
    title: "Tabby's birthday",
    month: 4,
    day: 3,
    annual: true,
    kind: "birthday",
    note: "April 3.",
    system: true,
  },
  {
    id: "together",
    title: "Together since",
    month: 4,
    day: 1,
    year: 2018,
    annual: true,
    kind: "milestone",
    note: "You began in April 2018. Change the day if you remember the exact one.",
    system: true,
  },
];

export function normalizeWorkNights(value) {
  const base = defaultWorkNights();
  if (!value || typeof value !== "object") return base;
  for (let i = 0; i < 7; i++) {
    if (value[i] != null) base[i] = !!value[i];
    else if (value[String(i)] != null) base[i] = !!value[String(i)];
  }
  return base;
}

export function normalizeState(input) {
  const base = emptyState();
  const state = input && typeof input === "object" ? structuredClone(input) : {};
  const out = { ...base, ...state };
  out.days = out.days && typeof out.days === "object" ? out.days : {};
  out.phaseSeals = out.phaseSeals && typeof out.phaseSeals === "object" ? out.phaseSeals : {};
  out.timeline = Array.isArray(out.timeline) ? out.timeline : [];
  out.projects = Array.isArray(out.projects) ? out.projects : [];
  out.questions = Array.isArray(out.questions) ? out.questions : [];
  out.journal = Array.isArray(out.journal) ? out.journal : [];
  out.affirmations = Array.isArray(out.affirmations) ? out.affirmations : [];
  out.photos = Array.isArray(out.photos) ? out.photos : [];
  out.celebrations = Array.isArray(out.celebrations) ? out.celebrations : [];
  out.presence = out.presence && typeof out.presence === "object" ? out.presence : {};
  out.datePlans = out.datePlans && typeof out.datePlans === "object" ? out.datePlans : {};
  out.customIdeas = Array.isArray(out.customIdeas) ? out.customIdeas : [];
  out.budget = { ...base.budget, ...(out.budget || {}) };
  out.closure = { ...base.closure, ...(out.closure || {}) };
  out.schedule = {
    ...base.schedule,
    ...(out.schedule || {}),
    workNights: normalizeWorkNights(out.schedule?.workNights || base.schedule.workNights),
  };
  out.justUs = {
    lists: {},
    notes: {},
    checkins: [],
    ideas: [],
    ...(out.justUs || {}),
  };
  delete out.token;
  delete out.passphrase;
  delete out.journalKey;
  for (const item of DEFAULT_CELEBRATIONS) {
    if (!out.celebrations.some((c) => c.id === item.id)) out.celebrations.push(structuredClone(item));
  }
  return out;
}

export function sanitizeState(state) {
  return normalizeState(state);
}

export function now() {
  return Date.now();
}

export function todayISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysISO(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function dowISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function newer(a, b) {
  return (b?.updatedAt || 0) >= (a?.updatedAt || 0) ? b : a;
}

function mergeAnswer(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  const af = !!a.finished;
  const bf = !!b.finished;
  if (af !== bf) return af ? a : b;
  return newer(a, b);
}

function mergePause(a = {}, b = {}) {
  const at = a.pausedAt || 0;
  const bt = b.pausedAt || 0;
  const src = bt >= at ? b : a;
  return {
    paused: !!src.paused,
    pausedAt: src.pausedAt || null,
    pausedBy: src.pausedBy || null,
  };
}

function unionById(listA = [], listB = [], mergeItem) {
  const map = new Map();
  for (const item of listA) if (item?.id) map.set(item.id, item);
  for (const item of listB) {
    if (!item?.id) continue;
    const prev = map.get(item.id);
    map.set(item.id, prev ? mergeItem(prev, item) : item);
  }
  return [...map.values()];
}

function mergeDay(a = {}, b = {}) {
  const pause = mergePause(a, b);
  const out = { ...a, ...b, ...pause };
  out.tabby = mergeAnswer(a.tabby, b.tabby);
  out.brandon = mergeAnswer(a.brandon, b.brandon);
  out.ack = {
    tabby: a.ack?.tabby || b.ack?.tabby || null,
    brandon: a.ack?.brandon || b.ack?.brandon || null,
  };
  if (a.completedAt || b.completedAt) {
    const dates = [a.completedAt, b.completedAt].filter(Boolean).sort();
    out.completedAt = dates[0];
  }
  out.exercise = mergeExercise(a.exercise, b.exercise);
  out.parts = mergeParts(a.parts, b.parts);
  if ((b.planDateUpdatedAt || 0) >= (a.planDateUpdatedAt || 0)) {
    out.planDate = b.planDate ?? a.planDate ?? null;
  } else {
    out.planDate = a.planDate ?? null;
  }
  return out;
}

function mergeParts(a, b) {
  if (!a && !b) return null;
  const ids = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = {};
  for (const id of ids) {
    out[id] = {
      tabby: mergeAnswer(a?.[id]?.tabby, b?.[id]?.tabby),
      brandon: mergeAnswer(a?.[id]?.brandon, b?.[id]?.brandon),
    };
  }
  return out;
}

function mergeExercise(a, b) {
  if (!a && !b) return null;
  const out = { tabby: null, brandon: null, ratings: { tabby: null, brandon: null } };
  for (const who of ["tabby", "brandon"]) {
    out[who] = newer(a?.[who], b?.[who]);
    out.ratings[who] = newer(a?.ratings?.[who], b?.ratings?.[who]);
  }
  return out;
}

function mergeSeal(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const sealedAt = a.sealedAt || b.sealedAt || null;
  const additions = unionById(a.additions || [], b.additions || [], (x, y) => newer(x, y));
  return { sealedAt, additions };
}

export function mergeState(local, remote) {
  const a = normalizeState(local);
  const b = normalizeState(remote);
  const days = {};
  for (const id of new Set([...Object.keys(a.days), ...Object.keys(b.days)])) {
    days[id] = mergeDay(a.days[id], b.days[id]);
  }
  const phaseSeals = {};
  for (const id of new Set([...Object.keys(a.phaseSeals), ...Object.keys(b.phaseSeals)])) {
    const merged = mergeSeal(a.phaseSeals[id], b.phaseSeals[id]);
    if (merged) phaseSeals[id] = merged;
  }
  const datePlans = {};
  for (const id of new Set([...Object.keys(a.datePlans), ...Object.keys(b.datePlans)])) {
    datePlans[id] = newer(a.datePlans[id], b.datePlans[id]);
  }
  const presence = {};
  for (const id of new Set([...Object.keys(a.presence), ...Object.keys(b.presence)])) {
    presence[id] = newer(a.presence[id], b.presence[id]);
  }
  const celebrations = unionById(a.celebrations, b.celebrations, (x, y) => newer(x, y) || y);
  for (const item of DEFAULT_CELEBRATIONS) {
    if (!celebrations.some((c) => c.id === item.id)) celebrations.push(structuredClone(item));
  }
  return normalizeState({
    v: 1,
    days,
    phaseSeals,
    timeline: unionById(a.timeline, b.timeline, (x, y) => newer(x, y)),
    projects: unionById(a.projects, b.projects, (x, y) => newer(x, y)).filter((p) => !p.removed),
    budget: newer(a.budget, b.budget),
    questions: unionById(a.questions, b.questions, (x, y) => {
      const base = newer(x, y);
      base.thread = unionById(x.thread || [], y.thread || [], (m, n) => newer(m, n));
      if (x.status === "closed" || y.status === "closed") base.status = "closed";
      else if (x.status === "answered" || y.status === "answered") base.status = base.status || "answered";
      return base;
    }),
    journal: unionById(a.journal, b.journal, (x, y) => newer(x, y)).filter((j) => !j.removed),
    affirmations: unionById(a.affirmations, b.affirmations, (x, y) => newer(x, y)),
    closure: mergeClosure(a.closure, b.closure),
    schedule: newer(
      { ...a.schedule, updatedAt: a.schedule.updatedAt || 0 },
      { ...b.schedule, updatedAt: b.schedule.updatedAt || 0 }
    ),
    datePlans,
    customIdeas: unionById(a.customIdeas, b.customIdeas, (x, y) => newer(x, y)),
    photos: unionById(a.photos, b.photos, (x, y) => {
      const base = newer(x, y);
      if (x.removed || y.removed) base.removed = true;
      return base;
    }).filter((p) => !p.removed),
    celebrations,
    presence,
    justUs: {
      lists: { ...a.justUs.lists, ...b.justUs.lists },
      notes: mergeJustNotes(a.justUs.notes, b.justUs.notes),
      checkins: unionById(a.justUs.checkins, b.justUs.checkins, (x, y) => newer(x, y)),
      ideas: unionById(a.justUs.ideas, b.justUs.ideas, (x, y) => newer(x, y)),
    },
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) || null,
  });
}

function mergeJustNotes(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = newer(out[k], v) || v;
  return out;
}

function mergeClosure(a, b) {
  const text = (field) => {
    const A = { text: a[field] || "", updatedAt: a[`${field}At`] || 0 };
    const B = { text: b[field] || "", updatedAt: b[`${field}At`] || 0 };
    return (B.updatedAt >= A.updatedAt ? B.text : A.text) || A.text || B.text;
  };
  const closedAt = [a.closedAt, b.closedAt].filter(Boolean).sort()[0] || null;
  return {
    said: text("said"),
    saidAt: Math.max(a.saidAt || 0, b.saidAt || 0) || null,
    released: text("released"),
    releasedAt: Math.max(a.releasedAt || 0, b.releasedAt || 0) || null,
    keeping: text("keeping"),
    keepingAt: Math.max(a.keepingAt || 0, b.keepingAt || 0) || null,
    brandonHeard: text("brandonHeard"),
    brandonHeardAt: Math.max(a.brandonHeardAt || 0, b.brandonHeardAt || 0) || null,
    tabbyClosed: a.tabbyClosed || b.tabbyClosed || null,
    brandonClosed: a.brandonClosed || b.brandonClosed || null,
    closedAt,
  };
}

export function textDone(answer) {
  return !!(answer && answer.finished && String(answer.text || "").trim());
}

export function isDayComplete(record, def, state = {}) {
  if (!def) return false;
  const rec = record || {};
  if (rec.paused) return false;
  if (def.kind === "break") return !!(rec.ack?.tabby && rec.ack?.brandon);
  if (def.kind === "agreements") {
    const rules = def.ruleIds || [];
    const bothAccepted = ["tabby", "brandon"].every((who) =>
      rules.every((id) => rec.accepts?.[who]?.[id])
    );
    return bothAccepted && textDone(rec.tabby) && textDone(rec.brandon);
  }
  if (def.kind === "exercise") return exerciseComplete(rec);
  if (def.kind === "affirmations") {
    const ready = (state.affirmations || []).some((a) => a.ready && String(a.text || "").trim() && !a.removed);
    return ready && textDone(rec.tabby);
  }
  if (def.kind === "close") {
    return !!(state.closure?.tabbyClosed && state.closure?.brandonClosed);
  }
  if (def.parts?.length) {
    const partsOk = def.parts.every((p) => textDone(rec.parts?.[p.id]?.tabby));
    if (!partsOk || !textDone(rec.brandon)) return false;
  } else if (def.kind === "ritual") {
    const c = state.closure || {};
    if (!String(c.said || "").trim() || !String(c.released || "").trim() || !String(c.brandonHeard || "").trim()) {
      return false;
    }
  } else if (!textDone(rec.tabby) || !textDone(rec.brandon)) {
    return false;
  }
  if (def.sealsPhase && !state.phaseSeals?.[def.sealsPhase]?.sealedAt) return false;
  return true;
}

function exerciseComplete(rec) {
  const ex = rec.exercise;
  if (!ex) return false;
  for (const who of ["tabby", "brandon"]) {
    const w = ex[who];
    if (!w?.finished || !String(w.helping || "").trim() || !String(w.criticism || "").trim()) return false;
    const r = ex.ratings?.[who];
    if (!r?.helping || !r?.criticism) return false;
  }
  return true;
}

export function exerciseRevealed(rec) {
  const ex = rec?.exercise;
  if (!ex) return false;
  return ["tabby", "brandon"].every((who) => ex[who]?.finished);
}

export function currentIndex(state, days) {
  for (let i = 0; i < days.length; i++) {
    if (!isDayComplete(state.days?.[days[i].id], days[i], state)) return i;
  }
  return days.length;
}

export function answerView(answer, viewer, author) {
  if (!answer) return { state: "empty" };
  const mine = viewer === author;
  if (answer.private && !mine) return { state: "private" };
  if (!answer.finished && !mine) return { state: "hidden" };
  if (answer.private && mine && answer.text == null) return { state: "locked" };
  return { state: "visible", text: answer.text || "" };
}

export function turnState(def, record, viewer, state = {}) {
  const rec = record || {};
  if (isDayComplete(rec, def, state)) return { code: "done", label: "This day is kept" };
  if (rec.paused) return { code: "paused", label: "Paused, with no penalty" };
  if (def.kind === "break") {
    const mine = !!rec.ack?.[viewer];
    const other = viewer === "tabby" ? "brandon" : "tabby";
    if (!mine) return { code: "your-turn", label: "Your turn" };
    if (!rec.ack?.[other]) {
      const name = other === "tabby" ? "Tabby" : "Brandon";
      return { code: "waiting", label: `Waiting for ${name}` };
    }
  }
  if (def.kind === "exercise") return exerciseTurn(rec, viewer);
  if (def.kind === "agreements") return agreementTurn(def, rec, viewer);
  if (def.kind === "affirmations") {
    const ready = (state.affirmations || []).some((a) => a.ready && String(a.text || "").trim());
    if (viewer === "brandon" && !ready) return { code: "your-turn", label: "Your turn" };
    if (viewer === "tabby" && !ready) return { code: "waiting", label: "Waiting for Brandon" };
    if (viewer === "tabby" && !textDone(rec.tabby)) return { code: "your-turn", label: "Your turn" };
    if (viewer === "brandon" && !textDone(rec.tabby)) return { code: "waiting", label: "Waiting for Tabby" };
  }
  if (def.kind === "close") {
    const mine = viewer === "tabby" ? state.closure?.tabbyClosed : state.closure?.brandonClosed;
    const theirs = viewer === "tabby" ? state.closure?.brandonClosed : state.closure?.tabbyClosed;
    if (!mine) return { code: "your-turn", label: "Your turn" };
    if (!theirs) return { code: "waiting", label: `Waiting for ${viewer === "tabby" ? "Brandon" : "Tabby"}` };
  }
  const order = def.owner === "brandon" ? ["brandon", "tabby"] : ["tabby", "brandon"];
  if (def.parts?.length && order[0] === "tabby") {
    const partsDone = def.parts.every((p) => textDone(rec.parts?.[p.id]?.tabby));
    if (viewer === "tabby" && !partsDone) return { code: "your-turn", label: "Your turn" };
    if (viewer === "brandon" && !partsDone) return { code: "waiting", label: "Waiting for Tabby" };
    if (!textDone(rec.brandon)) {
      return viewer === "brandon"
        ? { code: "your-turn", label: "Your turn" }
        : { code: "waiting", label: "Waiting for Brandon" };
    }
  }
  const first = order[0];
  const second = order[1];
  const firstDone = textDone(rec[first]) || (def.kind === "ritual" && first === "tabby" && String(state.closure?.said || "").trim() && String(state.closure?.released || "").trim());
  const secondDone = textDone(rec[second]) || (def.kind === "ritual" && String(state.closure?.brandonHeard || "").trim() && textDone(rec.tabby));
  if (def.kind === "ritual") {
    const tabbyDone = String(state.closure?.said || "").trim() && String(state.closure?.released || "").trim();
    const brandonDone = String(state.closure?.brandonHeard || "").trim();
    if (viewer === "tabby" && !tabbyDone) return { code: "your-turn", label: "Your turn" };
    if (viewer === "brandon" && !tabbyDone) return { code: "waiting", label: "Waiting for Tabby" };
    if (viewer === "brandon" && !brandonDone) return { code: "your-turn", label: "Your turn" };
    if (viewer === "tabby" && !brandonDone) return { code: "waiting", label: "Waiting for Brandon" };
    return { code: "done", label: "This day is kept" };
  }
  if (!firstDone) {
    return viewer === first
      ? { code: "your-turn", label: "Your turn" }
      : { code: "waiting", label: `Waiting for ${cap(first)}` };
  }
  if (!secondDone) {
    return viewer === second
      ? { code: "your-turn", label: "Your turn" }
      : { code: "waiting", label: `Waiting for ${cap(second)}` };
  }
  if (def.sealsPhase && !state.phaseSeals?.[def.sealsPhase]?.sealedAt) {
    return viewer === "tabby"
      ? { code: "your-turn", label: "Your turn" }
      : { code: "waiting", label: "Waiting for Tabby" };
  }
  return { code: "done", label: "This day is kept" };
}

function cap(who) {
  return who === "tabby" ? "Tabby" : "Brandon";
}

function agreementTurn(def, rec, viewer) {
  const rules = def.ruleIds || [];
  const mine = rules.every((id) => rec.accepts?.[viewer]?.[id]) && textDone(rec[viewer]);
  const other = viewer === "tabby" ? "brandon" : "tabby";
  const theirs = rules.every((id) => rec.accepts?.[other]?.[id]) && textDone(rec[other]);
  if (!mine) return { code: "your-turn", label: "Your turn" };
  if (!theirs) return { code: "waiting", label: `Waiting for ${cap(other)}` };
  return { code: "done", label: "This day is kept" };
}

function exerciseTurn(rec, viewer) {
  const mine = rec.exercise?.[viewer]?.finished;
  const other = viewer === "tabby" ? "brandon" : "tabby";
  const theirs = rec.exercise?.[other]?.finished;
  if (!mine) return { code: "your-turn", label: "Your turn" };
  if (!theirs) return { code: "waiting", label: `Waiting for ${cap(other)}` };
  const rated = rec.exercise?.ratings?.[viewer]?.helping && rec.exercise?.ratings?.[viewer]?.criticism;
  const theyRated = rec.exercise?.ratings?.[other]?.helping && rec.exercise?.ratings?.[other]?.criticism;
  if (!rated) return { code: "your-turn", label: "Your turn" };
  if (!theyRated) return { code: "waiting", label: `Waiting for ${cap(other)}` };
  return { code: "done", label: "This day is kept" };
}

export function myPartDone(def, record, viewer, state = {}) {
  const turn = turnState(def, record, viewer, state);
  return turn.code === "waiting" || turn.code === "done";
}

export function shouldOfferRest(state, days, today, continueAfterId) {
  const idx = currentIndex(state, days);
  if (idx <= 0 || idx >= days.length) {
    if (idx === days.length && days.length) {
      const last = days[days.length - 1];
      const rec = state.days?.[last.id];
      if (rec?.completedAt === today && continueAfterId !== last.id) return last;
    }
    return null;
  }
  const prev = days[idx - 1];
  const rec = state.days?.[prev.id];
  if (rec?.completedAt === today && continueAfterId !== prev.id) return prev;
  return null;
}

export function flagsFor(iso, workNights) {
  const dow = dowISO(iso);
  const prev = (dow + 6) % 7;
  const next = (dow + 1) % 7;
  return {
    dow,
    working: !!workNights[dow],
    recovering: !!workNights[prev],
    nextWorking: !!workNights[next],
  };
}

function overnightOK(iso, workNights) {
  const f = flagsFor(iso, workNights);
  return !f.working && !f.nextWorking && !f.recovering;
}

export function planOvernightDates(startISO, count, workNights, every = 28) {
  const set = new Set();
  let target = Math.max(14, every - 7);
  while (target < count) {
    let placed = false;
    for (let i = target; i < Math.min(count, target + 21); i++) {
      const iso = addDaysISO(startISO, i);
      if (overnightOK(iso, workNights)) {
        set.add(iso);
        target = i + every;
        placed = true;
        break;
      }
    }
    if (!placed) break;
  }
  return set;
}

export function buildRhythm({ startISO, count = 42, workNights, ideas = [], overnightEvery = 28 }) {
  const nights = normalizeWorkNights(workNights);
  const overnights = planOvernightDates(startISO, count, nights, overnightEvery);
  const out = [];
  let lastBig = -999;
  let microToggle = 0;
  let bigToggle = 0;
  let leader = "tabby";
  const byLength = (length) => ideas.filter((idea) => idea.length === length && !idea.removed);
  for (let i = 0; i < count; i++) {
    const date = addDaysISO(startISO, i);
    const f = flagsFor(date, nights);
    const near =
      overnights.has(date) ||
      overnights.has(addDaysISO(startISO, i - 1)) ||
      overnights.has(addDaysISO(startISO, i + 1));
    let length;
    let when;
    if (overnights.has(date)) {
      length = "overnight";
      when = "off-stretch";
      lastBig = i;
    } else if (f.working) {
      length = microToggle % 2 === 0 ? "5" : "10";
      microToggle += 1;
      when = "before-shift";
    } else if (!near && i - lastBig >= 3) {
      if (f.recovering) {
        length = "night";
        when = "evening-after-sleep";
      } else if (bigToggle % 2 === 0) {
        length = "day";
        when = "daytime";
      } else {
        length = "night";
        when = "evening";
      }
      bigToggle += 1;
      lastBig = i;
    } else {
      length = microToggle % 2 === 0 ? "10" : "5";
      microToggle += 1;
      when = f.recovering ? "easy-evening" : "small";
    }
    const pool = byLength(length);
    const idea = pool.length ? pool[i % pool.length] : null;
    out.push({
      date,
      weekday: f.dow,
      length,
      when,
      ideaId: idea?.id || null,
      leader,
      source: "rhythm",
      status: "suggested",
      working: f.working,
    });
    leader = leader === "tabby" ? "brandon" : "tabby";
  }
  return out;
}

export function applyPlanOverrides(suggestions, plans = {}) {
  return suggestions.map((s) => {
    const p = plans[s.date];
    if (!p) return s;
    return {
      ...s,
      ...p,
      date: s.date,
      source: p.source || "planned",
    };
  });
}

export function nextFittingDates(workNights, fromISO, length, n = 4) {
  const nights = normalizeWorkNights(workNights);
  const out = [];
  for (let i = 0; i < 70 && out.length < n; i++) {
    const iso = addDaysISO(fromISO, i);
    const f = flagsFor(iso, nights);
    let ok = false;
    if (length === "5" || length === "10") ok = true;
    if (length === "day") ok = !f.working && !f.recovering;
    if (length === "night") ok = !f.working;
    if (length === "overnight") ok = overnightOK(iso, nights);
    if (ok) out.push({ iso, dow: f.dow, working: f.working, recovering: f.recovering });
  }
  return out;
}

export function lengthFits(length, iso, workNights) {
  const f = flagsFor(iso, normalizeWorkNights(workNights));
  if (length === "5" || length === "10") return { ok: true };
  if (length === "night" && f.working) return { ok: false, reason: "Brandon works this night. A 5 or 10 minute date before shift fits better." };
  if (length === "day" && f.working) return { ok: false, reason: "This is a work night. A short before-shift date fits better than a day away." };
  if (length === "day" && f.recovering) return { ok: false, reason: "He may be sleeping after a night shift. Later in the day, or another day, is kinder." };
  if (length === "overnight" && !overnightOK(iso, workNights)) {
    return { ok: false, reason: "An overnight needs two nights off in a row, not bumped against a shift." };
  }
  return { ok: true };
}

export function celebrationOn(item, iso) {
  if (!item || item.removed) return false;
  const [y, m, d] = iso.split("-").map(Number);
  if (item.month !== m || item.day !== d) return false;
  if (item.annual) return !item.year || y >= item.year;
  return item.year === y;
}

export function calendarItems(iso, state, days = []) {
  const items = [];
  const nights = normalizeWorkNights(state.schedule?.workNights);
  const f = flagsFor(iso, nights);
  if (f.working) items.push({ type: "shift", title: "Work night", detail: state.schedule?.shiftLabel || "Shift" });
  for (const c of state.celebrations || []) {
    if (celebrationOn(c, iso)) items.push({ type: "celebration", title: c.title, detail: c.note || "", id: c.id, kind: c.kind });
  }
  const plan = state.datePlans?.[iso];
  if (plan && !plan.removed) {
    items.push({
      type: "date",
      title: plan.title || "A date",
      detail: `${plan.length || "date"} · ${plan.leader === "brandon" ? "Brandon" : "Tabby"} leads`,
      id: iso,
      length: plan.length,
    });
  }
  if (state.presence?.[iso]) {
    items.push({
      type: "presence",
      title: "Present together",
      detail: state.presence[iso].title || "Phone-free time",
      id: iso,
    });
  }
  for (const def of days) {
    const rec = state.days?.[def.id];
    if (rec?.completedAt === iso) {
      items.push({
        type: def.kind === "break" ? "break" : "workbook",
        title: def.title,
        detail: def.kind === "break" ? "Rest day" : def.phase || "",
        id: def.id,
      });
    }
  }
  for (const [phaseId, seal] of Object.entries(state.phaseSeals || {})) {
    if (!seal?.sealedAt) continue;
    const stamp = new Date(seal.sealedAt);
    if (todayISO(stamp) === iso) {
      items.push({ type: "phase", title: "A chapter kept", detail: phaseId, id: phaseId });
    }
  }
  for (const photo of state.photos || []) {
    if (photo.removed) continue;
    if (photo.on === iso || (photo.at && todayISO(new Date(photo.at)) === iso)) {
      items.push({ type: "photo", title: photo.caption || "A photo", detail: "", id: photo.id });
    }
  }
  return items;
}

export function ensureClosureMilestone(state) {
  const c = state.closure || {};
  if (!c.tabbyClosed || !c.brandonClosed) return state;
  if ((state.celebrations || []).some((x) => x.id === "closure-completed")) return state;
  const iso = (c.closedAt || todayISO()).slice(0, 10);
  const [year, month, day] = iso.split("-").map(Number);
  state.celebrations.push({
    id: "closure-completed",
    title: "Closure completed",
    month,
    day,
    year,
    annual: false,
    kind: "milestone",
    note: "You closed this chapter together.",
    system: true,
    updatedAt: now(),
  });
  return state;
}

export function hasEmbeddedImage(state) {
  return JSON.stringify(state).includes("data:image");
}

export function newId(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}
