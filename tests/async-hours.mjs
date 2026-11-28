import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium, devices } from "playwright-core";
import { generateJournalKey } from "../js/crypto.js";

const root = new URL("..", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const port = 8783;
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

const deviceName = process.argv[2] === "pixel" ? "Pixel 5" : "Galaxy S9+";
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true });
const passphrase = "shared-secret-passphrase";
const token = "github_pat_asynchours123456";
const bugs = [];
const banned = /same room|sit together|go be together|read aloud|face each other|hold hands|out loud|in person|phones in another room/i;

async function phone(profile) {
  const key = await generateJournalKey();
  const context = await browser.newContext({ ...devices[deviceName], serviceWorkers: "allow" });
  await context.route("https://api.github.com/**", handle);
  await context.addInitScript((saved) => {
    if (!localStorage.getItem("closer.settings")) localStorage.setItem("closer.settings", JSON.stringify(saved));
  }, { profile, token, passphrase, setupDone: true, authorKey: key, journalKey: key, seenGuide: true });
  const page = await context.newPage();
  page.on("pageerror", (err) => bugs.push(String(err)));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#app h1");
  return { context, page };
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
    if (/^(401|403|404)/.test(last)) throw new Error(last);
    await page.waitForTimeout(150);
  }
  throw new Error(`sync timeout ${last}`);
}

async function screen(page) {
  return page.locator("#app").innerText();
}

const brandon = await phone("brandon");
const tabby = await phone("tabby");

try {
  await sync(brandon.page);
  await sync(tabby.page);
  const rules = brandon.page.locator("button.rule");
  for (let i = 0; i < await rules.count(); i++) await rules.nth(i).tap();
  await brandon.page.locator("textarea[data-save='answer']").first().fill("Brandon can keep these, on his own time.");
  await press(brandon.page.locator("[data-action='finish']"));
  await sync(brandon.page);
  await sync(tabby.page);
  const early = await screen(brandon.page);
  if (banned.test(early)) bugs.push(`Together prompt while waiting: ${early.match(banned)[0]}`);
  if (!(await brandon.page.locator("#app h1").innerText()).includes("done for today")) bugs.push("Brandon was not told to wait");
  if ((await brandon.page.locator("#app h1").innerText()) === "Step kept.") bugs.push("Step advanced before Tabby answered");

  await tabby.context.setOffline(true);
  await tabby.page.waitForSelector(".offline-line");
  const hers = tabby.page.locator("button.rule");
  for (let i = 0; i < await hers.count(); i++) {
    if ((await hers.nth(i).getAttribute("aria-pressed")) !== "true") await hers.nth(i).tap();
  }
  await tabby.page.locator("textarea[data-save='answer']").fill("Tabby answers hours later, still offline.");
  const offlineText = await screen(tabby.page);
  if (banned.test(offlineText)) bugs.push(`Together prompt offline: ${offlineText.match(banned)[0]}`);
  if (!offlineText.includes("Saved on phone")) bugs.push("Offline line missing");
  await tabby.context.setOffline(false);
  await press(tabby.page.locator("[data-action='finish']"));
  await sync(tabby.page);
  await sync(brandon.page);
  const kept = await brandon.page.locator("#app h1").innerText();
  if (kept !== "Step kept.") bugs.push(`Did not advance after both had answered: ${kept}`);
  const finalText = `${await screen(brandon.page)}\n${await screen(tabby.page)}`;
  if (banned.test(finalText)) bugs.push(`Together prompt after advance: ${finalText.match(banned)[0]}`);
  console.log(bugs.length ? bugs.join("\n") : `${deviceName} ASYNC CLEAN`);
  if (bugs.length) process.exitCode = 1;
} catch (err) {
  console.error("FAIL", err);
  console.error(bugs.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
