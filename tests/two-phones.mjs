import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { webkit, devices } from "playwright-core";
import { generateJournalKey } from "../js/crypto.js";

const root = new URL("..", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const file = join(root, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
  try {
    const buf = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end("missing");
  }
});
await new Promise((resolve) => server.listen(8777, "127.0.0.1", resolve));

const files = new Map();
let seq = 1;
let putDelay = 30;
files.set("README.md", { sha: "readme", b64: Buffer.from("Closer data\n").toString("base64") });

async function handle(route) {
  if (putDelay) await new Promise((r) => setTimeout(r, putDelay));
  const req = route.request();
  const url = new URL(req.url());
  if (req.method() === "GET" && url.pathname === "/repos/Btcombo1/closer-data") {
    return route.fulfill({ json: { default_branch: "main", private: true } });
  }
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
    if (body.branch !== "main") return route.fulfill({ status: 422, json: { message: "branch must be main" } });
    const existing = files.get(name);
    if (existing && body.sha !== existing.sha) return route.fulfill({ status: 409, json: { message: "sha" } });
    const sha = `sha-${seq++}`;
    files.set(name, { sha, b64: body.content });
    return route.fulfill({ json: { content: { sha }, commit: { sha } } });
  }
  return route.fulfill({ status: 404, json: { message: "Not Found" } });
}

const browser = await webkit.launch({ headless: true });
const iPhone = devices["iPhone 13"];
const tabbyKey = await generateJournalKey();
const brandonKey = await generateJournalKey();
const passphrase = "shared-secret-passphrase";
const token = "github_pat_e2e0123456789abcdef";

function settings(profile, key) {
  return {
    profile,
    token,
    passphrase,
    setupDone: true,
    authorKey: key,
    journalKey: key,
    lastSyncNote: "",
  };
}

async function phone(profile, key) {
  const context = await browser.newContext({ ...iPhone, serviceWorkers: "block" });
  await context.route("https://api.github.com/**", handle);
  await context.addInitScript((saved) => {
    if (!localStorage.getItem("closer.settings")) localStorage.setItem("closer.settings", JSON.stringify(saved));
  }, settings(profile, key));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto("http://127.0.0.1:8777/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#app h1");
  for (let i = 0; i < 3; i++) {
    const next = page.locator("[data-action='guide-next']");
    if (!(await next.count())) break;
    await next.click();
  }
  return { context, page, errors, profile };
}

async function press(locator) {
  const el = locator.first();
  await el.evaluate((node) => node.scrollIntoView({ block: "center" }));
  try {
    await el.tap({ timeout: 4000 });
  } catch {
    await el.evaluate((node) => node.click());
  }
}

async function sync(person) {
  const seal = person.page.locator(".sheet [data-action='seal']");
  if (await seal.count()) await press(seal);
  await person.page.evaluate(() => window.dispatchEvent(new Event("online")));
  const started = Date.now();
  let stable = 0;
  let last = "";
  while (Date.now() - started < 25000) {
    last = await person.page.locator("[data-sync-note]").first().evaluate((el) => el.textContent || "").catch(() => "");
    if (last.startsWith("Synced")) return;
    if (!last) {
      stable += 1;
      if (stable >= 2) return;
    } else if (/^(401|403|404|422)/.test(last) || last.includes("Could not") || last.includes("reach GitHub")) {
      throw new Error(`${person.profile} sync failed: ${last}`);
    } else stable = 0;
    await person.page.waitForTimeout(150);
  }
  throw new Error(`${person.profile} sync timeout. note=${last}`);
}

async function act(person) {
  const page = person.page;
  const sheet = page.locator(".sheet [data-action='seal']");
  if (await sheet.count()) {
    await press(sheet);
    return "seal";
  }
  if (await page.locator("[data-action='continue']").count()) {
    await press(page.locator("[data-action='continue']"));
    return "continue";
  }
  const boxes = page.locator("button.rule");
  const count = await boxes.count();
  for (let i = 0; i < count; i++) {
    if ((await boxes.nth(i).getAttribute("aria-pressed")) !== "true") {
      await boxes.nth(i).locator("span").last().tap();
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
  if (person.profile === "brandon" && (await page.locator("#aff-draft").count())) {
    const draft = page.locator("#aff-draft");
    if (!(await draft.inputValue()).trim()) {
      await draft.fill("You are steady and kind, and this family is loved because of you.");
      await press(page.locator("[data-action='add-aff']"));
      await press(page.locator("[data-action='ready-aff']"));
      return "affirm";
    }
  }
  const areas = page.locator("textarea[data-save='answer'], textarea[data-save='part'], textarea[data-save='ex'], textarea[data-save='closure']");
  const areaCount = await areas.count();
  for (let i = 0; i < areaCount; i++) {
    const area = areas.nth(i);
    if (!(await area.inputValue()).trim()) {
      await area.fill(`Something true from ${person.profile}, said with care.`);
      return "type";
    }
  }
  const finish = page.locator("[data-action='finish'], [data-action='finish-part'], [data-action='finish-ex']");
  if (await finish.count()) {
    await press(finish);
    await page.waitForTimeout(80);
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
  const offer = page.locator("[data-action='seal']");
  if (await offer.count()) {
    await press(offer);
    return "seal";
  }
  if ((await page.locator("#app").innerText()).includes("You kept the whole path")) return "done";
  return "wait";
}

const bugs = [];
const tabby = await phone("tabby", tabbyKey);
const brandon = await phone("brandon", brandonKey);

try {
  await sync(tabby);
  await sync(brandon);

  const rules = tabby.page.locator("button.rule");
  await rules.first().locator("span").last().tap();
  if ((await rules.first().getAttribute("aria-pressed")) !== "true") bugs.push("Tapping the rule text did not check it");
  await tabby.page.waitForTimeout(550);
  await rules.first().locator(".mark").tap();
  if ((await rules.first().getAttribute("aria-pressed")) !== "false") bugs.push("A second tap on the mark checked it twice");
  await rules.first().locator("span").last().tap();
  putDelay = 1200;
  const syncing = tabby.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await tabby.page.waitForTimeout(200);
  const total = await rules.count();
  for (let i = 1; i < total; i++) {
    if ((await rules.nth(i).getAttribute("aria-pressed")) !== "true") await rules.nth(i).locator("span").last().tap();
  }
  await syncing;
  await tabby.page.waitForFunction(() => (document.querySelector("[data-sync-note]")?.textContent || "").startsWith("Synced"), null, { timeout: 20000 });
  await tabby.page.waitForTimeout(400);
  const still = await tabby.page.locator("button.rule").evaluateAll((els) => els.map((el) => el.getAttribute("aria-pressed") === "true"));
  if (still.some((on) => !on)) bugs.push(`Rule toggles came back off: ${JSON.stringify(still)}`);
  else console.log("race ok", still.length, "rules stayed on");
  const left = await tabby.page.locator("ul.left").innerText();
  if (!left.includes("Brandon: rule 1 not checked")) bugs.push(`What's left missed Brandon: ${left}`);
  if (!/Tabby: words not marked finished/.test(left)) bugs.push(`What's left missed Tabby's words: ${left}`);
  putDelay = 20;

  await press(tabby.page.locator("[data-go='#/journal']")).catch(async () => {
    await tabby.page.goto("http://127.0.0.1:8777/#/journal");
  });
  await tabby.page.waitForSelector("textarea[data-save='journal-live']");
  await tabby.page.locator("textarea[data-save='journal-live']").fill("A private line Brandon must not see yet.");
  await sync(tabby);
  await brandon.page.goto("http://127.0.0.1:8777/#/journal");
  await sync(brandon);
  const brandonJournal = await brandon.page.locator("#app").innerText();
  if (brandonJournal.includes("must not see yet")) bugs.push("Brandon saw Tabby's unfinished journal");
  await tabby.page.locator("input[data-save='journal-share']").check();
  await press(tabby.page.locator("[data-action='finish-journal']"));
  await tabby.page.waitForFunction(() => document.body.innerText.includes("Finished"));
  await sync(tabby);
  await sync(brandon);
  await brandon.page.reload({ waitUntil: "domcontentloaded" });
  await brandon.page.goto("http://127.0.0.1:8777/#/journal");
  await sync(brandon);
  const shared = await brandon.page.locator("#app").innerText();
  if (!shared.includes("must not see yet")) bugs.push("Brandon did not see the finished shared journal");

  await tabby.page.goto("http://127.0.0.1:8777/#/ask");
  await tabby.page.locator("textarea[data-save='ask-live']").fill("What do you remember from that week?");
  await press(tabby.page.locator("[data-action='finish-ask']"));
  await sync(tabby);
  await brandon.page.goto("http://127.0.0.1:8777/#/ask");
  await sync(brandon);
  const ask = await brandon.page.locator("#app").innerText();
  if (!ask.includes("What do you remember")) bugs.push("Brandon did not see the finished question");

  await tabby.page.goto("http://127.0.0.1:8777/#/calendar");
  if (!(await tabby.page.locator("#app").innerText()).match(/20\d\d/)) bugs.push("Calendar did not render");
  await tabby.page.goto("http://127.0.0.1:8777/#/dates");
  if (!(await tabby.page.locator("#app").innerText()).includes("Date nights")) bugs.push("Dates missing");
  await tabby.page.goto("http://127.0.0.1:8777/#/presence");
  if (!(await tabby.page.locator("#app").innerText()).includes("Be present")) bugs.push("Presence missing");
  await tabby.page.goto("http://127.0.0.1:8777/#/just");
  await press(tabby.page.locator("[data-action='open-just']"));
  await press(tabby.page.locator("[data-action='ynm']"));
  await tabby.page.goto("http://127.0.0.1:8777/#/settings");
  await tabby.page.getByText("Version 10").waitFor({ timeout: 10000 });
  await tabby.page.locator("#sync-key").fill("  Bearer github_pat_replacedkey123456 ");
  await press(tabby.page.locator("[data-action='save-sync-key']"));
  await tabby.page.waitForFunction(() => (document.querySelector("[data-sync-note]")?.textContent || "").startsWith("Synced"), null, { timeout: 20000 });
  const kept = await tabby.page.evaluate(() => JSON.parse(localStorage.getItem("closer.settings")).passphrase);
  if (kept !== passphrase) bugs.push("Sync key change cleared the passphrase");

  await tabby.page.goto("http://127.0.0.1:8777/#/today");
  await brandon.page.goto("http://127.0.0.1:8777/#/today");

  let stuck = "";
  let stuckCount = 0;
  let lastTitle = "";
  for (let step = 0; step < 900; step++) {
    const a = await act(tabby);
    const b = await act(brandon);
    if (a === "wait" || b === "wait") {
      await sync(tabby);
      await sync(brandon);
    }
    const title = await tabby.page.locator("#app h1").innerText();
    if (title !== lastTitle) {
      lastTitle = title;
      console.log("day", step, title);
    }
    const mark = `${title}|${a}|${b}`;
    if (mark === stuck) stuckCount += 1;
    else {
      stuck = mark;
      stuckCount = 0;
    }
    if (stuckCount > 6) {
      const dump = await tabby.page.locator("#app").innerText();
      throw new Error(`Stuck at ${mark}\n${dump.slice(0, 500)}`);
    }
    const doneA = (await tabby.page.locator("#app").innerText()).includes("You kept the whole path");
    const doneB = (await brandon.page.locator("#app").innerText()).includes("You kept the whole path");
    if (doneA && doneB) {
      console.log("path complete", step);
      break;
    }
    if (step === 899) throw new Error("Did not finish the path");
  }

  if (tabby.errors.length) bugs.push(`Tabby page errors: ${tabby.errors.join(" | ")}`);
  if (brandon.errors.length) bugs.push(`Brandon page errors: ${brandon.errors.join(" | ")}`);
  if (!files.has("state.json")) bugs.push("state.json was never written");
  console.log(bugs.length ? `BUGS\n${bugs.join("\n")}` : "E2E CLEAN");
  if (bugs.length) process.exitCode = 1;
} catch (err) {
  console.error("E2E FAIL", err);
  console.error("open bugs", bugs);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
