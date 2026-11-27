import { DAYS, PHASES, WEEKS, GROUND_RULES, CALMING, reassureFor, phaseOf, weekOf } from "./program.js";
import * as logic from "./logic.js";
import * as db from "./db.js";
import * as crypto from "./crypto.js";
import * as sync from "./sync.js";
import { allIdeas, ideaById, LENGTHS, SETTINGS, WHEN_LABEL, LEADER_NOTE } from "./dates.js";
import { allIdeas as justIdeas, INTRO as JUST_INTRO, PROMPTS as JUST_PROMPTS, LIST as JUST_LIST } from "./justus.js";
import { INTRO as BE_INTRO, challengeFor, reconnectFor } from "./presence.js";

const app = {
  settings: db.loadSettings(),
  state: logic.normalizeState(null),
  route: "today",
  param: "",
  sheet: null,
  calming: false,
  justOpen: false,
  photoUrls: {},
  saveTimer: null,
};

const $ = (html) => html;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nl = (s) => esc(s).replace(/\n/g, "<br>");

function go(hash) {
  location.hash = hash;
}

function routeFromHash() {
  const raw = location.hash || "#/today";
  if (!raw.startsWith("#/")) return;
  const [name, param] = raw.slice(2).split("/");
  app.route = name || "today";
  app.param = decodeURIComponent(param || "");
}

function consumePair() {
  const raw = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  if (!raw || raw.startsWith("/")) return false;
  const params = new URLSearchParams(raw);
  const token = params.get("t");
  const pass = params.get("p");
  if (!token || !pass) return false;
  app.settings.token = token;
  app.settings.passphrase = pass;
  app.settings.profile = params.get("who") || "tabby";
  app.settings.setupDone = true;
  if (app.settings.profile === "tabby" && !app.settings.journalKey) {
    crypto.generateJournalKey().then((key) => {
      app.settings.journalKey = key;
      db.saveSettings(app.settings);
    });
  }
  db.saveSettings(app.settings);
  history.replaceState(null, "", location.pathname + location.search + "#/today");
  return true;
}

function dayRec(id) {
  if (!app.state.days[id]) app.state.days[id] = {};
  return app.state.days[id];
}

function scheduleSave() {
  clearTimeout(app.saveTimer);
  app.saveTimer = setTimeout(async () => {
    app.state.updatedAt = Date.now();
    await db.saveState(app.state);
    const note = document.querySelector("[data-sync-note]");
    if (note && !app.syncing) note.textContent = navigator.onLine ? "Saved on this phone" : "Offline · saved on this phone";
  }, 400);
  clearTimeout(app.syncTimer);
  app.syncTimer = setTimeout(() => {
    if (app.settings.token && app.settings.passphrase) doSync({ quiet: true });
  }, 3500);
}

function profile() {
  return app.settings.profile;
}

function otherName() {
  return profile() === "tabby" ? "Brandon" : "Tabby";
}

async function render() {
  routeFromHash();
  const root = document.getElementById("app");
  const onboard = !profile();
  const setup = !onboard && !app.settings.setupDone && !app.settings.skipSync;
  const rest = !onboard && !setup && app.route === "today" && restDay();
  root.className = "app" + (onboard || setup || rest || app.route === "rest" ? " solo" : "");
  root.innerHTML = onboard ? viewOnboard() : setup ? viewSetup() : shell(await body());
  document.getElementById("splash")?.classList.add("hide");
  if (app.focusSyncKey) {
    const field = document.getElementById("sync-key") || document.getElementById("setup-token");
    if (field) {
      app.focusSyncKey = false;
      field.scrollIntoView({ block: "center" });
      field.focus();
    }
  }
}

function openSyncKey() {
  app.focusSyncKey = true;
  const inSetup = profile() && !app.settings.setupDone && !app.settings.skipSync;
  if (inSetup || (location.hash || "") === "#/settings") render();
  else go("#/settings");
}

function shell(inner) {
  if (app.route === "today" && restDay()) return inner;
  return `${topbar()}${inner}${nav()}${app.sheet || ""}${app.calming ? calmingOverlay() : ""}`;
}

function syncLabel() {
  if (app.syncing) return "Syncing…";
  if (!navigator.onLine) return "Offline · saved on this phone";
  if (!app.settings.token || !app.settings.passphrase) return "On this phone only";
  return app.settings.lastSyncNote || "Not synced yet";
}

function syncIsError(note = app.settings.lastSyncNote || "") {
  return /^(401|403|404|422|Could not|The phone|This does not|Paste the|GitHub)/.test(note);
}

function syncStatusBlock() {
  const note = syncLabel();
  return `<div class="sync-result"><p class="${syncIsError(note) ? "sync-error" : "quiet"}" data-sync-note>${esc(note)}</p><button class="text-btn" type="button" data-action="open-sync-key">Change key</button></div>`;
}

function topbar() {
  return `<header class="top"><div class="brand">Closer</div><button class="sync-note" type="button" data-action="sync" data-sync-note>${esc(syncLabel())}</button></header>${turnBanner()}`;
}

function turnBanner() {
  if (app.banner) return `<div class="banner"><strong>Your turn</strong><p>${esc(app.banner)}</p></div>`;
  if (yourTurnNow()) {
    const def = DAYS[logic.currentIndex(app.state, DAYS)];
    return `<div class="banner"><strong>Your turn</strong><p>${esc(def?.title || "This step is yours.")}</p></div>`;
  }
  return "";
}

function partnerCard(def, rec) {
  const status = logic.partnerStatus({ def, record: rec || {}, viewer: profile(), state: app.state });
  const when = app.settings.lastSyncAt
    ? new Date(app.settings.lastSyncAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "not yet";
  return `<article class="card status-card"><p class="kicker">Partner</p><h2>${esc(status.label)}</h2><p>${esc(status.detail)}</p><p class="quiet small">Last synced ${esc(when)}</p>${syncStatusBlock()}<button class="ghost" type="button" data-action="sync">Sync now</button><button class="primary full" type="button" data-action="open-sync-key">Change key</button></article>`;
}

function viewSetup() {
  const who = profile();
  if (who === "brandon") {
    return `<div class="view"><p class="kicker">One-time setup</p><h1>Connect the two phones.</h1>
      <p class="lede">You do not need to be in the same room. This phone keeps the token and the passphrase. Tabby opens one link, once.</p>
      <div class="card" id="sync-key-card"><p class="kicker">1 · Sync key</p><p class="quiet">On GitHub, make a fine-grained token for the closer-data repo only, with Contents set to read and write. Paste it here. You can paste a new one later in Settings.</p>
        <label>Sync key<input id="setup-token" data-save="setup-token" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="github_pat_…" value="${esc(app.settings.token || "")}"></label></div>
      <div class="card"><p class="kicker">2 · Passphrase</p><p class="quiet">A sentence only the two of you know. It is not the GitHub token. It scrambles everything before it leaves the phone.</p>
        <input id="setup-pass" data-save="setup-pass" type="password" autocomplete="off" value="${esc(app.settings.passphrase || "")}"></div>
      <button class="primary full" type="button" data-action="test-connection">Test connection</button>
      <button class="soft full" type="button" data-action="save-setup">Save and make Tabby’s link</button>
      ${syncStatusBlock()}
      ${app.settings.token && app.settings.passphrase ? pairPanel() : ""}
      <button class="text-btn" type="button" data-action="skip-setup">Use this phone only for now</button></div>`;
  }
  return `<div class="view"><p class="kicker">One-time setup</p><h1>Open the link Brandon sent.</h1>
    <p class="lede">It can be a text. You only do this once. After it opens, the secrets are cleared from the address bar.</p>
    <div class="card"><label>Paste the link if it did not open itself<textarea id="setup-link" placeholder="https://btcombo1.github.io/closer/#t=…"></textarea></label>
      <button class="primary full" type="button" data-action="paste-link">Set up this phone</button></div>
    <div class="card"><p class="kicker">Or enter them yourself</p>
      <input id="setup-token" data-save="setup-token" type="password" autocomplete="off" placeholder="Token" value="${esc(app.settings.token || "")}">
      <input id="setup-pass" data-save="setup-pass" type="password" autocomplete="off" placeholder="Passphrase" value="${esc(app.settings.passphrase || "")}">
      <button class="primary full" type="button" data-action="test-connection">Test connection</button>
      <button class="soft full" type="button" data-action="save-setup">Save</button>
      ${syncStatusBlock()}</div>
    <button class="text-btn" type="button" data-action="skip-setup">Use this phone only for now</button></div>`;
}

function pairPanel() {
  const link = pairLink();
  const message = `Tabby, open this once to set up Closer. Then you can delete this message.\n${link}`;
  let qr = "";
  try {
    const maker = qrcode(0, "M");
    maker.addData(link);
    maker.make();
    qr = maker.createSvgTag({ cellSize: 4, margin: 2 });
  } catch {
    qr = "";
  }
  return `<div class="card"><p class="kicker">3 · Text this to Tabby</p><p>She does not need to be next to you. One tap sets up her phone.</p>${qr}
    <button class="primary full" type="button" data-action="share-setup">Text the setup link</button>
    <button class="ghost full" type="button" data-action="copy-link">Copy the message</button>
    <button class="soft full" type="button" data-action="finish-setup">We’ve done this</button></div>`;
}

function yourTurnNow() {
  const idx = logic.currentIndex(app.state, DAYS);
  const def = DAYS[idx];
  if (!def) return false;
  return logic.turnState(def, app.state.days[def.id], profile(), app.state).code === "your-turn";
}

function nav() {
  const items = [
    ["today", "Today"],
    ["path", "Path"],
    ["dates", "Dates"],
    ["words", "Words"],
    ["more", "More"],
  ];
  return `<nav class="nav">${items
    .map(([id, label]) => {
      const dot = id === "today" && (yourTurnNow() || app.banner) ? `<i class="nav-dot"></i>` : "";
      return `<button type="button" data-go="#/${id}" class="${app.route === id ? "on" : ""}">${dot}${label}</button>`;
    })
    .join("")}</nav>`;
}

function restDay() {
  const today = logic.todayISO();
  const cont = app.settings.continueAfterDay === today ? app.settings.continueAfterId : "";
  return logic.shouldOfferRest(app.state, DAYS, today, cont);
}

async function body() {
  switch (app.route) {
    case "path":
      return app.param ? viewDayRead(app.param) : viewPath();
    case "words":
      return viewWords();
    case "ask":
      return app.param ? viewThread(app.param) : viewAsk();
    case "journal":
      return viewJournal();
    case "dates":
      return viewDates();
    case "calendar":
      return app.param ? viewCalDay(app.param) : viewCalendar();
    case "album":
      return viewAlbum();
    case "presence":
      return viewPresence();
    case "settings":
      return viewSettings();
    case "about":
      return viewAbout();
    case "pair":
      return viewPair();
    case "projects":
      return viewProjects();
    case "keepsake":
      return viewKeepsake();
    case "just":
      return viewJust();
    case "more":
      return viewMore();
    case "timeline":
      return viewTimeline();
    default:
      return viewToday();
  }
}

function viewOnboard() {
  return `<div class="view">
    <p class="kicker">For the two of you</p>
    <h1>A quiet place to finally say it.</h1>
    <p class="lede">We made Closer so the thing that keeps coming back can be said all the way through, and kept. There is no grade and no streak. Tabby’s words stay private until she marks them finished. Brandon’s part is to listen and own his part.</p>
    <div class="card note"><p>This is a companion to a licensed marriage counselor, not a replacement. Working with one alongside it is a really good idea. If a conversation gets heated, pause and come back. The words will still be here.</p></div>
    <h2>Whose phone is this?</h2>
    <button class="choice" data-profile="tabby" type="button"><strong>Tabby</strong><span>I write first. I can keep a private journal.</span></button>
    <button class="choice" data-profile="brandon" type="button"><strong>Brandon</strong><span>I wait, I reflect, and I own my part.</span></button>
  </div>`;
}

function progress() {
  const idx = logic.currentIndex(app.state, DAYS);
  const width = Math.round((Math.min(idx, DAYS.length) / DAYS.length) * 100);
  const def = DAYS[Math.min(idx, DAYS.length - 1)];
  const phase = phaseOf(def.phase);
  return `<div class="rail" aria-hidden="true"><span style="width:${width}%"></span></div>
    <p class="quiet small">Chapter ${WEEKS.findIndex((w) => w.n === def.week) + 1} of 8 · ${esc(phase?.title || "")}. Step ${Math.min(idx + 1, DAYS.length)} of ${DAYS.length}. No streak, no catching up.</p>`;
}

function viewToday() {
  const rest = restDay();
  if (rest) return restView(rest);
  const idx = logic.currentIndex(app.state, DAYS);
  if (idx >= DAYS.length) return allDone();
  const def = DAYS[idx];
  const rec = app.state.days[def.id] || {};
  const turn = logic.turnState(def, rec, profile(), app.state);
  if (rec.paused) return pausedView(def);
  if (turn.code === "waiting") return waitingView(def, turn);
  return workView(def, rec, turn);
}

function restView(def) {
  return `<div class="view rest">
    <p class="kicker">That’s enough for now</p>
    <h1>Now put the phone down and go be together.</h1>
    <p class="lede">${esc(def.together || "Five minutes, phones in another room.")}</p>
    <p class="quiet">Five minutes. Then you are done with Closer for today.</p>
    <div class="card">${presenceCard(true)}</div>
    <button class="primary full" type="button" data-action="leave">We’re going</button>
    <button class="text-btn" type="button" data-action="continue">We have a little more time</button>
  </div>`;
}

function waitingView(def, turn) {
  const hers = profile() === "brandon" && (def.owner || "tabby") !== "brandon";
  const copy = hers
    ? "Tabby is writing in her own time. You do not need to check or hurry. If you want to be kind without asking for an update, you can be in the same room without opening the topic."
    : `You’ve done your part for now. You can put the phone down. ${otherName()} will answer when they open Closer.`;
  return `<div class="view">
    ${partnerCard(def, app.state.days[def.id] || {})}
    ${progress()}
    <p class="pill wait">${esc(turn.label)}</p>
    <h1>${esc(def.title)}</h1>
    <p class="lede">${esc(copy)}</p>
    <div class="card"><p>${esc(def.together || "")}</p></div>
    <button class="primary full" type="button" data-action="leave">Put the phone down</button>
    <button class="ghost full" type="button" data-go="#/path">See the path</button>
  </div>`;
}

function pausedView(def) {
  return `<div class="view">
    <p class="pill">Paused, with no penalty</p>
    <h1>${esc(def.title)}</h1>
    <p class="lede">This day is resting. Nothing is wrong, and nothing is being counted. Come back when it feels kinder.</p>
    <button class="primary full" type="button" data-action="resume" data-day="${def.id}">Come back gently</button>
  </div>`;
}

function workView(def, rec, turn) {
  const week = weekOf(def);
  return `<div class="view">
    ${partnerCard(def, rec)}
    ${progress()}
    <p class="kicker">Week ${def.week} · ${esc(week?.theme || "")}</p>
    ${def.core ? `<p class="heart">The heart of this path</p>` : ""}
    <h1>${esc(def.title)}</h1>
    <p class="pill ${turn.code === "your-turn" ? "rose" : "sage"}">${esc(turn.label)}</p>
    ${calmingCard(def)}
    ${verseCard(def)}
    <div class="card ${def.core ? "core" : ""}">
      ${def.prompt ? `<p class="lede">${esc(def.prompt)}</p>` : ""}
      ${def.why ? `<p class="quiet"><strong>Why this question. </strong>${esc(def.why)}</p>` : ""}
      ${kindBody(def, rec)}
      <p class="quiet small">If this gets heated, pause and come back. Your words stay saved.</p>
      <button class="text-btn" type="button" data-action="pause" data-day="${def.id}">I need a pause</button>
    </div>
    ${insightCard(def)}
  </div>`;
}

function calmingCard(def) {
  const c = CALMING[def.calming];
  const script = def.calming === "reassure" ? `<p>${esc(reassureFor(def.index))}</p>` : `<p class="quiet small">Brandon can read this to Tabby, slowly.</p>`;
  return `<div class="card">
    <p class="kicker">Before the words</p>
    <h2>${esc(c.title)}</h2>
    <p>${esc(c.read)}</p>
    ${script}
    <button class="soft" type="button" data-action="calm" data-kind="${def.calming}">Open the guide</button>
  </div>`;
}

function verseCard(def) {
  return `<div class="card"><p class="verse">${esc(def.verse.text)}<cite>${esc(def.verse.ref)} (ESV)</cite></p></div>`;
}

function insightCard(def) {
  const i = def.insight;
  if (!i) return "";
  const quote = i.quote
    ? `<blockquote>“${esc(i.quote)}”</blockquote><p class="small quiet">${esc(i.from)}, ${esc(i.quoteFrom)}</p>`
    : `<p class="from">Idea from ${esc(i.from)}</p><p>${esc(i.idea)}</p>`;
  return `<div class="card insight">${quote}<p><strong>Try this. </strong>${esc(i.exercise)}</p></div>`;
}

function kindBody(def, rec) {
  if (def.kind === "break") return breakBody(def, rec);
  if (def.kind === "agreements") return agreeBody(def, rec);
  if (def.kind === "exercise") return exerciseBody(def, rec);
  if (def.kind === "date") return dateBody(def, rec);
  if (def.kind === "timeline") return `${timelineMini(def)}${bothAnswers(def, rec)}`;
  if (def.kind === "projects") return `${projectsMini()}${bothAnswers(def, rec)}`;
  if (def.kind === "affirmations") return affirmBody(def, rec);
  if (def.kind === "ritual") return ritualBody();
  if (def.kind === "close") return closeBody();
  if (def.parts) return `${partsBody(def, rec)}${partnerOnly(def, rec, "brandon")}`;
  return bothAnswers(def, rec);
}

function draftBadge() {
  return `<p class="pill rose">Draft — only you can see this</p>`;
}

function finishedBadge(answer) {
  if (!answer?.finished) return draftBadge();
  const when = answer.finishedAt
    ? new Date(answer.finishedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";
  return `<p class="pill sage">Finished${when ? ` · ${esc(when)}` : ""} · read only</p>`;
}

function answerEditor(dayId, who, answer, label, starters) {
  const mine = profile() === who;
  const view = logic.answerView(answer, profile(), who);
  if (!mine && view.state !== "visible") {
    const text = answer?.private || answer?.ct ? `${cap(who)} is writing. You will see it when they tap Mark finished.` : "Nothing here yet.";
    return `<div class="note"><strong>${esc(label)}</strong><p>${text}</p></div>`;
  }
  if (!mine && view.state === "visible") {
    return `<div class="note"><strong>${esc(label)}</strong>${finishedBadge(answer)}<p>${nl(view.text)}</p></div>`;
  }
  const done = answer?.finished;
  return `<label><strong>${esc(label)}</strong>
    ${finishedBadge(answer)}
    <textarea data-save="answer" data-day="${dayId}" data-who="${who}" ${done ? "readonly" : ""}>${esc(answer?.text || "")}</textarea>
  </label>
  ${done ? `<p class="quiet small">Saved ${esc(answer?.finishedAt ? "and sealed" : "")}. ${cap(who === "tabby" ? "brandon" : "tabby")} can read this now.</p>` : `<div class="chips">${(starters || []).map((s) => `<button type="button" class="chip" data-action="starter" data-day="${dayId}" data-who="${who}">${esc(s)}</button>`).join("")}</div>
  <p class="quiet small">${who === "brandon" ? "A shape that helps: what you heard, why it makes sense, your part, what you want her to know. " : ""}Autosaved on this phone. It stays hidden until you mark it finished.</p>
  <button class="primary" type="button" data-action="finish" data-day="${dayId}" data-who="${who}">Mark finished</button>`}`;
}

function bothAnswers(def, rec) {
  const order = def.owner === "brandon" ? ["brandon", "tabby"] : ["tabby", "brandon"];
  return order
    .map((who) => {
      const first = order[0];
      if (who !== first && !logic.textDone(rec[first]) && profile() === who) {
        return `<div class="note"><p>This opens when ${esc(cap(first))} has marked theirs finished.</p></div>`;
      }
      return answerEditor(def.id, who, rec[who], cap(who), def.starters?.[who]);
    })
    .join("");
}

function partnerOnly(def, rec, who) {
  return answerEditor(def.id, who, rec[who], cap(who), def.starters?.[who]);
}

function partsBody(def, rec) {
  return def.parts
    .map((part) => {
      const answer = rec.parts?.[part.id]?.tabby;
      if (profile() !== "tabby") {
        const view = logic.answerView(answer, profile(), "tabby");
        return `<div class="note"><strong>${esc(part.prompt)}</strong><p>${view.state === "visible" ? nl(view.text) : "Still private until Tabby marks it finished."}</p></div>`;
      }
      const done = answer?.finished;
      return `<label><strong>${esc(part.prompt)}</strong>
        ${finishedBadge(answer)}
        <textarea data-save="part" data-day="${def.id}" data-part="${part.id}" ${done ? "readonly" : ""}>${esc(answer?.text || "")}</textarea></label>
        ${done ? "" : `<button class="primary" type="button" data-action="finish-part" data-day="${def.id}" data-part="${part.id}">Mark finished</button>`}`;
    })
    .join("");
}

function breakBody(def, rec) {
  const mine = rec.ack?.[profile()];
  return `<p class="lede">${esc(def.breakNote)}</p>
    ${mine ? `<p class="pill sage">You took this rest</p>` : `<button class="primary" type="button" data-action="ack" data-day="${def.id}">I’m taking this rest</button>`}
    <p class="quiet">${rec.ack?.tabby && rec.ack?.brandon ? "You both rested." : "The other person can mark this whenever. There is no clock."}</p>`;
}

function agreeBody(def, rec) {
  const rules = GROUND_RULES.map((rule) => {
    const on = !!rec.accepts?.[profile()]?.[rule.id];
    return `<label class="check"><input type="checkbox" data-action="rule" data-day="${def.id}" data-rule="${rule.id}" ${on ? "checked" : ""}> <span>${esc(rule.text)}</span></label>`;
  }).join("");
  return `<div class="stack">${rules}</div><p class="quiet">Add anything you need, or write that these are enough.</p>${bothAnswers(def, rec)}`;
}

function exerciseBody(def, rec) {
  const revealed = logic.exerciseRevealed(rec);
  const mine = rec.exercise?.[profile()] || {};
  const lesson = (def.lesson || []).map((p) => `<p>${esc(p)}</p>`).join("");
  const examples = (def.examples || []).map((e) => `<p><strong>${esc(e.kind)}. </strong>${esc(e.text)}</p>`).join("");
  const editor = mine.finished
    ? `<div class="note">${finishedBadge(mine)}<p><strong>Helping.</strong> ${nl(mine.helping)}</p><p><strong>Criticism.</strong> ${nl(mine.criticism)}</p></div>`
    : `${draftBadge()}<label>Your helping version<textarea data-save="ex" data-day="${def.id}" data-field="helping">${esc(mine.helping || "")}</textarea></label>
       <label>Your criticism version<textarea data-save="ex" data-day="${def.id}" data-field="criticism">${esc(mine.criticism || "")}</textarea></label>
       <button class="primary" type="button" data-action="finish-ex" data-day="${def.id}">Mark finished</button>`;
  let rate = "";
  if (revealed) {
    const other = profile() === "tabby" ? "brandon" : "tabby";
    const theirs = rec.exercise?.[other] || {};
    const rating = rec.exercise?.ratings?.[profile()] || {};
    rate = `<h3>How do their words land?</h3>
      <p><strong>Helping.</strong> ${nl(theirs.helping)}</p>
      ${rateBtns(def.id, "helping", rating.helping)}
      <p><strong>Criticism.</strong> ${nl(theirs.criticism)}</p>
      ${rateBtns(def.id, "criticism", rating.criticism)}
      <p class="quiet">This is about the wording, not a grade of the person.</p>`;
  } else editor && (rate = `<p class="quiet">You’ll see each other’s versions after you have both shared. Nothing to win.</p>`);
  return `<p class="lede">${esc(def.scenario || "")}</p>${lesson}${examples}${editor}${rate}`;
}

function rateBtns(day, field, current) {
  return `<div class="chips">${["supported", "mixed", "judged"]
    .map(
      (v) =>
        `<button type="button" class="chip" data-action="rate" data-day="${day}" data-field="${field}" data-value="${v}">${current === v ? "✓ " : ""}${esc(v)}</button>`
    )
    .join("")}</div>`;
}

function dateBody(def, rec) {
  const plan = Object.values(app.state.datePlans || {}).find((p) => p.workbookDayId === def.id);
  const idea = plan ? ideaById(plan.ideaId, app.state.customIdeas) : null;
  return `<p class="lede">${esc(def.dateTitle || "")}</p>
    <p>${esc(def.lightPrompt || "")}</p>
    ${
      idea
        ? `<div class="note"><strong>${esc(idea.title)}</strong><p>${esc(plan.leader === "brandon" ? "Brandon" : "Tabby")} leads · ${esc(plan.date || "")}</p></div>`
        : `<p class="quiet">Pick an idea that fits his nights at work. Short dates before a shift. Longer ones on days off.</p><button class="soft" type="button" data-go="#/dates">Open date nights</button>`
    }
    ${bothAnswers(def, rec)}`;
}

function timelineMini(def) {
  const years = def.years || [];
  const events = (app.state.timeline || []).filter((e) => years.includes(Number(e.year)));
  return `<div class="stack">${years
    .map((year) => `<button class="ghost" type="button" data-go="#/timeline">${year}</button>`)
    .join("")}<p class="quiet">${events.length ? `${events.length} memories saved on the timeline.` : "Add memories on the timeline. They stay, even after this day."}</p></div>`;
}

function projectsMini() {
  return `<button class="soft" type="button" data-go="#/projects">Open the project list</button>`;
}

function affirmBody(def, rec) {
  const list = (app.state.affirmations || []).filter((a) => !a.removed);
  const items = list
    .map(
      (a) => `<div class="note"><p>${nl(a.text)}</p>${
        profile() === "tabby"
          ? `<button class="text-btn" type="button" data-action="save-aff" data-id="${a.id}">${a.saved ? "Saved" : "Save this"}</button>`
          : ""
      }</div>`
    )
    .join("");
  const add =
    profile() === "brandon"
      ? `<textarea id="aff-draft" placeholder="A true sentence about who she is"></textarea><button class="primary" type="button" data-action="add-aff">Add this</button><button class="soft" type="button" data-action="ready-aff">These are ready for her</button>`
      : "";
  return `${items}${add}${answerEditor(def.id, "tabby", rec.tabby, "Tabby", def.starters?.tabby)}`;
}

function ritualBody() {
  const c = app.state.closure || {};
  const field = (key, label, who) => {
    if (profile() !== who) return `<div class="note"><strong>${esc(label)}</strong><p>${nl(c[key] || "Waiting.")}</p></div>`;
    return `<label>${esc(label)}<textarea data-save="closure" data-field="${key}">${esc(c[key] || "")}</textarea></label>`;
  };
  return `${field("said", "What has been said", "tabby")}${field("released", "What I release, and what I do not", "tabby")}${field("brandonHeard", "What I heard, and what I am putting down", "brandon")}`;
}

function closeBody() {
  const c = app.state.closure || {};
  const mine = profile() === "tabby" ? c.tabbyClosed : c.brandonClosed;
  return `<p class="lede">The record stays. You can add more later without starting over.</p>
    ${mine ? `<p class="pill sage">You marked this chapter closed</p>` : `<button class="primary full" type="button" data-action="close-chapter">I’m closing this chapter with you</button>`}
    <button class="ghost full" type="button" data-go="#/keepsake">See the keepsake</button>`;
}

function cap(who) {
  return who === "tabby" ? "Tabby" : "Brandon";
}

function viewPath() {
  const idx = logic.currentIndex(app.state, DAYS);
  const groups = PHASES.map((phase) => {
    const days = DAYS.filter((d) => d.phase === phase.id);
    const rows = days
      .map((d) => {
        const done = logic.isDayComplete(app.state.days[d.id], d, app.state);
        const now = DAYS[idx]?.id === d.id;
        return `<button class="day-row" type="button" data-go="#/path/${d.id}"><span><strong>${esc(d.title)}</strong><br><small>${done ? "Kept" : now ? "Today" : "Ahead"}</small></span>${d.core ? `<span class="heart">Heart</span>` : ""}</button>`;
      })
      .join("");
    return `<section class="phase" id="phase-${phase.id}"><p class="kicker">${esc(phase.title)}</p><p class="quiet">${esc(phase.blurb)}</p>${rows}</section>`;
  }).join("");
  return `<div class="view"><h1>The path</h1><p class="quiet">One step at a time. The incident is the center. Everything else is here to support it.</p>${progress()}${groups}<button class="ghost" type="button" data-go="#/timeline">Our ten-year timeline</button></div>`;
}

function viewDayRead(id) {
  const def = DAYS.find((d) => d.id === id);
  if (!def) return `<div class="view"><p>That day is not on the path.</p></div>`;
  const idx = logic.currentIndex(app.state, DAYS);
  if (def.index > idx) {
    return `<div class="view"><button class="text-btn" type="button" data-go="#/path">Back</button><h1>${esc(def.title)}</h1><p class="lede">This opens when you arrive. Nothing is due before then.</p><p class="quiet">${esc(phaseOf(def.phase)?.blurb || "")}</p></div>`;
  }
  if (def.index === idx) return `<div class="view"><button class="text-btn" type="button" data-go="#/today">This is today’s step</button>${workView(def, app.state.days[id] || {}, logic.turnState(def, app.state.days[id], profile(), app.state))}</div>`;
  const rec = app.state.days[id] || {};
  const additions = (app.state.phaseSeals?.[def.phase]?.additions || [])
    .map((add) => {
      const owner = add.by || "tabby";
      if (!add.finished && owner !== profile()) return `<div class="note"><p>${cap(owner)} is adding more. Still a draft.</p></div>`;
      if (!add.finished && owner === profile()) {
        return `<div class="card">${draftBadge()}<p>${nl(add.text || "")}</p><button class="primary" type="button" data-action="finish-add" data-phase="${def.phase}" data-id="${add.id}">Mark finished</button></div>`;
      }
      if (!add.text) return "";
      return `<div class="note">${finishedBadge(add)}<p>${nl(add.text)}</p></div>`;
    })
    .join("");
  return `<div class="view"><button class="text-btn" type="button" data-go="#/path">Back</button><h1>${esc(def.title)}</h1>${verseCard(def)}<div class="card">${readAnswers(def, rec)}</div>${additions}<button class="ghost" type="button" data-action="add-more" data-phase="${def.phase}">Add more later</button></div>`;
}

function readAnswers(def, rec) {
  if (def.kind === "break") return `<p>${esc(def.breakNote)}</p>`;
  const blocks = ["tabby", "brandon"]
    .map((who) => {
      const view = logic.answerView(rec[who], profile(), who);
      if (view.state !== "visible") return "";
      return `<p><strong>${cap(who)}</strong><br>${nl(view.text)}</p>`;
    })
    .join("");
  return blocks || "<p>Kept, quietly.</p>";
}

function viewWords() {
  const openQ = (app.state.questions || []).filter((q) => q.status !== "closed").length;
  return `<div class="view"><h1>Words</h1>
    <button class="choice" type="button" data-go="#/journal"><strong>Open journal</strong><span>Get it all out. Private, unless you share it.</span></button>
    <button class="choice" type="button" data-go="#/ask"><strong>Ask Brandon</strong><span>${openQ ? `${openQ} still open` : "A question, any time, kept forever."}</span></button>
    <button class="choice" type="button" data-go="#/presence"><strong>Be present</strong><span>A shared phone-free goal. For both of you.</span></button>
  </div>`;
}

function viewAsk() {
  const mine = profile() === "tabby";
  const draft = (app.state.questions || []).find((q) => (q.author || "tabby") === "tabby" && !q.finished && (mine || q.text));
  const list = [...(app.state.questions || [])].reverse().filter((q) => {
    if (!q.finished && (q.author || "tabby") !== profile()) return false;
    if (q.private && !q.text && (q.author || "tabby") !== profile()) return false;
    if (!q.finished && q === draft) return false;
    return true;
  });
  const form = mine
    ? `<div class="card">${draftBadge()}
      <label>Ask anything<textarea data-save="ask-live" data-id="${esc(draft?.id || "")}" placeholder="What I still need to know is…">${esc(draft?.text || "")}</textarea></label>
      <label class="check"><input data-save="ask-incident" data-id="${esc(draft?.id || "")}" type="checkbox" ${draft?.aboutIncident ? "checked" : ""}> <span>This is about the incident</span></label>
      <p class="quiet small">Autosaved. Brandon cannot see this until you mark it finished.</p>
      <button class="primary" type="button" data-action="finish-ask" data-id="${esc(draft?.id || "")}">Mark finished</button></div>`
    : `<p class="quiet">Questions appear here after Tabby marks them finished. Your reply stays a draft until you do the same.</p>`;
  const rows = list
    .map((q) => {
      const label = q.text || (q.locked ? "This draft needs your backup code." : "Draft");
      const state = q.finished ? "Finished" : "Draft";
      return `<button class="list-btn" type="button" data-go="#/ask/${q.id}"><strong>${esc(label)}</strong><br><small>${state}${q.aboutIncident && q.finished ? " · incident" : ""}</small></button>`;
    })
    .join("");
  return `<div class="view"><h1>Ask Brandon</h1><p class="quiet">This stays outside the daily step. A question stays yours alone until you mark it finished.</p>${form}${rows || `<div class="card"><p>No finished questions yet.</p></div>`}</div>`;
}

function viewThread(id) {
  const q = (app.state.questions || []).find((item) => item.id === id);
  if (!q) return `<div class="view"><p>That question is not here.</p></div>`;
  const qOwner = q.author || "tabby";
  if (qOwner !== profile() && !q.finished) {
    return `<div class="view"><button class="text-btn" type="button" data-go="#/ask">All questions</button><h1>Still a draft</h1><p>You will see this when it is marked finished.</p></div>`;
  }
  const thread = (q.thread || [])
    .filter((m) => m.finished || (m.author || (m.role === "answer" ? "brandon" : "tabby")) === profile())
    .map((m) => {
      const who = m.author || (m.role === "answer" ? "brandon" : "tabby");
      if (!m.finished && who !== profile()) return "";
      return `<div class="note"><strong>${cap(who)}</strong>${m.finished ? finishedBadge(m) : draftBadge()}<p>${nl(m.text || "")}</p></div>`;
    })
    .join("");
  const mineDraft = (q.thread || []).find((m) => (m.author || (m.role === "answer" ? "brandon" : "tabby")) === profile() && !m.finished);
  const canReply = q.finished && q.status !== "closed";
  const box = canReply
    ? `<div class="card">${draftBadge()}<textarea data-save="reply-live" data-id="${q.id}" data-mid="${esc(mineDraft?.id || "")}" placeholder="${profile() === "brandon" ? "The honest answer is…" : "A follow-up, if you want one"}">${esc(mineDraft?.text || "")}</textarea>
      <button class="primary" type="button" data-action="finish-reply" data-id="${q.id}" data-mid="${esc(mineDraft?.id || "")}">Mark finished</button>
      ${profile() === "tabby" ? `<button class="ghost" type="button" data-action="close-q" data-id="${q.id}">This feels answered</button>` : ""}</div>`
    : "";
  const title = q.finished || qOwner === profile() ? q.text || "Question" : "Question";
  return `<div class="view"><button class="text-btn" type="button" data-go="#/ask">All questions</button><h1>${esc(title)}</h1>${q.finished ? finishedBadge(q) : draftBadge()}${thread}${box}</div>`;
}

function viewJournal() {
  const who = profile();
  const draft = (app.state.journal || []).find((e) => (e.by || "tabby") === who && !e.finished && !e.removed);
  const form =
    who === "tabby"
      ? `<div class="card">${draftBadge()}
      <label>Get it all out<textarea data-save="journal-live" data-id="${esc(draft?.id || "")}">${esc(draft?.text || "")}</textarea></label>
      <label class="check"><input data-save="journal-share" data-id="${esc(draft?.id || "")}" type="checkbox" ${draft?.share ? "checked" : ""}> <span>Share with Brandon after I mark this finished</span></label>
      <p class="quiet small">Autosaved. He cannot read a draft, even after the phones sync.</p>
      <button class="primary" type="button" data-action="finish-journal" data-id="${esc(draft?.id || "")}">Mark finished</button></div>`
      : `<p class="quiet">You see an entry only after Tabby marks it finished and chooses to share it. An acknowledgment stays yours until you mark that finished too.</p>`;
  const rows = (app.state.journal || [])
    .filter((e) => !e.removed && e !== draft)
    .map((e) => {
      const owner = e.by || "tabby";
      const mine = owner === who;
      if (!e.finished && !mine) return "";
      if (e.finished && e.visibility !== "shared" && !mine) return "";
      if (!mine && e.private && !e.text) return "";
      const text = e.text || (e.locked ? "This draft needs the backup code in Settings." : "");
      if (!text && !mine) return "";
      const ack = e.ack;
      const ackVisible = ack && (ack.finished || who === "brandon");
      return `<article class="card">${mine && !e.finished ? draftBadge() : e.finished ? finishedBadge(e) : ""}<p class="small quiet">${e.visibility === "shared" && e.finished ? "Shared" : "Private"}</p><p>${nl(text)}</p>${
        who === "brandon" && e.finished && e.visibility === "shared"
          ? `${ack?.finished ? "" : draftBadge()}<textarea data-save="journal-ack" data-id="${e.id}">${esc(ack?.text || "")}</textarea><button class="soft" type="button" data-action="finish-ack" data-id="${e.id}">Mark finished</button>`
          : ackVisible && ack?.text
            ? `<div class="note"><strong>Brandon</strong>${ack.finished ? finishedBadge(ack) : ""}${nl(ack.text)}</div>`
            : ""
      }</article>`;
    })
    .join("");
  return `<div class="view"><h1>Open journal</h1>${form}${rows || `<p class="quiet">Nothing finished here yet. A few honest sentences are enough.</p>`}</div>`;
}

function viewDates() {
  const start = app.state.schedule.startISO || logic.todayISO();
  const ideas = allIdeas(app.state.customIdeas);
  let rhythm = logic.buildRhythm({
    startISO: start,
    count: 21,
    workNights: app.state.schedule.workNights,
    ideas,
    overnightEvery: app.state.schedule.overnightEvery || 28,
  });
  rhythm = logic.applyPlanOverrides(rhythm, app.state.datePlans);
  const today = logic.todayISO();
  const upcoming = rhythm.filter((r) => r.date >= today).slice(0, 10);
  const cards = upcoming
    .map((r) => {
      const idea = ideaById(r.ideaId, app.state.customIdeas);
      return `<article class="card date-card">
        <p class="small quiet">${esc(r.date)} · ${esc(logic.WEEKDAYS[r.weekday])} · ${esc(LENGTHS.find((l) => l.id === r.length)?.label || r.length)}</p>
        <h2>${esc(idea?.title || "A date to choose")}</h2>
        <p class="leader">${r.leader === "brandon" ? "Brandon" : "Tabby"} leads</p>
        <p>${esc(WHEN_LABEL[r.when] || "")}. ${esc(idea?.summary || "")}</p>
        <p class="quiet small">${esc(LEADER_NOTE)} Phones go in a basket.</p>
        <button class="soft" type="button" data-action="plan-date" data-date="${r.date}" data-idea="${r.ideaId || ""}" data-leader="${r.leader}" data-length="${r.length}">We’ll do this</button>
      </article>`;
    })
    .join("");
  const shown = ideas.filter((idea) => !app.settingFilter || idea.setting === app.settingFilter);
  const library = shown
    .slice(0, 12)
    .map(
      (idea) =>
        `<button class="list-btn" type="button" data-action="plan-next" data-idea="${idea.id}" data-length="${idea.length}"><strong>${esc(idea.title)}</strong><br><small>${esc(LENGTHS.find((l) => l.id === idea.length)?.label || "")} · ${esc(idea.setting)}</small></button>`
    )
    .join("");
  return `<div class="view"><h1>Date nights</h1>
    <p class="lede">Something small most days. Bigger dates on nights he is off. Overnights about monthly, never bumped into a shift.</p>
    <p class="quiet">${esc(app.state.schedule.shiftLabel)}. Change the nights in Settings if overtime moves them.</p>
    ${cards}
    <h2>Library</h2>
    <div class="filters">${SETTINGS.map((s) => `<button type="button" class="${app.settingFilter === s.id ? "on" : ""}" data-action="filter-set" data-id="${s.id}">${esc(s.label)}</button>`).join("")}</div>
    ${library}
    <button class="ghost full" type="button" data-go="#/just">Just Us, optional</button>
  </div>`;
}

function monthMatrix(iso) {
  const [y, m] = iso.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startPad = first.getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array(startPad).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  return { y, m, cells };
}

function viewCalendar() {
  const cursor = app.calMonth || logic.todayISO().slice(0, 7) + "-01";
  const { y, m, cells } = monthMatrix(cursor);
  const head = `${["January","February","March","April","May","June","July","August","September","October","November","December"][m - 1]} ${y}`;
  const today = logic.todayISO();
  const grid = cells
    .map((iso) => {
      if (!iso) return `<span></span>`;
      const items = logic.calendarItems(iso, app.state, DAYS);
      const dots = items
        .filter((item) => item.type !== "shift")
        .slice(0, 3)
        .map((item) => `<i class="dot ${esc(item.type)}"></i>`)
        .join("");
      const shift = items.some((item) => item.type === "shift");
      return `<button type="button" class="cell${iso === today ? " today" : ""}${shift ? " shift" : ""}" data-go="#/calendar/${iso}">${Number(iso.slice(-2))}<span class="dots">${dots}</span></button>`;
    })
    .join("");
  return `<div class="view"><div class="row" style="justify-content:space-between"><button class="text-btn" type="button" data-action="month" data-dir="-1">Back</button><h1>${head}</h1><button class="text-btn" type="button" data-action="month" data-dir="1">Next</button></div>
    <div class="cal">${["S","M","T","W","T","F","S"].map((d) => `<span class="dow">${d}</span>`).join("")}${grid}</div>
    <p class="quiet small">Rose is a date, green is time you were present together, gold is a celebration. Shaded days are work nights. A quiet day is not a missed streak.</p>
    <button class="ghost" type="button" data-action="add-celebration">Add a celebration</button></div>`;
}

function viewCalDay(iso) {
  const items = logic.calendarItems(iso, app.state, DAYS);
  const photos = (app.state.photos || []).filter((p) => p.on === iso || items.some((i) => i.type === "photo" && i.id === p.id));
  const list = items
    .map((item) => `<article class="card"><p class="kicker">${esc(item.type)}</p><h2>${esc(item.title)}</h2><p>${esc(item.detail || "")}</p></article>`)
    .join("");
  const shots = photos
    .map((p) => `<figure class="shot">${app.photoUrls[p.id] ? `<img alt="" src="${app.photoUrls[p.id]}">` : ""}<p>${esc(p.caption || "Photo")}</p></figure>`)
    .join("");
  return `<div class="view"><button class="text-btn" type="button" data-go="#/calendar">Calendar</button><h1>${esc(iso)}</h1>${list || `<p class="quiet">A quiet day. Nothing was owed.</p>`}<div class="album">${shots}</div>
    <button class="soft" type="button" data-action="add-photo" data-on="${iso}">Add a photo to this day</button></div>`;
}

function viewAlbum() {
  const photos = [...(app.state.photos || [])].reverse();
  const shots = photos
    .map(
      (p) =>
        `<button class="shot" type="button" data-go="#/calendar/${p.on || logic.todayISO()}"><img alt="" src="${app.photoUrls[p.id] || ""}"><p>${esc(p.caption || "Untitled")}</p></button>`
    )
    .join("");
  return `<div class="view"><h1>Album</h1><p class="quiet">Pictures from dates, milestones, and ordinary days. They are shrunk on this phone, then encrypted before they ever leave it.</p>
    <button class="primary" type="button" data-action="add-photo">Add a picture</button>
    <div class="album">${shots || `<p class="quiet">No pictures yet.</p>`}</div></div>`;
}

function viewPresence() {
  const today = logic.todayISO();
  const challenge = challengeFor(today);
  const ideas = reconnectFor(today, 3);
  const done = app.state.presence?.[today];
  return `<div class="view"><h1>Be present</h1><p class="lede">${esc(BE_INTRO)}</p>
    ${presenceCard(false)}
    <h2>If you have one minute</h2>
    ${ideas.map((idea) => `<article class="card"><h3>${esc(idea.title)}</h3><p>${esc(idea.detail)}</p></article>`).join("")}
    <p class="quiet">One is enough. ${done ? "Today is already marked, together." : "You can mark the day’s challenge from here or from the closing screen."}</p></div>`;
}

function presenceCard() {
  const today = logic.todayISO();
  const challenge = challengeFor(today);
  const done = app.state.presence?.[today];
  return `<div class="card"><p class="kicker">Today, together</p><h2>${esc(challenge.title)}</h2><p>${esc(challenge.detail)}</p>
    ${done ? `<p class="pill sage">Present together</p>` : `<button class="primary" type="button" data-action="present" data-id="${challenge.id}" data-title="${esc(challenge.title)}">We did this</button>`}
  </div>`;
}

function viewMore() {
  return `<div class="view"><h1>More</h1>
    <button class="list-btn" type="button" data-action="open-sync-key"><strong>Sync key</strong><br><small>Paste a new GitHub token</small></button>
    ${["calendar","album","presence","timeline","projects","keepsake","just","settings","about","pair"]
      .map((id) => `<button class="list-btn" type="button" data-go="#/${id}"><strong>${esc(labelFor(id))}</strong></button>`)
      .join("")}
  </div>`;
}

function labelFor(id) {
  return {
    calendar: "Calendar",
    album: "Photo album",
    presence: "Be present",
    timeline: "Ten-year timeline",
    projects: "Money and projects",
    keepsake: "Keepsake",
    just: "Just Us",
    settings: "Settings",
    about: "About",
    pair: "Pair Tabby’s phone",
  }[id];
}

function viewTimeline() {
  const years = [];
  for (let y = 2018; y <= 2026; y++) years.push(y);
  const body = years
    .map((year) => {
      const events = (app.state.timeline || []).filter((e) => Number(e.year) === year);
      const cards = events.map((e) => `<article class="card"><p class="small">${esc(e.kind)} · ${esc(e.by)}</p><p>${nl(e.text)}</p></article>`).join("");
      return `<section><h2>${year}</h2>${year === 2018 ? `<p class="quiet">Together since April 2018.</p>` : ""}${year === 2020 ? `<p class="quiet">Married November 21, 2020.</p>` : ""}${cards}
        <button class="ghost" type="button" data-action="add-memory" data-year="${year}">Add a memory</button></section>`;
    })
    .join("");
  return `<div class="view"><button class="text-btn" type="button" data-go="#/path">Path</button><h1>Our story</h1>
    <p class="lede">A blended family, ten kids and grandkids between you, and a decade that holds love, strain, and rebuilding. Write only what you want remembered. This is not a record of charges.</p>${body}</div>`;
}

function viewProjects() {
  const lanes = ["now", "next", "someday"];
  const list = (lane) =>
    (app.state.projects || [])
      .filter((p) => p.lane === lane && !p.removed)
      .map((p) => `<article class="card"><strong>${esc(p.title)}</strong><p>${esc(p.note || "")}</p></article>`)
      .join("") || `<p class="quiet">Empty, on purpose.</p>`;
  return `<div class="view"><h1>One project at a time</h1>
    <p class="lede">The limit is how you protect the family and still leave room for what matters. It is not “you can’t do anything.” Next and Someday stay alive.</p>
    <div class="card"><label>Pause and talk before we pass<textarea data-save="budget">${esc(app.state.budget?.limit || "")}</textarea></label></div>
    ${lanes.map((lane) => `<h2>${lane}</h2>${list(lane)}`).join("")}
    <button class="primary" type="button" data-action="add-project">Add a project</button></div>`;
}

function viewKeepsake() {
  const c = app.state.closure || {};
  const lines = (app.state.affirmations || []).filter((a) => a.saved && a.text);
  return `<div class="view"><h1>Keepsake</h1>
    <article class="card"><h2>What was said</h2><p>${nl(c.said || "This fills in as you close the chapter.")}</p></article>
    <article class="card"><h2>Released, and not yet</h2><p>${nl(c.released || "")}</p></article>
    <article class="card"><h2>What Brandon is putting down</h2><p>${nl(c.brandonHeard || "")}</p></article>
    <article class="card"><h2>Saved words</h2>${lines.map((a) => `<p>${nl(a.text)}</p>`).join("") || `<p class="quiet">None saved yet.</p>`}</article>
    ${c.tabbyClosed && c.brandonClosed ? `<p class="pill sage">You closed this chapter together</p>` : `<p class="quiet">The closing moment appears when you both mark it.</p>`}
  </div>`;
}

function viewJust() {
  if (!app.justOpen) {
    return `<div class="view rest"><p class="kicker">Optional</p><h1>Just Us</h1><p class="lede">${esc(JUST_INTRO)}</p><button class="primary" type="button" data-action="open-just">Enter, only if you want to</button><button class="text-btn" type="button" data-go="#/dates">Not now</button></div>`;
  }
  const ideas = justIdeas(app.state.justUs?.ideas).map((idea) => `<article class="card"><h2>${esc(idea.title)}</h2><p>${esc(idea.summary)}</p></article>`).join("");
  const list = JUST_LIST.map((item) => {
    const mine = app.state.justUs?.lists?.[item.id]?.[profile()] || "";
    return `<div class="card"><p>${esc(item.label)}</p><div class="chips">${["yes", "no", "maybe"]
      .map((v) => `<button type="button" class="chip" data-action="ynm" data-id="${item.id}" data-value="${v}">${mine === v ? "✓ " : ""}${v}</button>`)
      .join("")}</div></div>`;
  }).join("");
  return `<div class="view"><button class="text-btn" type="button" data-action="close-just">Leave this room</button><h1>Just Us</h1><p class="quiet">Nothing here is on the calendar unless you add it yourself. No is a complete answer.</p>${ideas}<h2>Yes, no, maybe</h2>${list}
    ${JUST_PROMPTS.map((p) => `<article class="card"><h3>${esc(p.title)}</h3></article>`).join("")}</div>`;
}

function viewSettings() {
  const nights = app.state.schedule.workNights || {};
  const toggles = logic.WEEKDAYS.map(
    (name, i) =>
      `<label class="check"><input type="checkbox" data-action="work-night" data-dow="${i}" ${nights[i] ? "checked" : ""}> <span>${name} night</span></label>`
  ).join("");
  return `<div class="view"><h1>Settings</h1>
    <div class="card" id="sync-key-card"><p class="kicker">Sync key</p>
      <p>Paste a new GitHub token here. Your answers and passphrase stay on this phone.</p>
      <label>Sync key<input id="sync-key" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="github_pat_…"></label>
      <button class="primary full" type="button" data-action="save-sync-key">Save sync key</button>
      ${syncStatusBlock()}
    </div>
    <div class="card"><p class="kicker">This phone</p>
      <button class="ghost" type="button" data-profile="tabby">I’m Tabby</button>
      <button class="ghost" type="button" data-profile="brandon">I’m Brandon</button>
    </div>
    <div class="card"><p class="kicker">Work nights</p><p class="quiet">Brandon works weekend nights at GE Aerospace, about a 36-hour week, sometimes overtime. Micro-dates land before those shifts. Bigger dates move to nights off.</p>${toggles}
      <label>What to call the shift<input id="shift-label" type="text" value="${esc(app.state.schedule.shiftLabel || "")}"></label>
      <button class="soft" type="button" data-action="save-shift">Save schedule</button></div>
    <div class="card"><p class="kicker">Passphrase</p>
      <label>Shared passphrase<input id="pass" type="password" autocomplete="off" value="${esc(app.settings.passphrase || "")}"></label>
      <p class="quiet small">Leave this unless you are changing the sentence you share. It does not change when you paste a new sync key.</p>
      <button class="ghost" type="button" data-action="save-passphrase">Save passphrase</button>
      <button class="text-btn" type="button" data-action="clear-secrets">Clear token and passphrase</button>
    </div>
    ${app.settings.authorKey || app.settings.journalKey ? `<div class="card"><p class="kicker">Draft backup code</p><p class="small">Only you should keep this. It opens your unfinished writing on a new phone. It does not let the other person read drafts.</p><p style="word-break:break-all">${esc(app.settings.authorKey || app.settings.journalKey)}</p></div>` : ""}
    <button class="ghost" type="button" data-action="enable-notify">Notify me when it’s my turn</button>
    <button class="list-btn" type="button" data-go="#/pair"><strong>Pair Tabby’s phone</strong></button>
    <button class="list-btn" type="button" data-go="#/about"><strong>About</strong></button>
  </div>`;
}

function viewAbout() {
  return `<div class="view"><h1>About Closer</h1>
    <p class="lede">A private workbook for Tabby and Brandon Turner. The center is one incident from about ten years ago, told in her words, heard without a defense, and closed only if she is ready.</p>
    <div class="card"><p>This is a companion to a licensed marriage counselor, not a replacement. If things get heated, pause and come back.</p></div>
    <p>You have been together since April 2018 and married since November 21, 2020. The app keeps a permanent record so you never start from zero.</p>
    <p class="quiet small">Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.</p>
  </div>`;
}

function viewPair() {
  if (!app.settings.token || !app.settings.passphrase) {
    return `<div class="view"><h1>Pair Tabby’s phone</h1><p>Add the token and passphrase in Settings first. The link keeps those secrets in the hidden part of the address, which a text can carry and a server does not store.</p></div>`;
  }
  return `<div class="view"><h1>Pair Tabby’s phone</h1><p>Text her the link. She can be anywhere. She opens it once.</p>${pairPanel()}</div>`;
}

function pairLink() {
  const url = new URL("./", location.href);
  url.hash = `t=${encodeURIComponent(app.settings.token)}&p=${encodeURIComponent(app.settings.passphrase)}&who=tabby`;
  return url.toString();
}

function allDone() {
  return `<div class="view"><h1>You kept the whole path.</h1><p class="lede">The record stays. If the feeling comes back, add to the chapter. You do not start over.</p><button class="primary" type="button" data-go="#/keepsake">Open the keepsake</button></div>`;
}

function calmingOverlay() {
  const kind = app.calmKind || "box";
  const c = CALMING[kind];
  return `<div class="sheet"><div class="panel"><p class="kicker">${esc(c.title)}</p><div class="breath-wrap"><div class="breath ${kind === "478" ? "b478" : ""}"></div></div><p>${esc(c.read)}</p><button class="primary full" type="button" data-action="close-calm">I’m ready</button></div></div>`;
}

function onClick(event) {
  const btn = event.target.closest("[data-go],[data-profile],[data-action]");
  if (!btn) return;
  if (btn.dataset.go) {
    go(btn.dataset.go);
    return;
  }
  if (btn.dataset.profile) {
    chooseProfile(btn.dataset.profile);
    return;
  }
  const action = btn.dataset.action;
  if (action) handle(action, btn);
}

function onInput(event) {
  const el = event.target;
  if (el.dataset.save === "answer") {
    const rec = dayRec(el.dataset.day);
    rec[el.dataset.who] = { ...(rec[el.dataset.who] || {}), text: el.value, updatedAt: Date.now(), finished: false };
    scheduleSave();
  }
  if (el.dataset.save === "part") {
    const rec = dayRec(el.dataset.day);
    rec.parts = rec.parts || {};
    rec.parts[el.dataset.part] = rec.parts[el.dataset.part] || {};
    rec.parts[el.dataset.part].tabby = {
      ...(rec.parts[el.dataset.part].tabby || {}),
      text: el.value,
      updatedAt: Date.now(),
      finished: false,
    };
    scheduleSave();
  }
  if (el.dataset.save === "ex") {
    const rec = dayRec(el.dataset.day);
    rec.exercise = rec.exercise || {};
    rec.exercise[profile()] = { ...(rec.exercise[profile()] || {}), [el.dataset.field]: el.value, updatedAt: Date.now(), finished: false };
    scheduleSave();
  }
  if (el.dataset.save === "closure") {
    app.state.closure[el.dataset.field] = el.value;
    app.state.closure[`${el.dataset.field}At`] = Date.now();
    scheduleSave();
  }
  if (el.dataset.save === "setup-token") app.settings.token = el.value.trim();
  if (el.dataset.save === "setup-pass") app.settings.passphrase = el.value;
  if (el.dataset.save === "journal-live") {
    const entry = ensureJournalDraft(el.dataset.id);
    el.dataset.id = entry.id;
    entry.text = el.value;
    entry.updatedAt = Date.now();
    entry.finished = false;
    scheduleSave();
  }
  if (el.dataset.save === "journal-share") {
    const entry = ensureJournalDraft(el.dataset.id);
    entry.share = el.checked;
    entry.updatedAt = Date.now();
    scheduleSave();
  }
  if (el.dataset.save === "journal-ack") {
    const entry = app.state.journal.find((item) => item.id === el.dataset.id);
    if (entry) {
      entry.ack = { ...(entry.ack || {}), text: el.value, finished: false, by: "brandon", updatedAt: Date.now() };
      entry.updatedAt = Date.now();
      scheduleSave();
    }
  }
  if (el.dataset.save === "ask-live") {
    const q = ensureAskDraft(el.dataset.id);
    el.dataset.id = q.id;
    q.text = el.value;
    q.updatedAt = Date.now();
    q.finished = false;
    q.status = "draft";
    scheduleSave();
  }
  if (el.dataset.save === "ask-incident") {
    const q = ensureAskDraft(el.dataset.id);
    q.aboutIncident = el.checked;
    q.updatedAt = Date.now();
    scheduleSave();
  }
  if (el.dataset.save === "reply-live") {
    const msg = ensureReplyDraft(el.dataset.id, el.dataset.mid);
    el.dataset.mid = msg.id;
    msg.text = el.value;
    msg.updatedAt = Date.now();
    msg.finished = false;
    scheduleSave();
  }
  if (el.dataset.save === "budget") {
    app.state.budget.limit = el.value;
    app.state.budget.updatedAt = Date.now();
    app.state.budget.updatedBy = profile();
    scheduleSave();
  }
}

async function chooseProfile(name) {
  app.settings.profile = name;
  if (!app.settings.authorKey && !app.settings.journalKey) {
    const key = await crypto.generateJournalKey();
    app.settings.authorKey = key;
    app.settings.journalKey = key;
  } else if (!app.settings.authorKey) {
    app.settings.authorKey = app.settings.journalKey;
  }
  db.saveSettings(app.settings);
  if (!app.state.schedule.startISO) {
    app.state.schedule.startISO = logic.todayISO();
    app.state.schedule.updatedAt = Date.now();
    await db.saveState(app.state);
  }
  go("#/today");
  render();
}

function handle(action, btn) {
  const day = btn.dataset.day;
  if (action === "pause") {
    const rec = dayRec(day);
    rec.paused = true;
    rec.pausedAt = Date.now();
    rec.pausedBy = profile();
    scheduleSave();
    render();
  }
  if (action === "resume") {
    const rec = dayRec(day);
    rec.paused = false;
    rec.pausedAt = Date.now();
    scheduleSave();
    render();
  }
  if (action === "finish") finishAnswer(day, btn.dataset.who);
  if (action === "finish-part") {
    const rec = dayRec(day);
    const part = rec.parts?.[btn.dataset.part]?.tabby;
    if (part?.text?.trim()) {
      part.finished = true;
      part.finishedAt = Date.now();
      maybeComplete(day);
      scheduleSave();
      render();
    }
  }
  if (action === "starter") {
    const rec = dayRec(day);
    const who = btn.dataset.who;
    const prev = rec[who]?.text || "";
    rec[who] = { ...(rec[who] || {}), text: `${prev}${prev ? " " : ""}${btn.textContent}`, updatedAt: Date.now(), finished: false };
    scheduleSave();
    render();
  }
  if (action === "ack") {
    const rec = dayRec(day);
    rec.ack = rec.ack || {};
    rec.ack[profile()] = Date.now();
    maybeComplete(day);
    scheduleSave();
    render();
  }
  if (action === "rule") {
    const rec = dayRec(day);
    rec.accepts = rec.accepts || {};
    rec.accepts[profile()] = rec.accepts[profile()] || {};
    rec.accepts[profile()][btn.dataset.rule] = btn.checked;
    scheduleSave();
  }
  if (action === "finish-ex") {
    const rec = dayRec(day);
    const mine = rec.exercise?.[profile()];
    if (mine?.helping?.trim() && mine?.criticism?.trim()) {
      mine.finished = true;
      mine.updatedAt = Date.now();
      maybeComplete(day);
      scheduleSave();
      render();
    }
  }
  if (action === "rate") {
    const rec = dayRec(day);
    rec.exercise.ratings = rec.exercise.ratings || {};
    rec.exercise.ratings[profile()] = { ...(rec.exercise.ratings[profile()] || {}), [btn.dataset.field]: btn.dataset.value, updatedAt: Date.now() };
    maybeComplete(day);
    scheduleSave();
    render();
  }
  if (action === "leave") go("#/presence");
  if (action === "continue") {
    const rest = restDay();
    app.settings.continueAfterId = rest?.id || "";
    app.settings.continueAfterDay = logic.todayISO();
    db.saveSettings(app.settings);
    render();
  }
  if (action === "calm") {
    app.calmKind = btn.dataset.kind;
    app.calming = true;
    render();
  }
  if (action === "close-calm") {
    app.calming = false;
    render();
  }
  if (action === "present") markPresent(btn.dataset.id, btn.dataset.title);
  if (action === "close-q") {
    const q = app.state.questions.find((item) => item.id === btn.dataset.id);
    if (q) q.status = "closed";
    scheduleSave();
    render();
  }
  if (action === "finish-journal") finishJournal(btn.dataset.id);
  if (action === "finish-ack") finishAck(btn.dataset.id);
  if (action === "finish-ask") finishAsk(btn.dataset.id);
  if (action === "finish-reply") finishReply(btn.dataset.id, btn.dataset.mid);
  if (action === "save-setup") {
    rememberSetupFields();
    db.saveSettings(app.settings);
    if (app.settings.token && app.settings.passphrase) testAndSync();
    else render();
  }
  if (action === "test-connection") {
    rememberSetupFields();
    db.saveSettings(app.settings);
    testAndSync();
  }
  if (action === "finish-setup") {
    rememberSetupFields();
    app.settings.setupDone = true;
    db.saveSettings(app.settings);
    go("#/today");
    if (app.settings.token && app.settings.passphrase) testAndSync();
    else render();
  }
  if (action === "skip-setup") {
    app.settings.skipSync = true;
    app.settings.setupDone = true;
    db.saveSettings(app.settings);
    go("#/today");
    render();
  }
  if (action === "paste-link") {
    const raw = document.getElementById("setup-link")?.value || "";
    if (!applySetupLink(raw)) app.banner = "That link did not include a token and passphrase.";
    render();
  }
  if (action === "share-setup") shareSetup();
  if (action === "enable-notify") enableNotify();
  if (action === "plan-date" || action === "plan-next") planDate(btn);
  if (action === "add-photo") addPhoto(btn.dataset.on || logic.todayISO());
  if (action === "month") shiftMonth(Number(btn.dataset.dir));
  if (action === "add-celebration") addCelebration();
  if (action === "add-memory") addMemory(btn.dataset.year);
  if (action === "add-project") addProject();
  if (action === "add-aff") addAffirmation();
  if (action === "ready-aff") {
    for (const a of app.state.affirmations || []) if (a.text?.trim()) a.ready = true;
    const idx = logic.currentIndex(app.state, DAYS);
    if (DAYS[idx]) maybeComplete(DAYS[idx].id);
    scheduleSave();
    render();
  }
  if (action === "save-aff") {
    const a = app.state.affirmations.find((item) => item.id === btn.dataset.id);
    if (a) {
      a.saved = !a.saved;
      a.savedAt = Date.now();
    }
    scheduleSave();
    render();
  }
  if (action === "close-chapter") {
    const key = profile() === "tabby" ? "tabbyClosed" : "brandonClosed";
    app.state.closure[key] = Date.now();
    if (app.state.closure.tabbyClosed && app.state.closure.brandonClosed) {
      app.state.closure.closedAt = logic.todayISO();
      logic.ensureClosureMilestone(app.state);
    }
    const idx = logic.currentIndex(app.state, DAYS);
    if (DAYS[idx]) maybeComplete(DAYS[idx].id);
    scheduleSave();
    render();
  }
  if (action === "open-just") {
    app.justOpen = true;
    render();
  }
  if (action === "close-just") {
    app.justOpen = false;
    go("#/dates");
  }
  if (action === "ynm") {
    app.state.justUs.lists[btn.dataset.id] = app.state.justUs.lists[btn.dataset.id] || {};
    app.state.justUs.lists[btn.dataset.id][profile()] = btn.dataset.value;
    scheduleSave();
    render();
  }
  if (action === "work-night") {
    app.state.schedule.workNights[btn.dataset.dow] = btn.checked;
    app.state.schedule.updatedAt = Date.now();
    scheduleSave();
  }
  if (action === "save-shift") {
    app.state.schedule.shiftLabel = document.getElementById("shift-label")?.value || app.state.schedule.shiftLabel;
    app.state.schedule.updatedAt = Date.now();
    scheduleSave();
    render();
  }
  if (action === "save-secrets") saveSecrets();
  if (action === "save-sync-key") saveSyncKey();
  if (action === "save-passphrase") savePassphrase();
  if (action === "open-sync-key") openSyncKey();
  if (action === "clear-secrets") {
    app.settings.token = "";
    app.settings.passphrase = "";
    db.saveSettings(app.settings);
    render();
  }
  if (action === "sync") doSync();
  if (action === "copy-link") navigator.clipboard?.writeText(btn.dataset.link || pairLink());
  if (action === "add-more") addMore(btn.dataset.phase);
  if (action === "finish-add") {
    const seal = app.state.phaseSeals[btn.dataset.phase];
    const add = seal?.additions?.find((item) => item.id === btn.dataset.id);
    if (add?.text?.trim()) {
      add.finished = true;
      add.finishedAt = Date.now();
      add.updatedAt = Date.now();
      scheduleSave();
      render();
    }
  }
  if (action === "filter-set") {
    app.settingFilter = app.settingFilter === btn.dataset.id ? "" : btn.dataset.id;
    render();
  }
  if (action === "seal") {
    app.state.phaseSeals[btn.dataset.phase] = { sealedAt: Date.now(), additions: app.state.phaseSeals[btn.dataset.phase]?.additions || [] };
    maybeComplete(day);
    scheduleSave();
    render();
  }
}

function maybeComplete(dayId) {
  const def = DAYS.find((d) => d.id === dayId);
  if (!def) return;
  const rec = dayRec(dayId);
  if (def.sealsPhase && profile() === "tabby" && !app.state.phaseSeals[def.sealsPhase]?.sealedAt) {
    const ready = logic.turnState(def, rec, "tabby", { ...app.state, phaseSeals: { ...app.state.phaseSeals, [def.sealsPhase]: { sealedAt: 1 } } });
    if (ready.code === "your-turn" || ready.code === "done") {
      app.sheet = `<div class="sheet"><div class="panel"><h2>I’ve said everything on this for now</h2><p>You can add more later. It will not restart the chapter.</p><button class="primary full" type="button" data-action="seal" data-phase="${def.sealsPhase}" data-day="${dayId}">Yes, that’s everything for now</button><button class="ghost full" type="button" data-action="close-sheet">Not yet</button></div></div>`;
    }
  }
  if (logic.isDayComplete(rec, def, app.state) && !rec.completedAt) rec.completedAt = logic.todayISO();
}

function finishAnswer(day, who) {
  const rec = dayRec(day);
  const answer = rec[who];
  if (!answer?.text?.trim()) return;
  answer.finished = true;
  answer.finishedAt = Date.now();
  answer.updatedAt = Date.now();
  maybeComplete(day);
  scheduleSave();
  app.sheet = null;
  render();
}

function markPresent(id, title) {
  const today = logic.todayISO();
  app.state.presence[today] = { id, title, at: Date.now(), by: profile(), updatedAt: Date.now() };
  scheduleSave();
  render();
}

function ensureJournalDraft(id) {
  let entry = (app.state.journal || []).find((item) => item.id === id);
  if (!entry) {
    entry = { id: logic.newId("j"), by: profile(), text: "", share: false, visibility: "private", finished: false, at: Date.now(), updatedAt: Date.now() };
    app.state.journal.push(entry);
  }
  return entry;
}

function ensureAskDraft(id) {
  let q = (app.state.questions || []).find((item) => item.id === id);
  if (!q) {
    q = { id: logic.newId("q"), author: "tabby", text: "", aboutIncident: false, status: "draft", finished: false, at: Date.now(), updatedAt: Date.now(), thread: [] };
    app.state.questions.push(q);
  }
  return q;
}

function ensureReplyDraft(qid, mid) {
  const q = app.state.questions.find((item) => item.id === qid);
  if (!q) return { id: mid || logic.newId("m"), text: "" };
  q.thread = q.thread || [];
  let msg = q.thread.find((item) => item.id === mid && !item.finished);
  if (!msg) {
    msg = {
      id: logic.newId("m"),
      author: profile(),
      role: profile() === "brandon" ? "answer" : "followup",
      text: "",
      finished: false,
      at: Date.now(),
      updatedAt: Date.now(),
    };
    q.thread.push(msg);
  }
  return msg;
}

function finishJournal(id) {
  const entry = (app.state.journal || []).find((item) => item.id === id) || (app.state.journal || []).find((item) => (item.by || "tabby") === profile() && !item.finished);
  if (!entry?.text?.trim()) return;
  entry.finished = true;
  entry.finishedAt = Date.now();
  entry.updatedAt = Date.now();
  entry.visibility = entry.share ? "shared" : "private";
  scheduleSave();
  render();
}

function finishAck(id) {
  const entry = app.state.journal.find((item) => item.id === id);
  if (!entry?.ack?.text?.trim()) return;
  entry.ack.finished = true;
  entry.ack.finishedAt = Date.now();
  entry.ack.updatedAt = Date.now();
  entry.updatedAt = Date.now();
  scheduleSave();
  render();
}

function finishAsk(id) {
  const q = (app.state.questions || []).find((item) => item.id === id) || (app.state.questions || []).find((item) => !item.finished && (item.author || "tabby") === "tabby");
  if (!q?.text?.trim()) return;
  q.finished = true;
  q.finishedAt = Date.now();
  q.updatedAt = Date.now();
  q.status = "waiting";
  scheduleSave();
  render();
}

function finishReply(qid, mid) {
  const q = app.state.questions.find((item) => item.id === qid);
  const msg = q?.thread?.find((item) => item.id === mid) || q?.thread?.find((item) => item.author === profile() && !item.finished);
  if (!q || !msg?.text?.trim()) return;
  msg.finished = true;
  msg.finishedAt = Date.now();
  msg.updatedAt = Date.now();
  if (msg.role === "answer") q.status = "answered";
  q.updatedAt = Date.now();
  scheduleSave();
  render();
}

function planDate(btn) {
  const ideas = allIdeas(app.state.customIdeas);
  const length = btn.dataset.length;
  const from = btn.dataset.date || logic.todayISO();
  const slots = logic.nextFittingDates(app.state.schedule.workNights, from, length, 1);
  const date = btn.dataset.date || slots[0]?.iso || from;
  const idea = btn.dataset.idea;
  const leader = btn.dataset.leader || (Object.keys(app.state.datePlans).length % 2 === 0 ? "tabby" : "brandon");
  const found = ideaById(idea, app.state.customIdeas) || ideas.find((item) => item.length === length);
  app.state.datePlans[date] = {
    ideaId: found?.id || idea,
    leader,
    length: found?.length || length,
    title: found?.title || "A date",
    status: "planned",
    source: "planned",
    updatedAt: Date.now(),
    workbookDayId: DAYS.find((d) => d.kind === "date" && !Object.values(app.state.datePlans).some((p) => p.workbookDayId === d.id))?.id || null,
  };
  scheduleSave();
  render();
}

function addPhoto(on) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const blob = await compressImage(file);
    const id = logic.newId("photo");
    const caption = window.prompt("A short caption", "") || "";
    await db.savePhoto(id, { plain: blob });
    app.photoUrls[id] = URL.createObjectURL(blob);
    app.state.photos.push({ id, caption, by: profile(), at: Date.now(), updatedAt: Date.now(), on: on || logic.todayISO() });
    scheduleSave();
    render();
  };
  input.click();
}

async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  const max = 1280;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let quality = 0.72;
  let blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  while (blob && blob.size > 180000 && quality > 0.5) {
    quality -= 0.08;
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  }
  return blob;
}

function shiftMonth(dir) {
  const base = app.calMonth || logic.todayISO().slice(0, 7) + "-01";
  const [y, m] = base.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1 + dir, 1));
  app.calMonth = next.toISOString().slice(0, 10);
  render();
}

function addCelebration() {
  const title = window.prompt("What are you marking?");
  if (!title) return;
  const date = window.prompt("Date (YYYY-MM-DD)", logic.todayISO());
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const [year, month, day] = date.split("-").map(Number);
  app.state.celebrations.push({
    id: logic.newId("c"),
    title,
    month,
    day,
    year,
    annual: false,
    kind: "milestone",
    note: "",
    updatedAt: Date.now(),
  });
  scheduleSave();
  render();
}

function addMemory(year) {
  const text = window.prompt(`A memory from ${year}`);
  if (!text) return;
  app.state.timeline.push({ id: logic.newId("t"), year: Number(year), kind: "memory", text, by: profile(), at: Date.now(), updatedAt: Date.now() });
  scheduleSave();
  render();
}

function addProject() {
  const title = window.prompt("Project name");
  if (!title) return;
  const lane = window.prompt("Lane: now, next, or someday", "next");
  app.state.projects.push({ id: logic.newId("p"), title, lane: ["now", "next", "someday"].includes(lane) ? lane : "next", note: "", by: profile(), at: Date.now(), updatedAt: Date.now() });
  scheduleSave();
  render();
}

function addAffirmation() {
  const text = document.getElementById("aff-draft")?.value?.trim();
  if (!text) return;
  app.state.affirmations.push({ id: logic.newId("a"), text, at: Date.now(), updatedAt: Date.now(), ready: false, saved: false });
  scheduleSave();
  render();
}

function addMore(phase) {
  const text = window.prompt("Add a little more. It stays with this chapter.");
  if (!text) return;
  const seal = app.state.phaseSeals[phase] || { sealedAt: null, additions: [] };
  seal.additions = seal.additions || [];
  seal.additions.push({ id: logic.newId("add"), by: profile(), text, finished: false, at: Date.now(), updatedAt: Date.now() });
  app.state.phaseSeals[phase] = seal;
  scheduleSave();
  render();
}

function rememberSetupFields() {
  const tokenInput = document.getElementById("setup-token") || document.getElementById("token");
  const passInput = document.getElementById("setup-pass") || document.getElementById("pass");
  if (tokenInput) app.settings.token = sync.cleanToken(tokenInput.value);
  if (passInput) app.settings.passphrase = passInput.value;
  if (app.settings.token && app.settings.passphrase && profile() === "tabby") app.settings.setupDone = true;
}

async function saveSyncKey() {
  const token = sync.cleanToken(document.getElementById("sync-key")?.value || "");
  if (!token) {
    app.settings.lastSyncNote = "Paste the new sync key first.";
    db.saveSettings(app.settings);
    render();
    return;
  }
  app.settings.token = token;
  db.saveSettings(app.settings);
  await testAndSync();
}

function savePassphrase() {
  const value = document.getElementById("pass")?.value;
  if (value != null) app.settings.passphrase = value;
  db.saveSettings(app.settings);
  app.settings.lastSyncNote = "Passphrase saved on this phone.";
  render();
}

async function saveSecrets() {
  app.settings.token = sync.cleanToken(document.getElementById("token")?.value || "");
  app.settings.passphrase = document.getElementById("pass")?.value || "";
  db.saveSettings(app.settings);
  if (app.settings.token && app.settings.passphrase) await testAndSync();
  else {
    app.settings.lastSyncNote = "On this phone only";
    render();
  }
}

async function testAndSync() {
  app.settings.token = sync.cleanToken(app.settings.token);
  app.settings.lastSyncNote = "Testing GitHub…";
  db.saveSettings(app.settings);
  render();
  const result = await sync.testConnection(app.settings.token);
  app.settings.lastSyncNote = result.message;
  db.saveSettings(app.settings);
  if (!result.ok) {
    render();
    return;
  }
  if (!app.settings.passphrase) {
    app.settings.lastSyncNote = "Connected. Add the passphrase, then Test connection again to write the shared file.";
    db.saveSettings(app.settings);
    render();
    return;
  }
  await doSync();
}

async function doSync(opts = {}) {
  if (app.syncing) return;
  app.settings.token = sync.cleanToken(app.settings.token);
  if (!app.settings.token || !app.settings.passphrase) {
    app.settings.lastSyncNote = "On this phone only";
    db.saveSettings(app.settings);
    if (!opts.quiet) render();
    return;
  }
  app.syncing = true;
  app.settings.lastSyncNote = "Syncing…";
  const note = document.querySelector("[data-sync-note]");
  if (note) note.textContent = "Syncing…";
  if (!opts.quiet) render();
  try {
    let key = null;
    if (!app.settings.authorKey) {
      app.settings.authorKey = app.settings.journalKey || (await crypto.generateJournalKey());
      app.settings.journalKey = app.settings.authorKey;
    }
    const before = app.seenFinished || logic.visibleFinishedIds(app.state, profile());
    const local = logic.stripForeignDrafts(await crypto.sealForWire(app.state, app.settings.authorKey, profile()), profile());
    const transport = sync.githubTransport(sync.cleanToken(app.settings.token));
    const result = await sync.syncNow({
      localState: local,
      transport,
      encryptState: async (obj) => {
        const env = await crypto.encryptJson(obj, app.settings.passphrase, app.settings.salt || null);
        if (!app.settings.salt) app.settings.salt = env.salt;
        return env;
      },
      decryptState: async (env) => {
        if (!app.settings.salt) app.settings.salt = env.salt;
        return crypto.decryptJson(env, app.settings.passphrase);
      },
      photos: app.state.photos || [],
      photoStore: {
        getShas: db.loadPhotoShas,
        setSha: async (id, sha) => {
          const map = await db.loadPhotoShas();
          map[id] = sha;
          await db.savePhotoShas(map);
        },
        getCipher: async (id) => {
          const rec = (await db.loadPhoto(id)) || {};
          if (rec.cipher) return rec.cipher;
          if (!rec.plain || !app.settings.passphrase || !app.settings.salt) return null;
          const key = await crypto.deriveKey(app.settings.passphrase, crypto.b64ToBytes(app.settings.salt));
          const cipher = await crypto.encryptBytes(new Uint8Array(await rec.plain.arrayBuffer()), key);
          await db.savePhoto(id, { ...rec, cipher });
          return cipher;
        },
        setCipher: async (id, bytes) => {
          const prev = (await db.loadPhoto(id)) || {};
          await db.savePhoto(id, { ...prev, cipher: bytes });
        },
        setPlain: async (id, bytes) => {
          const prev = (await db.loadPhoto(id)) || {};
          await db.savePhoto(id, { ...prev, plain: new Blob([bytes], { type: "image/jpeg" }) });
        },
        decrypt: async (bytes) => {
          if (!key) {
            const salt = crypto.b64ToBytes(app.settings.salt);
            key = await crypto.deriveKey(app.settings.passphrase, salt);
          }
          return crypto.decryptBytes(bytes, key);
        },
      },
    });
    let next = await crypto.unsealForAuthor(logic.normalizeState(result.state), app.settings.authorKey, profile());
    next = logic.stripForeignDrafts(next, profile());
    if (!app.seenReady) {
      app.seenFinished = logic.visibleFinishedIds(next, profile());
      app.seenReady = true;
    } else {
      const notes = logic.describeNew(before, next, profile());
      app.seenFinished = logic.visibleFinishedIds(next, profile());
      if (notes[0]) {
        app.banner = notes[0];
        maybeNotify("Your turn", notes[0]);
      }
    }
    app.state = next;
    await db.saveState(app.state);
    app.settings.lastSyncAt = Date.now();
    const clock = new Date(app.settings.lastSyncAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const wrote = result.status === "created" ? "state.json created" : result.status === "synced" ? "state.json updated" : "already up to date";
    app.settings.lastSyncNote = `Synced · ${wrote} · ${clock}`;
  } catch (err) {
    app.settings.lastSyncNote = sync.explainSyncError(err);
  }
  app.syncing = false;
  db.saveSettings(app.settings);
  const typing = document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName);
  if (opts.quiet && typing) {
    const live = document.querySelector("[data-sync-note]");
    if (live) live.textContent = syncLabel();
    return;
  }
  render();
}

function applySetupLink(raw) {
  const hash = raw.includes("#") ? raw.slice(raw.indexOf("#") + 1) : raw.trim();
  const params = new URLSearchParams(hash);
  if (!params.get("t") || !params.get("p")) return false;
  app.settings.token = params.get("t");
  app.settings.passphrase = params.get("p");
  app.settings.profile = params.get("who") || profile() || "tabby";
  app.settings.setupDone = true;
  db.saveSettings(app.settings);
  history.replaceState(null, "", location.pathname + location.search + "#/today");
  return true;
}

async function shareSetup() {
  const link = pairLink();
  const text = `Tabby, open this once to set up Closer. Then you can delete this message.\n${link}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Closer", text });
      return;
    } catch {
      /* fall through to copy */
    }
  }
  await navigator.clipboard?.writeText(text);
  app.banner = "The setup message is copied. Paste it into a text.";
  render();
}

async function enableNotify() {
  if (!("Notification" in window)) return;
  const permission = await Notification.requestPermission();
  app.settings.notify = permission;
  db.saveSettings(app.settings);
}

function maybeNotify(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const installed = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (!installed && app.settings.notify !== "granted") return;
  navigator.serviceWorker?.ready
    .then((reg) => reg.showNotification(title, { body, icon: "icons/icon-192.png", tag: "closer-turn", renotify: true }))
    .catch(() => {
      try {
        new Notification(title, { body, tag: "closer-turn" });
      } catch {
        /* ignore */
      }
    });
}

function schedulePoll() {
  clearInterval(app.pollTimer);
  const hidden = document.visibilityState === "hidden";
  app.pollTimer = setInterval(() => {
    if (app.settings.token && app.settings.passphrase) doSync({ quiet: true });
  }, hidden ? 60000 : 30000);
}

document.body.addEventListener("click", (event) => {
  if (event.target.closest("[data-action='close-sheet']")) {
    app.sheet = null;
    render();
    return;
  }
  onClick(event);
});
document.body.addEventListener("input", onInput);
document.body.addEventListener("change", onInput);
window.addEventListener("hashchange", () => render());
document.addEventListener("visibilitychange", () => {
  schedulePoll();
  if (document.visibilityState === "visible" && app.settings.token) doSync({ quiet: true });
});
window.addEventListener("focus", () => {
  if (app.settings.token) doSync({ quiet: true });
});
window.addEventListener("pageshow", () => {
  if (app.settings.token) doSync({ quiet: true });
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

async function boot() {
  consumePair();
  const saved = await db.loadState();
  app.state = logic.normalizeState(saved);
  if (!app.state.schedule.startISO) app.state.schedule.startISO = logic.todayISO();
  await db.saveState(app.state);
  for (const photo of app.state.photos || []) {
    const rec = await db.loadPhoto(photo.id);
    if (rec?.plain) app.photoUrls[photo.id] = URL.createObjectURL(rec.plain);
  }
  if ((app.settings.token && app.settings.passphrase) || app.settings.skipSync) app.settings.setupDone = app.settings.setupDone || true;
  if (!app.settings.authorKey && app.settings.journalKey) app.settings.authorKey = app.settings.journalKey;
  if (profile() && !app.settings.authorKey) {
    app.settings.authorKey = await crypto.generateJournalKey();
    app.settings.journalKey = app.settings.authorKey;
    db.saveSettings(app.settings);
  }
  routeFromHash();
  await render();
  schedulePoll();
  if (app.settings.token && app.settings.passphrase) doSync({ quiet: true });
}

boot();
