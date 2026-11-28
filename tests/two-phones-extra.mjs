import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { webkit, devices } from "playwright-core";
import { generateJournalKey } from "../js/crypto.js";

const root = new URL("..", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2" };
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
await new Promise((resolve) => server.listen(8778, "127.0.0.1", resolve));
const files = new Map([["README.md", { sha: "readme", b64: Buffer.from("hi").toString("base64") }]]);
let n = 1;
async function handle(route) {
  const req = route.request();
  const url = new URL(req.url());
  if (req.method() === "GET" && url.pathname === "/repos/Btcombo1/closer-data") return route.fulfill({ json: { default_branch: "main", private: true } });
  const match = url.pathname.match(/\/contents\/(.+)$/);
  const name = match ? decodeURIComponent(match[1]) : "";
  if (req.method() === "GET") {
    const item = files.get(name);
    if (!item) return route.fulfill({ status: 404, json: { message: "Not Found" } });
    return route.fulfill({ json: { sha: item.sha, content: item.b64, encoding: "base64" } });
  }
  if (req.method() === "PUT") {
    const body = JSON.parse(req.postData() || "{}");
    const sha = `s${n++}`;
    files.set(name, { sha, b64: body.content });
    return route.fulfill({ json: { content: { sha } } });
  }
  return route.fulfill({ status: 404, json: { message: "Not Found" } });
}
const browser = await webkit.launch({ headless: true });
const iPhone = devices["iPhone 13"];
const passphrase = "shared-secret-passphrase";
const token = "github_pat_extra0123456789";
const bugs = [];
async function phone(profile) {
  const key = await generateJournalKey();
  const context = await browser.newContext({ ...iPhone, serviceWorkers: "block" });
  await context.route("https://api.github.com/**", handle);
  await context.addInitScript((saved) => {
    if (!localStorage.getItem("closer.settings")) localStorage.setItem("closer.settings", JSON.stringify(saved));
  }, {
    profile, token, passphrase, setupDone: true, authorKey: key, journalKey: key,
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:8778/#/today", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#app h1");
  for (let i = 0; i < 3; i++) {
    const next = page.locator("[data-action='guide-next']");
    if (!(await next.count())) break;
    await next.click();
  }
  return { page, context };
}
async function press(locator) {
  const el = locator.first();
  await el.evaluate((node) => node.scrollIntoView({ block: "center" }));
  try { await el.tap({ timeout: 4000 }); } catch { await el.evaluate((node) => node.click()); }
}

async function sync(page) {
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForFunction(() => {
    const text = document.querySelector("[data-sync-note]")?.textContent || "";
    return !document.querySelector("[data-sync-note]") || text.startsWith("Synced") || text.startsWith("401");
  });
}
try {
  const tabby = await phone("tabby");
  const brandon = await phone("brandon");
  await sync(tabby.page);
  for (const box of await tabby.page.locator("button.rule").all()) await box.tap();
  await tabby.page.locator("textarea[data-save='answer']").fill("Tabby accepts these rules with care.");
  await press(tabby.page.locator("[data-action='finish']"));
  await tabby.page.waitForFunction(() => document.body.innerText.includes("Finished"));
  await sync(tabby.page);
  await sync(brandon.page);
  await brandon.page.reload({ waitUntil: "domcontentloaded" });
  await brandon.page.waitForSelector("#app h1");
  const seen = await brandon.page.locator("#app").innerText();
  if (!seen.includes("Tabby accepts these rules")) bugs.push("Brandon did not see Tabby's finished agreement");
  await brandon.page.goto("http://127.0.0.1:8778/#/journal");
  await sync(brandon.page);
  if ((await brandon.page.locator("#app").innerText()).includes("Tabby accepts")) bugs.push("Finished prompt leaked into the journal");

  await tabby.page.goto("http://127.0.0.1:8778/#/journal");
  await tabby.page.locator("textarea[data-save='journal-live']").fill("Please hear this.");
  await tabby.page.locator("input[data-save='journal-share']").check();
  await press(tabby.page.locator("[data-action='finish-journal']"));
  await sync(tabby.page);
  await brandon.page.goto("http://127.0.0.1:8778/#/journal");
  await sync(brandon.page);
  await brandon.page.locator("textarea[data-save='journal-ack']").fill("I hear you.");
  await press(brandon.page.locator("[data-action='finish-ack']"));
  await sync(brandon.page);
  await tabby.page.goto("http://127.0.0.1:8778/#/journal");
  await sync(tabby.page);
  if (!(await tabby.page.locator("#app").innerText()).includes("I hear you.")) bugs.push("Tabby did not see Brandon's finished acknowledgment");

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await tabby.page.goto("http://127.0.0.1:8778/#/album");
  tabby.page.once("dialog", (dialog) => dialog.accept("A small photo"));
  const [chooser] = await Promise.all([
    tabby.page.waitForEvent("filechooser"),
    press(tabby.page.locator("[data-action='add-photo']")),
  ]);
  await chooser.setFiles({ name: "tiny.png", mimeType: "image/png", buffer: png });
  await tabby.page.waitForFunction(() => document.body.innerText.includes("A small photo"));
  const link = `http://127.0.0.1:8778/#t=${encodeURIComponent(token)}&p=${encodeURIComponent(passphrase)}&who=tabby`;
  const fresh = await browser.newContext();
  await fresh.route("https://api.github.com/**", handle);
  const paired = await fresh.newPage();
  await paired.goto(link, { waitUntil: "domcontentloaded" });
  await paired.waitForTimeout(500);
  const pairedSettings = await paired.evaluate(() => JSON.parse(localStorage.getItem("closer.settings") || "{}"));
  if (pairedSettings.token !== token || pairedSettings.passphrase !== passphrase || pairedSettings.profile !== "tabby") {
    bugs.push("Pairing link did not configure the phone");
  }
  if (paired.url().includes("t=")) bugs.push("Pairing link left the secret in the address");
  console.log(bugs.length ? bugs.join("\n") : "EXTRA CLEAN");
  if (bugs.length) process.exitCode = 1;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
