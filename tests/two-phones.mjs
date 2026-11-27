import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright-core";
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

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true });
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route("https://api.github.com/**", handle);
  await context.addInitScript((saved) => localStorage.setItem("closer.settings", JSON.stringify(saved)), settings(profile, key));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto("http://127.0.0.1:8777/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#app h1");
  return { context, page, errors, profile };
}

async function sync(person) {
  const seal = person.page.locator(".sheet [data-action='seal']");
  if (await seal.count()) await seal.first().click();
  const button = person.page.locator("[data-action='sync']").first();
  if (await button.count()) await button.click();
  try {
    await person.page.waitForFunction(() => {
      const note = document.querySelector("[data-sync-note]");
      const text = note ? note.textContent : "";
      const body = document.body.innerText;
      return !note || text.startsWith("Synced") || /^(401|403|404|422)/.test(text) || text.includes("Could not") || text.includes("reach GitHub");
    }, null, { timeout: 20000 });
  } catch (err) {
    const note = await person.page.locator("[data-sync-note]").allInnerTexts().catch(() => []);
    const h1 = await person.page.locator("#app h1").innerText().catch(() => "");
    throw new Error(`${person.profile} sync timeout. notes=${JSON.stringify(note)} h1=${h1} ${err.message}`);
  }
  const note = (await person.page.locator("[data-sync-note]").count())
    ? await person.page.locator("[data-sync-note]").first().innerText()
    : "Synced";
  if (!note.startsWith("Synced")) throw new Error(`${person.profile} sync failed: ${note}`);
}

async function act(person) {
  const page = person.page;
  const sheet = page.locator(".sheet [data-action='seal']");
  if (await sheet.count()) {
    await sheet.first().click();
    return "seal";
  }
  if (await page.locator("[data-action='continue']").count()) {
    await page.locator("[data-action='continue']").click();
    return "continue";
  }
  const boxes = page.locator("label.check input[type=checkbox]");
  const count = await boxes.count();
  for (let i = 0; i < count; i++) {
    if (!(await boxes.nth(i).isChecked())) {
      await boxes.nth(i).click();
      return "check";
    }
  }
  for (const field of ["helping", "criticism"]) {
    const choice = page.locator(`[data-action='rate'][data-field='${field}'][data-value='supported']`);
    if (await choice.count() && !(await choice.first().innerText()).includes("✓")) {
      await choice.first().click();
      return "rate";
    }
  }
  if (person.profile === "brandon" && (await page.locator("#aff-draft").count())) {
    const draft = page.locator("#aff-draft");
    if (!(await draft.inputValue()).trim()) {
      await draft.fill("You are steady and kind, and this family is loved because of you.");
      await page.locator("[data-action='add-aff']").click();
      await page.locator("[data-action='ready-aff']").click();
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
    await finish.first().click();
    await page.waitForTimeout(80);
    return "finish";
  }
  if (await page.locator("[data-action='ack']").count()) {
    await page.locator("[data-action='ack']").first().click();
    return "ack";
  }
  if (await page.locator("[data-action='close-chapter']").count()) {
    await page.locator("[data-action='close-chapter']").first().click();
    return "close";
  }
  const offer = page.locator("[data-action='seal']");
  if (await offer.count()) {
    await offer.first().click();
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

  putDelay = 1200;
  const first = tabby.page.locator("label.check input").first();
  await first.click();
  const syncing = tabby.page.locator("[data-action='sync']").first().click();
  await tabby.page.waitForTimeout(200);
  const boxes = tabby.page.locator("label.check input");
  const total = await boxes.count();
  for (let i = 1; i < total; i++) {
    if (!(await boxes.nth(i).isChecked())) await boxes.nth(i).click();
  }
  await syncing;
  await tabby.page.waitForFunction(() => (document.querySelector("[data-sync-note]")?.textContent || "").startsWith("Synced"), null, { timeout: 20000 });
  await tabby.page.waitForTimeout(400);
  const still = await tabby.page.locator("label.check input").evaluateAll((els) => els.map((el) => el.checked));
  if (still.some((on) => !on)) bugs.push(`Checkbox race unchecked rules: ${JSON.stringify(still)}`);
  else console.log("race ok", still.length, "rules stayed checked");
  putDelay = 20;

  await tabby.page.locator("[data-go='#/journal']").click().catch(async () => {
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
  await tabby.page.locator("[data-action='finish-journal']").click();
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
  await tabby.page.locator("[data-action='finish-ask']").click();
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
  await tabby.page.locator("[data-action='open-just']").click();
  await tabby.page.locator("[data-action='ynm']").first().click();
  await tabby.page.goto("http://127.0.0.1:8777/#/settings");
  await tabby.page.locator("#sync-key").fill("  Bearer github_pat_replacedkey123456 ");
  await tabby.page.locator("[data-action='save-sync-key']").click();
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
