#!/usr/bin/env node
/**
 * Oyunu GERÇEK bir tarayıcıda açıp ekran görüntüsü alır.
 *
 * jsdom çizemez (tools/gamevm.js canvas'ı stub'lar) — o yüzden mantık orada, GÖRÜNÜŞ
 * burada doğrulanır. Playwright + Chromium bulut konteynerinde kurulu; bu betik orada
 * koşar, cihazdaki index.html oraya kopyalanır.
 *
 *   node tools/shot.js --state menu --out shots/menu.png
 *   node tools/shot.js --state naming --name "DEVA" --out shots/naming.png
 *   node tools/shot.js --state howto --out shots/howto.png
 *   node tools/shot.js --state playing --day 12 --out shots/day12.png
 *
 * Sayfa file:// yerine küçük bir http sunucusundan servis edilir: file:// altında
 * tarayıcı kardeş PNG'leri engelleyebiliyor.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");

function parse(argv) {
  const o = { state: "menu", out: "shots/shot.png", width: 390, height: 844, dpr: 3,
              day: 1, name: null, file: "index.html", wait: 900 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--state") o.state = argv[++i];
    else if (a === "--out") o.out = argv[++i];
    else if (a === "--width") o.width = +argv[++i];
    else if (a === "--height") o.height = +argv[++i];
    else if (a === "--dpr") o.dpr = +argv[++i];
    else if (a === "--day") o.day = +argv[++i];
    else if (a === "--name") o.name = argv[++i];
    else if (a === "--file") o.file = argv[++i];
    else if (a === "--wait") o.wait = +argv[++i];
  }
  return o;
}

const MIME = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".json": "application/json",
               ".js": "text/javascript", ".css": "text/css" };

function serve(root) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
      const fp = path.join(root, rel);
      if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404); res.end("yok"); return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
      fs.createReadStream(fp).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port }));
  });
}

(async () => {
  const o = parse(process.argv);
  const root = path.join(__dirname, "..");
  const { chromium } = require("playwright");
  const { srv, port } = await serve(root);

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: o.width, height: o.height },
    deviceScaleFactor: o.dpr, isMobile: true, hasTouch: true
  });
  const problems = [];
  page.on("pageerror", e => problems.push("[hata] " + e.message));
  page.on("console", m => { if (m.type() === "error") problems.push("[konsol] " + m.text()); });

  await page.goto(`http://127.0.0.1:${port}/${o.file}`, { waitUntil: "load" });
  await page.waitForTimeout(o.wait);           // boot self-test'leri ve asset yüklemesi

  // İstenen state'e sür. Oyunun KENDİ fonksiyonları çağrılır, state elle kurulmaz.
  await page.evaluate(({ state, day, name }) => {
    if (name && typeof setPharmacyName === "function") setPharmacyName(name);
    if (state === "menu")   { if (typeof goMenu === "function") goMenu(); else game.state = STATE.MENU; }
    if (state === "naming") { if (typeof openNaming === "function") openNaming(); }
    if (state === "howto")  { if (typeof openHowTo === "function") openHowTo(); }
    if (state === "playing") {
      startNewCareer();
      while (game.dayNumber < day && game.state === STATE.PLAYING) {
        game.dayCompleted = patientsForDay(); endDay();
        if (game.state === "DAYEND") startNextDay();
      }
    }
    if (typeof render === "function") render();
  }, o);
  await page.waitForTimeout(120);

  const out = path.join(root, o.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  await browser.close();
  srv.close();

  console.log(`[shot] ${o.state} → ${o.out}  (${o.width}×${o.height} @${o.dpr}x)`);
  if (problems.length) { console.log("[shot] sayfa sorunları:"); problems.slice(0, 8).forEach(p => console.log("   " + p)); }
})();
