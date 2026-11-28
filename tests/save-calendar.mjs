import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium, devices } from "playwright-core";
import { generateJournalKey } from "../js/crypto.js";

const root = new URL("..", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const port = 8785;
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

const deviceName = process.argv[2] === "pixel" ? "Pixel 5" : "Galaxy S9+";
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true });
const bugs = [];
const key = await generateJournalKey();
const context = await browser.newContext({ ...devices[deviceName], serviceWorkers: "allow" });
await context.addInitScript((saved) => {
  localStorage.setItem("closer.settings", JSON.stringify(saved));
}, { profile: "brandon", token: "", passphrase: "", setupDone: true, skipSync: true, authorKey: key, journalKey: key, seenGuide: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));
await page.goto(`http://127.0.0.1:${port}/#/calendar`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#app h1");

async function press(selector) {
  const el = page.locator(selector).first();
  await el.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await el.tap();
}

try {
  const sw = await Promise.race([
    page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL || ""),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 8000)),
  ]);
  if (!String(sw).includes("sw.js")) bugs.push(`service worker missing (${sw})`);
  const cachesNow = await page.evaluate(async () => caches.keys());
  if (!cachesNow.includes("closer-v11")) bugs.push(`cache is ${cachesNow.join(",")}`);
  if (cachesNow.some((name) => name.startsWith("closer-v") && name !== "closer-v11")) bugs.push(`old cache left behind ${cachesNow.join(",")}`);

  await press("[data-action='open-add']");
  await page.locator("#event-title").focus();
  await page.locator("#event-title").fill("Dentist");
  await page.evaluate(() => { document.getElementById("event-date").value = ""; });
  await press("[data-action='save-event']");
  await page.waitForTimeout(200);
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  await page.goto(`http://127.0.0.1:${port}/#/calendar/${today}`);
  await page.waitForSelector("#app h1");
  if (!(await page.locator("#app").innerText()).includes("Dentist")) bugs.push("Title and date did not save when the date value was blank");

  await page.goto(`http://127.0.0.1:${port}/#/calendar`);
  await press("[data-action='open-add']");
  await page.locator("#event-title").fill("Lunch");
  await page.locator("#event-date").fill("2026-12-20");
  await page.locator("#event-time").fill("13:30");
  await page.locator("#event-note").fill("With the kids");
  await page.locator("#event-title").focus();
  await press("[data-action='save-event']");
  await page.goto(`http://127.0.0.1:${port}/#/calendar/2026-12-20`);
  const lunch = await page.locator("#app").innerText();
  if (!lunch.includes("Lunch") || !lunch.includes("13:30") || !lunch.includes("With the kids")) bugs.push(`Time or note missing: ${lunch.slice(0, 180)}`);

  await context.setOffline(true);
  await page.goto(`http://127.0.0.1:${port}/#/calendar`);
  await page.waitForSelector(".offline-line");
  await press("[data-action='open-add']");
  await page.locator("#event-title").fill("");
  await press("[data-action='save-event']");
  const missing = await page.locator("#form-error").innerText();
  if (!missing.includes("Add a title")) bugs.push(`Missing title said: ${missing}`);
  await page.locator("#event-title").fill("Offline note");
  await page.locator("#event-date").fill("2026-12-21");
  await press("[data-action='save-event']");
  await page.waitForTimeout(500);
  await page.goto(`http://127.0.0.1:${port}/#/calendar/2026-12-21`);
  if (!(await page.locator("#app").innerText()).includes("Offline note")) bugs.push("Offline save did not show the event");
  await context.setOffline(false);

  await page.goto(`http://127.0.0.1:${port}/#/calendar`);
  await press("[data-action='open-shift']");
  await press("[data-action='shift-day'][data-dow='5']");
  await page.locator("#shift-start").fill("07:00");
  await page.locator("#shift-end").fill("19:00");
  await page.locator("#shift-start").focus();
  await press("[data-action='save-shift']");
  if (!(await page.locator("#app").innerText()).includes("Brandon works")) bugs.push("Work schedule did not save");

  await page.goto(`http://127.0.0.1:${port}/#/goals`);
  await press("[data-action='open-goal']");
  await page.locator("#goal-title").focus();
  await press("[data-action='save-goal']");
  if (!(await page.locator("#form-error").innerText()).includes("Add a title")) bugs.push("Goal save failed silently");
  await page.locator("#goal-title").fill("Paint the porch");
  await press("[data-action='save-goal']");
  if (!(await page.locator("#app").innerText()).includes("Paint the porch")) bugs.push("Goal did not save");
  if (await page.locator("#trouble").count()) bugs.push("Error banner showed on a good save");
  if (errors.length) bugs.push(errors.join(" | "));

  console.log(bugs.length ? bugs.join("\n") : `${deviceName} SAVE CLEAN`);
  if (bugs.length) process.exitCode = 1;
} catch (err) {
  console.error("FAIL", err);
  console.error(bugs.join("\n"));
  console.error(errors.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
