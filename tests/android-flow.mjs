import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium, webkit, devices } from "playwright-core";
import { generateJournalKey } from "../js/crypto.js";

const target = process.argv[2] || "samsung";
const root = new URL("..", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const port = 8781;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
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
    const sha = `sha-${seq++}`;
    files.set(name, { sha, b64: body.content });
    return route.fulfill({ json: { content: { sha }, commit: { sha } } });
  }
  return route.fulfill({ status: 404, json: { message: "Not Found" } });
}

const specs = {
  samsung: { engine: "chromium", device: "Galaxy S9+", workers: "allow" },
  pixel: { engine: "chromium", device: "Pixel 5", workers: "allow" },
  webkit: { engine: "webkit", device: "iPhone 13", workers: "block" },
};
const spec = specs[target];
if (!spec) throw new Error(`Unknown target ${target}`);
const browser = spec.engine === "webkit"
  ? await webkit.launch({ headless: true })
  : await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true });
const device = devices[spec.device];
const passphrase = "shared-secret-passphrase";
const token = "github_pat_androidflow123456";
const bugs = [];

async function phone(profile) {
  const key = await generateJournalKey();
  const context = await browser.newContext({
    ...device,
    serviceWorkers: spec.workers,
  });
  await context.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (query === "(display-mode: standalone)") {
        return { matches: true, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } };
      }
      return real(query);
    };
  });
  await context.route("https://api.github.com/**", handle);
  await context.addInitScript((saved) => {
    if (!localStorage.getItem("closer.settings")) localStorage.setItem("closer.settings", JSON.stringify(saved));
  }, {
    profile, token, passphrase, setupDone: true, authorKey: key, journalKey: key,
  });
  const page = await context.newPage();
  page.on("pageerror", (err) => bugs.push(`${profile} ${err}`));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#app h1");
  for (let i = 0; i < 3; i++) {
    const next = page.locator("[data-action='guide-next']");
    if (!(await next.count())) break;
    await next.tap();
  }
  return { context, page, profile };
}

async function press(locator) {
  const el = locator.first();
  await el.evaluate((node) => node.scrollIntoView({ block: "center" }));
  try { await el.tap({ timeout: 4000 }); } catch { await el.evaluate((node) => node.click()); }
}

async function sync(page) {
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  const started = Date.now();
  let last = "";
  while (Date.now() - started < 20000) {
    last = await page.locator("[data-sync-note]").first().evaluate((el) => el.textContent || "").catch(() => "");
    if (last.startsWith("Synced")) return;
    if (/^(401|403|404|422)/.test(last)) throw new Error(last);
    await page.waitForTimeout(150);
  }
  throw new Error(`sync timeout ${last}`);
}

async function checkRules(page) {
  const rules = page.locator("button.rule");
  const count = await rules.count();
  for (let i = 0; i < count; i++) {
    if ((await rules.nth(i).getAttribute("aria-pressed")) !== "true") await rules.nth(i).tap();
  }
}

async function h1(page) {
  return page.locator("#app h1").first().innerText();
}

const tabby = await phone("tabby");
const brandon = await phone("brandon");

try {
  if (spec.workers === "allow") {
    const sw = await Promise.race([
      tabby.page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL || ""),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 8000)),
    ]);
    if (!String(sw).includes("sw.js")) bugs.push(`Service worker did not control the page (${sw})`);
    const standalone = await tabby.page.evaluate(() => matchMedia("(display-mode: standalone)").matches);
    if (!standalone) bugs.push("Installed-app mode did not match");
    await tabby.page.reload({ waitUntil: "domcontentloaded" });
    await tabby.page.waitForSelector("#app h1");
  }

  await sync(tabby.page);
  await sync(brandon.page);
  await checkRules(tabby.page);
  await tabby.page.locator("textarea[data-save='answer']").fill("Tabby can keep these rules.");
  await press(tabby.page.locator("[data-action='finish']"));
  await sync(tabby.page);
  await sync(brandon.page);
  await checkRules(brandon.page);
  await brandon.page.locator("textarea[data-save='answer']").fill("Brandon can keep these rules.");
  await press(brandon.page.locator("[data-action='finish']"));
  await sync(brandon.page);
  await sync(tabby.page);

  const kept = await h1(tabby.page);
  if (kept !== "Step kept.") bugs.push(`Today did not advance after Day 1. Heading: ${kept}`);
  if ((await tabby.page.locator("#app").innerText()).includes("Waiting on you")) bugs.push("Today still says waiting on you after Day 1");
  if (await tabby.page.locator("[data-action='open-sync-key']").count()) bugs.push("Change key is still on Today");
  if (!(await tabby.page.locator("text=What's left").count()) && !(await tabby.page.locator("text=What’s left").count())) bugs.push("What's left card missing");
  const start = tabby.page.locator("[data-action='continue']");
  if (!(await start.count())) bugs.push("Start the next step now is missing");
  else await press(start);

  const day2 = await h1(tabby.page);
  if (day2 !== "What would help this feel safe") bugs.push(`Next step heading was ${day2}`);
  const todayDay = await tabby.page.locator("[data-day]").first().getAttribute("data-day");
  if (todayDay !== "w1d2") bugs.push(`Today is showing ${todayDay}`);

  await press(tabby.page.locator("nav [data-go='#/path']"));
  await tabby.page.waitForFunction(() => document.querySelector("#app h1")?.textContent === "The path");
  const pathText = await tabby.page.locator("#app").innerText();
  if (!pathText.includes("Kept") || !pathText.includes("Today")) bugs.push(`Path labels missing. ${pathText.slice(0, 400)}`);
  await press(tabby.page.locator("[data-go='#/path/w1d2']"));
  await tabby.page.waitForFunction(() => document.querySelector("[data-day]")?.getAttribute("data-day") === "w1d2");
  const opened = await h1(tabby.page);
  const openedText = await tabby.page.locator("#app").innerText();
  if (opened !== "What would help this feel safe") bugs.push(`Day 2 opened as ${opened}`);
  if (openedText.includes("How we will treat this")) bugs.push("Day 2 page still shows Day 1");

  await press(tabby.page.locator("[data-go='#/path']").last());
  await tabby.page.waitForFunction(() => document.querySelector("#app h1")?.textContent === "The path");
  await press(tabby.page.locator("[data-go='#/path/w1d1']"));
  await tabby.page.waitForFunction(() => document.querySelector("[data-day]")?.getAttribute("data-day") === "w1d1");
  if ((await h1(tabby.page)) !== "How we will treat this") bugs.push("Day 1 page lost its own title");
  let dialog = false;
  tabby.page.once("dialog", () => { dialog = true; });
  await press(tabby.page.locator("[data-action='add-more']"));
  if (dialog) bugs.push("Add more still uses a popup");
  if (!(await tabby.page.locator("#add-more-text").count())) bugs.push("Add more did not open a box");
  await tabby.page.locator("#add-more-text").fill("One more kind rule.");
  await press(tabby.page.locator("[data-action='save-more']"));
  if (!(await tabby.page.locator("#app").innerText()).includes("One more kind rule.")) bugs.push("Added words did not stay on the page");

  await press(tabby.page.locator("nav [data-go='#/today']"));
  await tabby.context.setOffline(true);
  await tabby.page.waitForSelector(".offline-line", { timeout: 5000 });
  const offline = await tabby.page.locator(".offline-line").innerText();
  if (!offline.includes("Saved on phone, will send when you have signal")) bugs.push(`Offline line was: ${offline}`);
  if (await tabby.page.locator("[data-action='open-sync-key']").count()) bugs.push("Offline screen asked for the key");
  const box = tabby.page.locator("textarea[data-save='answer']");
  if (await box.count()) await box.fill("Written with no signal.");
  await tabby.context.setOffline(false);
  await sync(tabby.page);

  await tabby.page.goto(`http://127.0.0.1:${port}/#/today`);
  await tabby.page.waitForSelector("#app h1");
  if ((await h1(tabby.page)) === "What would help this feel safe") {
    const area = tabby.page.locator("textarea[data-save='answer']");
    if (await area.count()) {
      await area.fill("A slower pace would help.");
      await press(tabby.page.locator("[data-action='finish']"));
      await sync(tabby.page);
      await sync(brandon.page);
      if ((await h1(tabby.page)) !== "You're done for today." && (await h1(tabby.page)) !== "You are done for today.") {
        const waiting = await h1(tabby.page);
        if (!waiting.includes("done for today") && waiting !== "Step kept.") bugs.push(`After Tabby's Day 2 note, heading was ${waiting}`);
      }
    }
  }
  if ((await h1(brandon.page)).includes("What would help") || (await brandon.page.locator("textarea[data-save='answer']").count())) {
    const area = brandon.page.locator("textarea[data-save='answer']");
    if (await area.count()) {
      await area.fill("I can slow down.");
      await press(brandon.page.locator("[data-action='finish']"));
      await sync(brandon.page);
      await sync(tabby.page);
    }
  }
  const seal = tabby.page.locator("[data-action='seal']");
  if (await seal.count()) {
    await press(seal);
    await sync(tabby.page);
  }
  if ((await h1(tabby.page)) === "Step kept.") await press(tabby.page.locator("[data-action='continue']"));
  const later = await h1(tabby.page);
  if (later === "How we will treat this") bugs.push("Still stuck on Day 1 after moving on");

  console.log(bugs.length ? bugs.join("\n") : `${target} CLEAN ${spec.device}`);
  if (bugs.length) process.exitCode = 1;
} catch (err) {
  console.error(target, "FAIL", err);
  console.error(bugs.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
