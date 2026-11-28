import puppeteer from "puppeteer-core";
import { DAYS } from "../js/program.js";
import { normalizeState, todayISO } from "../js/logic.js";

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

async function shot(name) {
  await new Promise((r) => setTimeout(r, 350));
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png` });
  console.log("saved", name);
}

await page.goto("http://127.0.0.1:8765/", { waitUntil: "networkidle0" });
await shot("onboarding");

await page.click("[data-profile='tabby']");
await page.waitForSelector("h1");
await shot("today");

const incident = DAYS.find((d) => d.covers?.includes("incident-what-happened"));
const state = normalizeState({ schedule: { startISO: todayISO(), updatedAt: 1 } });
for (const def of DAYS) {
  if (def.index >= incident.index) break;
  const rec = { paused: false };
  if (def.kind === "break") rec.ack = { tabby: 1, brandon: 1 };
  else if (def.kind === "agreements") {
    rec.accepts = { tabby: {}, brandon: {} };
    for (const id of def.ruleIds) {
      rec.accepts.tabby[id] = true;
      rec.accepts.brandon[id] = true;
    }
    rec.tabby = { text: "These are enough for me.", finished: true, updatedAt: 2 };
    rec.brandon = { text: "I can keep these.", finished: true, updatedAt: 2 };
  } else if (def.kind === "exercise") {
    rec.exercise = {
      tabby: { helping: "Can we look at the total together?", criticism: "You always do this.", finished: true, updatedAt: 2 },
      brandon: { helping: "I felt a jolt. Can we choose the next step?", criticism: "You never listen.", finished: true, updatedAt: 2 },
      ratings: {
        tabby: { helping: "supported", criticism: "judged", updatedAt: 3 },
        brandon: { helping: "supported", criticism: "judged", updatedAt: 3 },
      },
    };
  } else {
    rec.tabby = { text: "A true sentence, kept.", finished: true, updatedAt: 2 };
    rec.brandon = { text: "What I hear you saying is that this matters. My part is to stay.", finished: true, updatedAt: 3 };
  }
  if (def.sealsPhase) state.phaseSeals[def.sealsPhase] = { sealedAt: Date.now(), additions: [] };
  rec.completedAt = "2026-11-20";
  state.days[def.id] = rec;
}
state.questions = [
  {
    id: "q1",
    text: "When that week comes back, what do you wish you had said to me then?",
    aboutIncident: true,
    status: "waiting",
    at: Date.now(),
    updatedAt: Date.now(),
    thread: [],
  },
];
state.journal = [
  {
    id: "j1",
    text: "I am writing this while it is still only mine. I do not have to make it fair.",
    visibility: "private",
    at: Date.now(),
    updatedAt: Date.now(),
  },
];
state.datePlans["2026-11-30"] = {
  ideaId: "keowee",
  leader: "tabby",
  length: "day",
  title: "Lake Keowee shoreline",
  status: "planned",
  source: "planned",
  updatedAt: Date.now(),
};
state.presence[todayISO()] = { id: "meal", title: "A phone-free meal", at: Date.now(), updatedAt: Date.now(), by: "tabby" };

await page.evaluate(async (saved) => {
  await new Promise((resolve, reject) => {
    const req = indexedDB.open("closer", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos");
    };
    req.onsuccess = () => {
      const tx = req.result.transaction("kv", "readwrite");
      tx.objectStore("kv").put(saved, "state");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}, state);

await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector("h1");
await shot("incident");

await page.goto("http://127.0.0.1:8765/#/path", { waitUntil: "networkidle0" });
await page.waitForSelector("#phase-incident");
await page.evaluate(() => document.getElementById("phase-incident")?.scrollIntoView({ block: "start" }));
await shot("incident_arc");

await page.goto("http://127.0.0.1:8765/#/ask", { waitUntil: "networkidle0" });
await shot("ask_brandon");

await page.goto("http://127.0.0.1:8765/#/journal", { waitUntil: "networkidle0" });
await shot("journal");

await page.goto("http://127.0.0.1:8765/#/dates", { waitUntil: "networkidle0" });
await shot("date_nights");

await page.goto("http://127.0.0.1:8765/#/calendar", { waitUntil: "networkidle0" });
await shot("calendar");

await page.evaluate(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 640, 480);
  g.addColorStop(0, "#f3d5c4");
  g.addColorStop(1, "#8eaf98");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 640, 480);
  ctx.fillStyle = "#2c2420";
  ctx.font = "32px serif";
  ctx.fillText("Lake afternoon", 40, 420);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  await new Promise((resolve, reject) => {
    const req = indexedDB.open("closer", 1);
    req.onsuccess = () => {
      const tx = req.result.transaction(["kv", "photos"], "readwrite");
      tx.objectStore("photos").put({ plain: blob }, "photo-sample");
      const get = tx.objectStore("kv").get("state");
      get.onsuccess = () => {
        const st = get.result;
        st.photos = st.photos || [];
        st.photos.push({ id: "photo-sample", caption: "Lake afternoon", by: "tabby", at: Date.now(), updatedAt: Date.now(), on: "2026-11-21" });
        tx.objectStore("kv").put(st, "state");
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    };
  });
});
await page.reload({ waitUntil: "networkidle0" });
await page.goto("http://127.0.0.1:8765/#/album", { waitUntil: "networkidle0" });
await shot("photos");

console.log("errors", errors);
await browser.close();
