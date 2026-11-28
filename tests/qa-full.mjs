/**
 * Full Android Chrome pass. Run before every deploy:
 *   node tests/qa-full.mjs samsung
 *   node tests/qa-full.mjs pixel
 * Real taps, two phones, offline, and the whole 56-step path.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium, devices } from "playwright-core";
import { generateJournalKey } from "../js/crypto.js";

const target = process.argv[2] === "pixel" ? "pixel" : "samsung";
const deviceName = target === "pixel" ? "Pixel 5" : "Galaxy S9+";
const root = new URL("..", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const port = target === "pixel" ? 8792 : 8791;
const bugs = [];
let checks = 0;

function check(ok, message) {
  checks += 1;
  if (!ok) bugs.push(message);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/seed.html") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><body><script>
      const names = ["closer-v8","closer-v9","closer-v10","closer-v11"];
      Promise.all(names.map((name) => caches.open(name).then((cache) => cache.put("./old-" + name, new Response("old"))))).then(() => {
        const open = indexedDB.open("closer", 1);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
          if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos");
        };
        localStorage.setItem("closer.settings", JSON.stringify({ profile: "tabby", setupDone: true, skipSync: true, seenGuide: true, authorKey: "old-key", journalKey: "old-key" }));
        open.onsuccess = () => {
          const rules = ["finish","private","own","pause","score","heat"];
          const accepts = {};
          for (const who of ["tabby","brandon"]) {
            accepts[who] = {};
            for (const id of rules) accepts[who][id] = { on: true, updatedAt: 5 };
          }
          const tx = open.result.transaction("kv", "readwrite");
          tx.objectStore("kv").put({
            v: 1,
            days: { w1d1: {
              tabby: { text: "kept from an older phone", finished: true, updatedAt: 5 },
              brandon: { text: "also kept", finished: true, updatedAt: 5 },
              accepts, completedAt: "2026-11-20"
            } }
          }, "state");
          tx.oncomplete = () => { document.body.dataset.ready = "1"; };
        };
      });
    </script></body>`);
    return;
  }
  const file = join(root, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
  try {
    const buf = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end("missing");
  }
});
await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

const files = new Map([["README.md", { sha: "readme", b64: Buffer.from("Closer data\n").toString("base64") }]]);
let seq = 1;
async function handle(route) {
  const req = route.request();
  const url = new URL(req.url());
  if (req.method() === "GET" && url.pathname === "/repos/Btcombo1/closer-data") return route.fulfill({ json: { default_branch: "main", private: true } });
  const match = url.pathname.match(/\/contents\/(.+)$/);
  const name = match ? decodeURIComponent(match[1]) : "";
  if (!name) return route.fulfill({ status: 404, json: { message: "Not Found" } });
  if (req.method() === "GET") {
    const item = files.get(name);
    if (!item) return route.fulfill({ status: 404, json: { message: "Not Found" } });
    return route.fulfill({ json: { sha: item.sha, content: item.b64, encoding: "base64" } });
  }
  if (req.method() === "PUT") {
    const body = JSON.parse(req.postData() || "{}");
    const sha = `sha-${seq++}`;
    files.set(name, { sha, b64: body.content });
    return route.fulfill({ json: { content: { sha }, commit: { sha } } });
  }
  return route.fulfill({ status: 404, json: { message: "Not Found" } });
}

function chromePath() {
  for (const path of ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]) {
    if (existsSync(path)) return path;
  }
  return undefined;
}
const executablePath = chromePath();
const browser = await chromium.launch(executablePath ? { executablePath, headless: true } : { headless: true });
const origin = `http://127.0.0.1:${port}`;
const token = "github_pat_qafull123456789";
const passphrase = "shared-secret-passphrase";

function watch(page, who) {
  page.on("pageerror", (err) => bugs.push(`${who} page error: ${err}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/Failed to load resource|status of 404|net::ERR/i.test(text)) return;
    bugs.push(`${who} console: ${text}`);
  });
}

async function phone(profile, { guide = false, hash = "#/today" } = {}) {
  const key = await generateJournalKey();
  const context = await browser.newContext({ ...devices[deviceName], serviceWorkers: "block" });
  await context.route("https://api.github.com/**", handle);
  await context.addInitScript((saved) => {
    if (!localStorage.getItem("closer.settings")) localStorage.setItem("closer.settings", JSON.stringify(saved));
  }, {
    profile, token, passphrase, setupDone: true, authorKey: key, journalKey: key,
    seenGuide: !guide,
  });
  const page = await context.newPage();
  watch(page, profile);
  await page.goto(`${origin}/${hash}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#app h1");
  return { context, page, profile };
}

async function press(locator) {
  const el = locator.first();
  await el.evaluate((node) => node.scrollIntoView({ block: "center" }));
  try {
    await el.tap({ timeout: 2500 });
  } catch (err) {
    const point = await el.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await el.page().touchscreen.tap(point.x, point.y);
    if (!press.logged) {
      press.logged = true;
      console.error("tap needed a coordinate fallback:", String(err).split("\n").slice(0, 6).join(" | "));
    }
  }
}

async function sync(page) {
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  const started = Date.now();
  let last = "";
  while (Date.now() - started < 20000) {
    last = await page.locator("[data-sync-note]").first().evaluate((el) => el.textContent || "").catch(() => "");
    if (last.startsWith("Synced")) return;
    if (/^(401|403|404)/.test(last)) throw new Error(last);
    await page.waitForTimeout(100);
  }
  throw new Error(`sync timeout ${last}`);
}

async function text(page) {
  return page.locator("#app").innerText();
}

async function tapTargets(page, where) {
  const bad = await page.locator("button, a, label.check").evaluateAll((els) => els.flatMap((el) => {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return [];
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return [];
    const nav = 88;
    if (rect.top < 0 || rect.bottom > window.innerHeight - nav) return [];
    const small = Math.round(rect.width) < 44 || Math.round(rect.height) < 44;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const top = document.elementFromPoint(cx, cy);
    const covered = !!(top && top !== el && !el.contains(top) && !top.contains(el));
    if (!small && !covered) return [];
    return [{ text: (el.innerText || el.getAttribute("data-action") || "").replace(/\s+/g, " ").slice(0, 40), w: Math.round(rect.width), h: Math.round(rect.height), covered }];
  }));
  check(bad.length === 0, `${where} tap targets ${JSON.stringify(bad.slice(0, 6))}`);
}

async function act(person) {
  const page = person.page;
  if (await page.locator(".sheet [data-action='seal']").count()) {
    await press(page.locator(".sheet [data-action='seal']"));
    return "seal";
  }
  if (await page.locator("[data-action='continue']").count()) {
    await press(page.locator("[data-action='continue']"));
    return "continue";
  }
  const rules = page.locator("button.rule");
  const count = await rules.count();
  for (let i = 0; i < count; i++) {
    const pressed = await rules.nth(i).getAttribute("aria-pressed", { timeout: 1500 }).catch(() => null);
    if (pressed === null) return "wait";
    if (pressed !== "true") {
      await rules.nth(i).tap();
      return "check";
    }
  }
  for (const field of ["helping", "criticism"]) {
    const choice = page.locator(`[data-action='rate'][data-field='${field}'][data-value='supported']`);
    if (await choice.count() && !(await choice.first().innerText()).includes("✓")) {
      await press(choice);
      return "rate";
    }
  }
  if (person.profile === "brandon" && await page.locator("#aff-draft").count()) {
    await page.locator("#aff-draft").fill("You are steady and kind, and this family is loved because of you.");
    await press(page.locator("[data-action='add-aff']"));
    await press(page.locator("[data-action='ready-aff']"));
    return "affirm";
  }
  const areas = page.locator("textarea[data-save='answer'], textarea[data-save='part'], textarea[data-save='ex'], textarea[data-save='closure']");
  const areaCount = await areas.count();
  for (let i = 0; i < areaCount; i++) {
    const area = areas.nth(i);
    if (!(await area.inputValue()).trim()) {
      await area.fill(`Something true from ${person.profile}, said with care. `.repeat(8).slice(0, 240));
      return "type";
    }
  }
  const finish = page.locator("[data-action='finish'], [data-action='finish-part'], [data-action='finish-ex']");
  if (await finish.count()) {
    await press(finish);
    return "finish";
  }
  if (await page.locator("[data-action='ack']").count()) {
    await press(page.locator("[data-action='ack']"));
    return "ack";
  }
  if (await page.locator("[data-action='close-chapter']").count()) {
    await press(page.locator("[data-action='close-chapter']"));
    return "close";
  }
  if (await page.locator("[data-action='seal']").count()) {
    await press(page.locator("[data-action='seal']"));
    return "seal";
  }
  if ((await text(page)).includes("You kept the whole path")) return "done";
  return "wait";
}

try {
  const up = await browser.newContext({ ...devices[deviceName] });
  const upPage = await up.newPage();
  watch(upPage, "upgrade");
  await upPage.goto(`${origin}/seed.html`);
  await upPage.waitForFunction(() => document.body.dataset.ready === "1");
  await upPage.goto(`${origin}/#/path/w1d1`, { waitUntil: "domcontentloaded" });
  await upPage.waitForSelector("#app h1");
  await upPage.waitForTimeout(1500);
  const keptOld = await text(upPage);
  check(keptOld.includes("kept from an older phone"), "older saved words were wiped on upgrade");
  const keys = await upPage.evaluate(async () => caches.keys());
  check(keys.includes("closer-v12"), `v12 cache missing (${keys.join(",")})`);
  check(!keys.some((name) => ["closer-v8", "closer-v9", "closer-v10", "closer-v11"].includes(name)), `stale cache kept (${keys.join(",")})`);
  await up.close();

  const guide = await phone("tabby", { guide: true });
  check((await guide.page.locator("#app h1").innerText()) === "One step at a time", "guide did not open");
  await press(guide.page.locator("[data-action='guide-next']"));
  await press(guide.page.locator("[data-action='guide-next']"));
  await press(guide.page.locator("[data-action='guide-next']"));
  check((await guide.page.locator("#app h1").innerText()) !== "You can stop", "guide did not finish");
  await guide.context.close();

  const tabby = await phone("tabby");
  const brandon = await phone("brandon");
  for (const person of [tabby, brandon]) {
    person.page.on("dialog", (dialog) => {
      const msg = dialog.message().toLowerCase();
      dialog.accept(msg.includes("lane") ? "next" : "A note from the test");
    });
  }
  await sync(tabby.page);
  await sync(brandon.page);

  await tabby.page.goto(`${origin}/?preview-update=1#/today`);
  await tabby.page.waitForSelector("[data-action='update-now']");
  check((await tabby.page.locator("[data-action='update-now']").innerText()).includes("Update now"), "Update now banner missing");
  await press(tabby.page.locator("[data-action='update-now']"));
  await tabby.page.waitForSelector("#app h1");

  const screens = [
    ["#/today", "Today"],
    ["#/path", "The path"],
    ["#/dates", "Date nights"],
    ["#/words", "Words"],
    ["#/journal", "Open journal"],
    ["#/ask", "Ask Brandon"],
    ["#/presence", "Be present"],
    ["#/calendar", ""],
    ["#/album", "Album"],
    ["#/timeline", "Our story"],
    ["#/projects", "One project at a time"],
    ["#/keepsake", "Keepsake"],
    ["#/just", "Just Us"],
    ["#/goals", "Goals"],
    ["#/about", "About Closer"],
    ["#/settings", "Settings"],
    ["#/pair", "Pair"],
    ["#/more", "More"],
  ];
  for (const [hash, heading] of screens) {
    await tabby.page.goto(`${origin}/${hash}`);
    await tabby.page.waitForSelector("#app h1");
    const body = await text(tabby.page);
    if (heading) check(body.includes(heading), `${hash} missing ${heading}`);
    check(!/same room|sit together|go be together|read aloud/i.test(body), `${hash} asks them to be together`);
    await tapTargets(tabby.page, hash);
  }
  await tabby.page.goto(`${origin}/#/settings`);
  check((await text(tabby.page)).includes("Version 12"), "Settings does not say Version 12");
  await tabby.page.goto(`${origin}/#/about`);
  check(/counselor/i.test(await text(tabby.page)), "counselor note missing");

  await tabby.page.goto(`${origin}/#/settings`);
  await press(tabby.page.locator("[data-profile='brandon']"));
  check((await tabby.page.evaluate(() => JSON.parse(localStorage.getItem("closer.settings")).profile)) === "brandon", "who-am-I did not switch");
  await tabby.page.goto(`${origin}/#/settings`);
  await press(tabby.page.locator("[data-profile='tabby']"));

  await tabby.page.goto(`${origin}/#/projects`);
  await press(tabby.page.locator("[data-action='add-project']"));
  check((await text(tabby.page)).includes("A note from the test"), "project was not added");

  await tabby.page.goto(`${origin}/#/today`);
  if (await tabby.page.locator("[data-action='pause']").count()) {
    await press(tabby.page.locator("[data-action='pause']"));
    check((await text(tabby.page)).includes("paused"), "pause did nothing");
    await press(tabby.page.locator("[data-action='resume']"));
  }

  await tabby.page.goto(`${origin}/#/calendar`);
  await press(tabby.page.locator("[data-action='open-add']"));
  await tabby.page.locator("#event-title").focus();
  await tabby.page.locator("#event-title").fill("School pickup");
  await tabby.page.locator("#event-date").fill("2026-12-08");
  await tabby.page.locator("#event-time").fill("15:00");
  await tabby.page.locator("#event-note").fill("A long note ".repeat(40));
  await press(tabby.page.locator("[data-action='save-event']"));
  await tabby.page.goto(`${origin}/#/calendar/2026-12-08`);
  check((await text(tabby.page)).includes("School pickup"), "calendar add failed");
  check((await text(tabby.page)).includes("15:00"), "calendar time failed");
  await press(tabby.page.locator("[data-action='edit-event']"));
  await tabby.page.locator("#event-title").fill("School pickup edited");
  await press(tabby.page.locator("[data-action='save-event']"));
  check((await text(tabby.page)).includes("School pickup edited"), "calendar edit failed");
  await press(tabby.page.locator("[data-action='delete-event']"));
  check(!(await text(tabby.page)).includes("School pickup edited"), "calendar delete failed");

  await tabby.page.goto(`${origin}/#/calendar`);
  await press(tabby.page.locator("[data-action='open-shift']"));
  await press(tabby.page.locator("[data-action='shift-day'][data-dow='5']"));
  await tabby.page.locator("#shift-start").fill("07:00");
  await tabby.page.locator("#shift-end").fill("19:00");
  await press(tabby.page.locator("[data-action='save-shift']"));
  check((await text(tabby.page)).includes("Brandon works"), "work days did not save");
  await press(tabby.page.locator("[data-action='edit-shift']"));
  await press(tabby.page.locator("[data-action='shift-day'][data-dow='6']"));
  await press(tabby.page.locator("[data-action='save-shift']"));
  await press(tabby.page.locator("[data-action='end-shift']"));
  check((await text(tabby.page)).includes("until"), "work days did not end");

  await brandon.page.goto(`${origin}/#/goals`);
  await press(brandon.page.locator("[data-action='open-goal']"));
  await brandon.page.locator("#goal-title").fill("Paint the porch");
  await press(brandon.page.locator("[data-action='save-goal']"));
  await press(brandon.page.locator("[data-action='open-counter']"));
  await brandon.page.locator("#goal-date").fill("2026-12-12");
  await press(brandon.page.locator("[data-action='save-proposal']"));
  await sync(brandon.page);
  await tabby.page.goto(`${origin}/#/goals`);
  await sync(tabby.page);
  await tabby.context.setOffline(true);
  await tabby.page.waitForSelector(".offline-line");
  await press(tabby.page.locator("[data-action='not-yet']"));
  check((await text(tabby.page)).includes("Not yet"), "Not yet did nothing");
  await press(tabby.page.locator("[data-action='open-counter']"));
  await tabby.page.locator("#goal-date").fill("2026-12-19");
  await press(tabby.page.locator("[data-action='save-proposal']"));
  await tabby.context.setOffline(false);
  await sync(tabby.page);
  await sync(brandon.page);
  await brandon.page.goto(`${origin}/#/goals`);
  await press(brandon.page.locator("[data-action='agree-goal']"));
  await sync(brandon.page);
  await sync(tabby.page);
  await tabby.page.goto(`${origin}/#/calendar/2026-12-19`);
  check((await text(tabby.page)).includes("Paint the porch"), "agreed goal missing from calendar");
  await tabby.page.goto(`${origin}/#/goals`);
  await press(tabby.page.locator("[data-action='done-goal']"));
  check((await text(tabby.page)).includes("Done"), "Done list missing");

  await tabby.page.goto(`${origin}/#/journal`);
  await tabby.page.locator("textarea[data-save='journal-live']").fill("A private line.");
  await press(tabby.page.locator("[data-action='finish-journal']"));
  await sync(tabby.page);
  await brandon.page.goto(`${origin}/#/journal`);
  await sync(brandon.page);
  check(!(await text(brandon.page)).includes("A private line"), "private journal leaked");
  await tabby.page.locator("textarea[data-save='journal-live']").fill("Please hear this shared line.");
  await tabby.page.locator("input[data-save='journal-share']").check();
  await press(tabby.page.locator("[data-action='finish-journal']"));
  await sync(tabby.page);
  await sync(brandon.page);
  await brandon.page.reload({ waitUntil: "domcontentloaded" });
  await brandon.page.goto(`${origin}/#/journal`);
  check((await text(brandon.page)).includes("Please hear this shared line"), "shared journal did not arrive");

  await tabby.page.goto(`${origin}/#/ask`);
  await tabby.page.locator("textarea[data-save='ask-live']").fill("What do you remember from that week?");
  await press(tabby.page.locator("[data-action='finish-ask']"));
  await sync(tabby.page);
  await brandon.page.goto(`${origin}/#/ask`);
  await sync(brandon.page);
  check((await text(brandon.page)).includes("What do you remember"), "Ask Brandon did not arrive");

  await tabby.page.goto(`${origin}/#/dates`);
  if (await tabby.page.locator("[data-action='plan-date']").count()) await press(tabby.page.locator("[data-action='plan-date']"));
  if (await tabby.page.locator("[data-action='filter-set']").count()) await press(tabby.page.locator("[data-action='filter-set']"));
  await tabby.page.goto(`${origin}/#/just`);
  await press(tabby.page.locator("[data-action='open-just']"));
  await press(tabby.page.locator("[data-action='ynm']"));
  await press(tabby.page.locator("[data-action='close-just']"));
  await tabby.page.goto(`${origin}/#/presence`);
  await press(tabby.page.locator("[data-action='present']"));
  check((await text(tabby.page)).includes("Marked"), "phone down did not mark");

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await tabby.page.goto(`${origin}/#/album`);
  const [chooser] = await Promise.all([
    tabby.page.waitForEvent("filechooser"),
    press(tabby.page.locator("[data-action='add-photo']")),
  ]);
  await chooser.setFiles({ name: "tiny.png", mimeType: "image/png", buffer: png });
  await tabby.page.waitForFunction(() => document.body.innerText.includes("A note from the test"));

  await tabby.page.goto(`${origin}/#/today`);
  await brandon.page.goto(`${origin}/#/today`);
  let last = "";
  let stuck = 0;
  for (let step = 0; step < 900; step++) {
    const a = await act(tabby);
    const b = await act(brandon);
    if (a === "wait" || b === "wait") {
      await sync(tabby.page);
      await sync(brandon.page);
    }
    const title = await tabby.page.locator("#app h1").innerText();
    if (title !== last) console.log("step", step, title);
    const body = await text(tabby.page);
    check(!/same room|sit together|go be together|read aloud/i.test(body), `together prompt on ${title}`);
    if (title === last && a === "wait" && b === "wait") stuck += 1;
    else stuck = 0;
    last = title;
    if (title.includes("You kept the whole path") && (await text(brandon.page)).includes("You kept the whole path")) {
      check(true, "path");
      break;
    }
    if (stuck > 4) {
      bugs.push(`stuck on ${title}`);
      break;
    }
    if (step === 899) bugs.push(`did not finish the path, last ${title}`);
  }

  console.log(bugs.length ? bugs.join("\n") : `${deviceName} QA CLEAN ${checks} checks`);
  if (bugs.length) process.exitCode = 1;
} catch (err) {
  console.error("FAIL", err);
  console.error(bugs.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
