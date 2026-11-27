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
    if (note) note.textContent = navigator.onLine ? "Saved on this phone" : "Saved here, offline";
  }, 350);
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
  const rest = !onboard && app.route === "today" && restDay();
  root.className = "app" + (onboard || rest || app.route === "rest" ? " solo" : "");
  root.innerHTML = onboard ? viewOnboard() : shell(await body());
  document.getElementById("splash")?.classList.add("hide");
}

function shell(inner) {
  if (app.route === "today" && restDay()) return inner;
  return `${topbar()}${inner}${nav()}${app.sheet || ""}${app.calming ? calmingOverlay() : ""}`;
}

function topbar() {
  const note = app.settings.lastSyncNote || "Saved on this phone";
  return `<header class="top"><div class="brand">Closer</div><div class="sync-note" data-sync-note>${esc(note)}</div></header>`;
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
    .map(
      ([id, label]) =>
        `<button type="button" data-go="#/${id}" class="${app.route === id ? "on" : ""}">${label}</button>`
    )
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

function answerEditor(dayId, who, answer, label, starters) {
  const mine = profile() === who;
  const view = logic.answerView(answer, profile(), who);
  if (!mine && view.state !== "visible") {
    const text = view.state === "private" || view.state === "hidden" ? "Still private. You will see this when it is marked finished." : "Nothing here yet.";
    return `<div class="note"><strong>${esc(label)}</strong><p>${text}</p></div>`;
  }
  if (!mine && view.state === "visible") return `<div class="note"><strong>${esc(label)}</strong><p>${nl(view.text)}</p></div>`;
  const done = answer?.finished;
  return `<label><strong>${esc(label)}</strong>
    <textarea data-save="answer" data-day="${dayId}" data-who="${who}" ${done ? "readonly" : ""}>${esc(answer?.text || "")}</textarea>
  </label>
  ${done ? "" : `<div class="chips">${(starters || []).map((s) => `<button type="button" class="chip" data-action="starter" data-day="${dayId}" data-who="${who}">${esc(s)}</button>`).join("")}</div>
  <p class="quiet small">${who === "tabby" ? "This stays private until you mark it finished." : "A shape that helps: what you heard, why it makes sense, your part, what you want her to know."}</p>
  <button class="primary" type="button" data-action="finish" data-day="${dayId}" data-who="${who}">${who === "tabby" ? "I’ve finished — Brandon may read this" : "Ready for Tabby"}</button>`}`;
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
        <textarea data-save="part" data-day="${def.id}" data-part="${part.id}" ${done ? "readonly" : ""}>${esc(answer?.text || "")}</textarea></label>
        ${done ? "" : `<button class="primary" type="button" data-action="finish-part" data-day="${def.id}" data-part="${part.id}">I’ve finished this part</button>`}`;
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
    ? `<div class="note"><p><strong>Helping.</strong> ${nl(mine.helping)}</p><p><strong>Criticism.</strong> ${nl(mine.criticism)}</p></div>`
    : `<label>Your helping version<textarea data-save="ex" data-day="${def.id}" data-field="helping">${esc(mine.helping || "")}</textarea></label>
       <label>Your criticism version<textarea data-save="ex" data-day="${def.id}" data-field="criticism">${esc(mine.criticism || "")}</textarea></label>
       <button class="primary" type="button" data-action="finish-ex" data-day="${def.id}">Share my versions</button>`;
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
  return `<div class="view"><button class="text-btn" type="button" data-go="#/path">Back</button><h1>${esc(def.title)}</h1>${verseCard(def)}<div class="card">${readAnswers(def, rec)}</div><button class="ghost" type="button" data-action="add-more" data-phase="${def.phase}">Add more later</button></div>`;
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
  const list = [...(app.state.questions || [])].reverse();
  const form =
    profile() === "tabby"
      ? `<div class="card"><label>Ask anything<textarea id="ask-text" placeholder="What I still need to know is…"></textarea></label>
      <label class="check"><input id="ask-incident" type="checkbox"> <span>This is about the incident</span></label>
      <button class="primary" type="button" data-action="ask">Send to Brandon</button></div>`
      : `<p class="quiet">Questions from Tabby land here. Answer honestly. She can follow up.</p>`;
  const rows = list
    .map(
      (q) =>
        `<button class="list-btn" type="button" data-go="#/ask/${q.id}"><strong>${esc(q.text)}</strong><br><small>${esc(q.status)}${q.aboutIncident ? " · incident" : ""}</small></button>`
    )
    .join("");
  return `<div class="view"><h1>Ask Brandon</h1><p class="quiet">This stays outside the daily step. Nothing here is lost, and nothing restarts the path.</p>${form}${rows || `<div class="card"><p>No questions yet.</p></div>`}</div>`;
}

function viewThread(id) {
  const q = (app.state.questions || []).find((item) => item.id === id);
  if (!q) return `<div class="view"><p>That question is not here.</p></div>`;
  const thread = (q.thread || [])
    .map((m) => `<div class="note"><strong>${m.role === "answer" ? "Brandon" : "Tabby"}</strong><p>${nl(m.text)}</p></div>`)
    .join("");
  const box =
    profile() === "brandon" && q.status !== "closed"
      ? `<textarea id="reply-text" placeholder="The honest answer is…"></textarea><button class="primary" type="button" data-action="reply" data-id="${q.id}">Send this answer</button>`
      : profile() === "tabby" && q.status !== "closed"
        ? `<textarea id="reply-text" placeholder="A follow-up, if you want one"></textarea><button class="soft" type="button" data-action="follow" data-id="${q.id}">Add a follow-up</button><button class="ghost" type="button" data-action="close-q" data-id="${q.id}">This feels answered</button>`
        : "";
  return `<div class="view"><button class="text-btn" type="button" data-go="#/ask">All questions</button><h1>${esc(q.text)}</h1>${thread}${box}</div>`;
}

function viewJournal() {
  const mine = profile() === "tabby";
  const entries = (app.state.journal || []).filter((e) => !e.removed && (mine || e.visibility === "shared") && !(e.private && !mine));
  const form = mine
    ? `<div class="card"><label>Get it all out<textarea id="journal-text"></textarea></label>
      <label class="check"><input id="journal-share" type="checkbox"> <span>Share this one with Brandon</span></label>
      <p class="quiet small">Left alone, it stays private on your phone and in the encrypted backup only you can open.</p>
      <button class="primary" type="button" data-action="journal">Save entry</button></div>`
    : `<p class="quiet">Shared entries only. You can acknowledge them. This is not a place to defend.</p>`;
  const rows = entries
    .map((e) => {
      const text = e.text || (e.locked ? "This private entry needs the backup code in Settings." : e.visibility === "private" ? "" : "");
      if (!mine && e.visibility !== "shared") return "";
      if (!text && e.visibility === "private") return "";
      return `<article class="card"><p class="small quiet">${e.visibility === "private" ? "Private" : "Shared"}</p><p>${nl(text)}</p>${
        !mine && e.visibility === "shared"
          ? `<textarea data-ack="${e.id}" placeholder="I hear you. I’m not here to correct this.">${esc(e.ack?.text || "")}</textarea><button class="soft" type="button" data-action="ack-journal" data-id="${e.id}">Leave an acknowledgment</button>`
          : e.ack?.text
            ? `<div class="note"><strong>Brandon</strong><p>${nl(e.ack.text)}</p></div>`
            : ""
      }</article>`;
    })
    .join("");
  return `<div class="view"><h1>Open journal</h1>${form}${rows || `<p class="quiet">Nothing here yet. A few honest sentences are enough.</p>`}</div>`;
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
    <div class="card"><p class="kicker">This phone</p>
      <button class="ghost" type="button" data-profile="tabby">I’m Tabby</button>
      <button class="ghost" type="button" data-profile="brandon">I’m Brandon</button>
    </div>
    <div class="card"><p class="kicker">Work nights</p><p class="quiet">Brandon works weekend nights at GE Aerospace, about a 36-hour week, sometimes overtime. Micro-dates land before those shifts. Bigger dates move to nights off.</p>${toggles}
      <label>What to call the shift<input id="shift-label" type="text" value="${esc(app.state.schedule.shiftLabel || "")}"></label>
      <button class="soft" type="button" data-action="save-shift">Save schedule</button></div>
    <div class="card"><p class="kicker">Sync</p>
      <label>GitHub token<input id="token" type="password" autocomplete="off" value="${esc(app.settings.token || "")}"></label>
      <label>Shared passphrase<input id="pass" type="password" autocomplete="off" value="${esc(app.settings.passphrase || "")}"></label>
      <p class="quiet small">The token and passphrase stay on this phone. The private repo only holds scrambled text.</p>
      <button class="primary" type="button" data-action="save-secrets">Save</button>
      <button class="ghost" type="button" data-action="sync">Sync now</button>
      <button class="text-btn" type="button" data-action="clear-secrets">Clear token and passphrase</button>
      <p class="quiet" data-sync-note>${esc(app.settings.lastSyncNote || "")}</p>
    </div>
    ${profile() === "tabby" && app.settings.journalKey ? `<div class="card"><p class="kicker">Private journal backup</p><p class="small">Keep this somewhere only you have. It opens private entries on a new phone.</p><p style="word-break:break-all">${esc(app.settings.journalKey)}</p></div>` : ""}
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
    return `<div class="view"><h1>Pair Tabby’s phone</h1><p>Add the token and passphrase in Settings first. Then come back. The link keeps those secrets in the hidden part of the address, not the part servers store.</p></div>`;
  }
  const link = pairLink();
  let qr = "";
  try {
    const maker = qrcode(0, "M");
    maker.addData(link);
    maker.make();
    qr = maker.createSvgTag({ cellSize: 4, margin: 2 });
  } catch {
    qr = "";
  }
  return `<div class="view"><h1>Pair Tabby’s phone</h1><p>Open this on her phone while you are together. The app will save the setup and then clear it from the address bar.</p>
    <div class="card">${qr}</div>
    <p class="small" style="word-break:break-all">${esc(link)}</p>
    <button class="primary" type="button" data-action="copy-link" data-link="${esc(link)}">Copy link</button>
    <p class="quiet">In the same room is gentler than a text message.</p></div>`;
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
  if (el.dataset.save === "budget") {
    app.state.budget.limit = el.value;
    app.state.budget.updatedAt = Date.now();
    app.state.budget.updatedBy = profile();
    scheduleSave();
  }
}

async function chooseProfile(name) {
  app.settings.profile = name;
  if (name === "tabby" && !app.settings.journalKey) app.settings.journalKey = await crypto.generateJournalKey();
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
  if (action === "ask") addQuestion();
  if (action === "reply" || action === "follow") addThread(btn.dataset.id, action);
  if (action === "close-q") {
    const q = app.state.questions.find((item) => item.id === btn.dataset.id);
    if (q) q.status = "closed";
    scheduleSave();
    render();
  }
  if (action === "journal") addJournal();
  if (action === "ack-journal") {
    const entry = app.state.journal.find((item) => item.id === btn.dataset.id);
    const text = document.querySelector(`[data-ack="${btn.dataset.id}"]`)?.value || "";
    if (entry && text.trim()) entry.ack = { text, at: Date.now() };
    scheduleSave();
    render();
  }
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
  if (action === "clear-secrets") {
    app.settings.token = "";
    app.settings.passphrase = "";
    db.saveSettings(app.settings);
    render();
  }
  if (action === "sync") doSync();
  if (action === "copy-link") navigator.clipboard?.writeText(btn.dataset.link || pairLink());
  if (action === "add-more") addMore(btn.dataset.phase);
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

function addQuestion() {
  const text = document.getElementById("ask-text")?.value?.trim();
  if (!text) return;
  app.state.questions.push({
    id: logic.newId("q"),
    text,
    at: Date.now(),
    aboutIncident: !!document.getElementById("ask-incident")?.checked,
    status: "waiting",
    updatedAt: Date.now(),
    thread: [],
  });
  scheduleSave();
  render();
}

function addThread(id, action) {
  const q = app.state.questions.find((item) => item.id === id);
  const text = document.getElementById("reply-text")?.value?.trim();
  if (!q || !text) return;
  q.thread = q.thread || [];
  q.thread.push({ id: logic.newId("m"), role: action === "reply" ? "answer" : "followup", text, at: Date.now(), updatedAt: Date.now() });
  q.status = action === "reply" ? "answered" : q.status;
  q.updatedAt = Date.now();
  scheduleSave();
  render();
}

function addJournal() {
  const text = document.getElementById("journal-text")?.value?.trim();
  if (!text) return;
  const share = !!document.getElementById("journal-share")?.checked;
  app.state.journal.push({
    id: logic.newId("j"),
    text,
    visibility: share ? "shared" : "private",
    at: Date.now(),
    updatedAt: Date.now(),
  });
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
  seal.additions.push({ id: logic.newId("add"), text, at: Date.now(), updatedAt: Date.now() });
  app.state.phaseSeals[phase] = seal;
  scheduleSave();
  render();
}

async function saveSecrets() {
  app.settings.token = document.getElementById("token")?.value?.trim() || "";
  app.settings.passphrase = document.getElementById("pass")?.value || "";
  db.saveSettings(app.settings);
  app.settings.lastSyncNote = "Saved on this phone";
  render();
}

async function doSync() {
  if (!app.settings.token || !app.settings.passphrase) {
    app.settings.lastSyncNote = "Add a token and passphrase to sync.";
    db.saveSettings(app.settings);
    render();
    return;
  }
  app.settings.lastSyncNote = "Syncing…";
  render();
  try {
    let key = null;
    const transport = sync.githubTransport(app.settings.token);
    const local = profile() === "tabby" ? await crypto.sealForWire(app.state, app.settings.journalKey) : app.state;
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
    app.state = profile() === "tabby" ? await crypto.unsealForTabby(logic.normalizeState(result.state), app.settings.journalKey) : logic.normalizeState(result.state);
    await db.saveState(app.state);
    app.settings.lastSyncAt = Date.now();
    app.settings.lastSyncNote = result.status === "up-to-date" ? "Already up to date" : "Synced";
  } catch (err) {
    app.settings.lastSyncNote = err.code === "passphrase" ? err.message : "Saved on this phone. Sync will try again when it can.";
  }
  db.saveSettings(app.settings);
  render();
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
  if (document.visibilityState === "visible" && app.settings.token) doSync();
});
setInterval(() => {
  if (document.visibilityState === "visible" && app.settings.token) doSync();
}, 45000);

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
  routeFromHash();
  await render();
}

boot();
