import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium, devices } from "playwright-core";
import { generateJournalKey } from "../js/crypto.js";

const root = new URL("..", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const port = 8784;
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
const token = "github_pat_goals123456789";
const passphrase = "shared-secret-passphrase";
const bugs = [];

async function phone(profile) {
  const key = await generateJournalKey();
  const context = await browser.newContext({ ...devices[deviceName], serviceWorkers: "allow" });
  await context.route("https://api.github.com/**", handle);
  await context.addInitScript((saved) => {
    if (!localStorage.getItem("closer.settings")) localStorage.setItem("closer.settings", JSON.stringify(saved));
  }, { profile, token, passphrase, setupDone: true, authorKey: key, journalKey: key, seenGuide: true });
  const page = await context.newPage();
  page.on("pageerror", (err) => bugs.push(String(err)));
  await page.goto(`http://127.0.0.1:${port}/#/goals`, { waitUntil: "domcontentloaded" });
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

async function shifts(page) {
  return page.locator("button.cell").evaluateAll((els) => els.map((el) => ({
    day: el.childNodes[0]?.textContent || "",
    shift: el.classList.contains("shift"),
  })));
}

const brandon = await phone("brandon");
const tabby = await phone("tabby");

try {
  await sync(brandon.page);
  await press(brandon.page.locator("[data-action='open-goal']"));
  await brandon.page.locator("#goal-title").fill("Paint the porch");
  await press(brandon.page.locator("[data-action='save-goal']"));
  await press(brandon.page.locator("[data-action='open-counter']"));
  await brandon.page.locator("#goal-date").fill("2026-12-12");
  await press(brandon.page.locator("[data-action='save-proposal']"));
  await sync(brandon.page);
  await sync(tabby.page);
  if (!(await tabby.page.locator("#app").innerText()).includes("suggested")) bugs.push("Tabby did not see the suggested date");
  await tabby.context.setOffline(true);
  await tabby.page.waitForSelector(".offline-line");
  await press(tabby.page.locator("[data-action='agree-goal']"));
  await tabby.page.goto(`http://127.0.0.1:${port}/#/calendar/2026-12-12`);
  await tabby.page.waitForSelector("#app h1");
  if (!(await tabby.page.locator("#app").innerText()).includes("Paint the porch")) bugs.push("Agreed goal missing on Tabby's calendar while offline");
  await tabby.context.setOffline(false);
  await sync(tabby.page);
  await sync(brandon.page);
  await brandon.page.goto(`http://127.0.0.1:${port}/#/calendar/2026-12-12`);
  await brandon.page.waitForSelector("#app h1");
  if (!(await brandon.page.locator("#app").innerText()).includes("Paint the porch")) bugs.push("Agreed goal missing on Brandon's calendar");

  await tabby.page.goto(`http://127.0.0.1:${port}/#/goals`);
  await tabby.page.waitForSelector("[data-action='open-counter']");
  await press(tabby.page.locator("[data-action='open-counter']"));
  await tabby.page.locator("#goal-date").fill("2026-12-19");
  await press(tabby.page.locator("[data-action='save-proposal']"));
  await sync(tabby.page);
  await brandon.page.goto(`http://127.0.0.1:${port}/#/goals`);
  await sync(brandon.page);
  await press(brandon.page.locator("[data-action='agree-goal']"));
  await sync(brandon.page);
  await sync(tabby.page);
  await tabby.page.goto(`http://127.0.0.1:${port}/#/calendar/2026-12-12`);
  if ((await tabby.page.locator("#app").innerText()).includes("Paint the porch")) bugs.push("Old goal date stayed on the calendar");
  await tabby.page.goto(`http://127.0.0.1:${port}/#/calendar/2026-12-19`);
  if (!(await tabby.page.locator("#app").innerText()).includes("Paint the porch")) bugs.push("New goal date did not land on the calendar");

  await brandon.page.goto(`http://127.0.0.1:${port}/#/calendar`);
  await brandon.page.waitForSelector("#app h1");
  if ((await brandon.page.locator("#app h1").innerText()).includes("November")) {
    await press(brandon.page.locator("[data-action='month'][data-dir='1']"));
  }
  await brandon.page.waitForFunction(() => document.querySelector("#app h1")?.textContent.includes("December"));
  let cells = await shifts(brandon.page);
  const before = cells.find((c) => c.day === "5");
  if (before?.shift) bugs.push("December 5 was still a work day before a schedule was added");
  await press(brandon.page.locator("[data-action='open-shift']"));
  await press(brandon.page.locator("[data-action='shift-day'][data-dow='5']"));
  await press(brandon.page.locator("[data-action='shift-day'][data-dow='6']"));
  await brandon.page.locator("#shift-start").fill("07:00");
  await brandon.page.locator("#shift-end").fill("19:00");
  await brandon.page.locator("#shift-from").fill("2026-12-04");
  await press(brandon.page.locator("[data-action='save-shift']"));
  cells = await shifts(brandon.page);
  const fri = cells.find((c) => c.day === "4");
  const sat = cells.find((c) => c.day === "5");
  const sun = cells.find((c) => c.day === "6");
  if (!fri?.shift || !sat?.shift) bugs.push(`Work days missing after save ${JSON.stringify({ fri, sat, sun })}`);
  if (sun?.shift) bugs.push("Sunday was marked work without being chosen");
  await brandon.page.goto(`http://127.0.0.1:${port}/#/calendar/2026-12-04`);
  const detail = await brandon.page.locator("#app").innerText();
  if (!detail.includes("07:00")) bugs.push("Work hours were not shown");

  console.log(bugs.length ? bugs.join("\n") : `${deviceName} GOALS CLEAN`);
  if (bugs.length) process.exitCode = 1;
} catch (err) {
  console.error("FAIL", err);
  console.error(bugs.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
