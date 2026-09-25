// Tuner artefaktını gerçek Chromium'da açar: iframe boot ediyor mu, kaydırıcılar
// oyunun ST'sini oynatıyor mu, ekran değişimi çalışıyor mu — bakarak doğrular.
const fs = require("fs");
const path = require("path");
const http = require("http");

const FILE = process.argv[2];
const OUTDIR = path.join(__dirname, "..", "shots");

(async () => {
  const { chromium } = require("playwright");
  const body = fs.readFileSync(FILE, "utf8");
  // Artifact kabuğu ne ekliyorsa taklidi: tam belge.
  const page404 = "<!DOCTYPE html><html lang=tr><head><meta charset=utf-8>" +
    "<meta name=viewport content='width=device-width,initial-scale=1'></head><body>" + body + "</body></html>";
  const srv = http.createServer((req, res) => {
    if (req.url.startsWith("/assets/")) {
      const f = path.join(__dirname, "..", decodeURIComponent(req.url));
      if (fs.existsSync(f)) { res.writeHead(200, { "Content-Type": f.endsWith(".jpg") ? "image/jpeg" : "image/png" }); return res.end(fs.readFileSync(f)); }
      res.writeHead(404); return res.end("yok");
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page404);
  }).listen(0);
  const port = srv.address().port;

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push("PAGE: " + e.message));
  page.on("console", m => { if (m.type() === "error") errs.push("CONSOLE: " + m.text()); });

  await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "load" });
  await page.waitForTimeout(2500);

  const boot = await page.evaluate(() => {
    const w = document.getElementById("fr").contentWindow;
    return { hasG: !!(w && w.__G), bg: w.__G.hasBg(), tabela: w.__G.ST.tabela, style: w.__G.ST.signStyle,
             signChip: document.getElementById("sign").textContent, hiddenRows: [...document.querySelectorAll(".row")].filter(r => r.style.display === "none").length,
             state: w && w.__G ? w.__G.game.state : null };
  });
  console.log("boot:", JSON.stringify(boot));

  await page.screenshot({ path: path.join(OUTDIR, "tuner-1-menu.png") });

  // kaydırıcı: tabela yüksekliğini oynat
  await page.evaluate(() => {
    const el = document.getElementById("s_tabelaH");
    el.value = 0.18;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => document.getElementById("fr").contentWindow.__G.ST.tabelaH);
  console.log("tabelaH ->", after);
  await page.screenshot({ path: path.join(OUTDIR, "tuner-2-slider.png") });

  // çıktı kutusu
  await page.evaluate(() => document.querySelector('.tab[data-tab="4"]').click());
  await page.waitForTimeout(200);
  const out = await page.evaluate(() => document.getElementById("out").textContent);
  console.log("cikti:", out.replace(/\n/g, " | "));

  // ekran değişimi
  await page.evaluate(() => document.querySelector('.chip[data-st="NAMING"]').click());
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUTDIR, "tuner-3-naming.png") });
  await page.evaluate(() => document.querySelector('.chip[data-st="HOWTO"]').click());
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUTDIR, "tuner-4-howto.png") });

  // tabela stili düğmesi
  await page.evaluate(() => document.getElementById("sign").click());
  await page.waitForTimeout(300);
  console.log("stil ->", await page.evaluate(() => document.getElementById("fr").contentWindow.__G.ST.signStyle),
              "| çıktı:", (await page.evaluate(() => document.getElementById("out").textContent)).replace(/\n/g, " "));
  await page.evaluate(() => document.querySelector('.chip[data-st="MENU"]').click());
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUTDIR, "tuner-5-fascia.png") });

  // renk
  await page.evaluate(() => {
    document.querySelector('.tab[data-tab="3"]').click();
    const el = document.getElementById("c_rxRed");
    el.value = "#00a651";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector('.chip[data-st="MENU"]').click();
  });
  await page.waitForTimeout(500);
  const col = await page.evaluate(() => document.getElementById("fr").contentWindow.__G.CONFIG.colors.rxRed);
  console.log("rxRed ->", col);

  console.log(errs.length ? "HATA:\n" + errs.join("\n") : "hata yok");
  await browser.close();
  srv.close();
})();
