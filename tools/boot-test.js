/**
 * Headless boot testi — index.html'i jsdom içinde gerçekten çalıştırır.
 * Canvas 2D bağlamı stub'lanır (jsdom çizim yapamaz); amaç ÇİZİM değil,
 * boot self-test'lerinin uyarı basıp basmadığını görmek.
 *
 *   node tools/boot-test.js [dosya]     (varsayılan: index.html)
 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const file = process.argv[2] || "index.html";
const html = fs.readFileSync(path.join(__dirname, "..", file), "utf8");

// --- 2D bağlam stub'ı: her çağrıyı yutar, ölçüm çağrılarına makul değer döner
function stubCtx() {
  const target = {
    canvas: null, measureText: (t) => ({
      width: (t || "").length * 7,
      actualBoundingBoxLeft: 0, actualBoundingBoxRight: (t || "").length * 7,
      actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3
    }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    isPointInPath: () => false
  };
  return new Proxy(target, {
    get(o, k) { return k in o ? o[k] : () => undefined; },
    set(o, k, v) { o[k] = v; return true; }
  });
}

const vc = new VirtualConsole();
const logs = { warn: [], error: [], log: [] };
vc.on("jsdomError", e => logs.error.push("[jsdomError] " + (e && e.message)));
["warn", "error", "log"].forEach(lvl => vc.on(lvl, (...a) => logs[lvl].push(a.map(String).join(" "))));

const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = function () { const c = stubCtx(); c.canvas = this; return c; };
    w.devicePixelRatio = 3;
    Object.defineProperty(w, "innerWidth",  { value: 390, configurable: true });
    Object.defineProperty(w, "innerHeight", { value: 844, configurable: true });
    // Image: yükleme başarısız sayılır → oyun emoji fallback yoluna düşer (güvenlik ağı)
    class FakeImage {
      constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; }
      set src(v) { this._src = v; setTimeout(() => this.onerror && this.onerror(new Error("stub")), 0); }
      get src() { return this._src; }
      addEventListener(t, f) { if (t === "error") this.onerror = f; }
    }
    w.Image = FakeImage;
  }
});

setTimeout(() => {
  const w = dom.window;
  const fails = [];
  const warns = logs.warn.filter(l => !/^\s*$/.test(l));
  if (logs.error.length) fails.push(...logs.error);

  // --- temel sağlık kontrolleri
  // NOT: CONFIG/game `const` ile tanımlı → window'a BAĞLANMAZ. Erişim, script'in
  // kendi kapsamını dışarı veren tek kapıdan: window.cheats (fonksiyon bildirimleri
  // window'a bağlandığı için buildDaySchedule doğrudan görünür).
  if (typeof w.buildDaySchedule !== "function") fails.push("buildDaySchedule yok — boot çalışmamış");
  if (typeof w.cheats !== "object" || !w.cheats) fails.push("cheats yok — boot çalışmamış");
  let st = null;
  try { st = w.cheats && w.cheats.state && w.cheats.state(); } catch (e) { fails.push("cheats.state() hatası: " + e.message); }
  if (!st) fails.push("cheats.state() boş döndü");
  const isRelease = file.indexOf("www") === 0;
  if (isRelease) {
    const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    if (/debugDecisions:\s*true/.test(src)) fails.push("release derlemesinde debugDecisions açık");
    if (/\bADMIN_MODE\b|admPanel/.test(src))  fails.push("release derlemesinde ADMIN kalıntısı var");
    if (warns.some(l => /ADMIN/.test(l)))     fails.push("release derlemesinde ADMIN uyarısı basıldı");
  }

  // --- gün üretimi gerçekten çalışıyor mu
  try {
    const s1 = w.buildDaySchedule(1), s30 = w.buildDaySchedule(30);
    if (!s1 || !s1.patients || !s1.patients.length) fails.push("gün 1 listesi boş");
    if (!s30 || !s30.patients || !s30.patients.length) fails.push("gün 30 listesi boş");
    console.log(`  gün 1  : ${s1.patients.length} hasta, hedef ${s1.goal}`);
    console.log(`  gün 30 : ${s30.patients.length} hasta, hedef ${s30.goal}`);
  } catch (e) { fails.push("buildDaySchedule hatası: " + e.message); }

  // --- safe-area okuması
  console.log(`  safe   : raw top=${w.__safeRawTop} bottom=${w.__safeRawBottom} → ` +
              `eff top=${w.__safeTop} bottom=${w.__safeBottom}`);
  if (w.__safeRawTop === undefined) fails.push("readSafeInsets çalışmamış (__safeRawTop tanımsız)");

  // --- güvenli alan mantığı: letterbox'ı AŞAN kısım eklenmeli, tamamı değil ---
  // jsdom env() bilmez (raw = 0), o yüzden prob'un padding'i elle sürülüp ölçülür.
  // 390×844'te 9:16 kolon: sh = 390/(9/16) = 693.3 → sy = (844−693.3)/2 = 75.3
  try {
    const probe = w.document.getElementById("safeprobe");
    if (!probe) fails.push("#safeprobe elemanı yok");
    else {
      const sy = (844 - 390 / (9 / 16)) / 2;
      const cases = [[0, 0], [59, 0], [100, 100 - sy]];   // [ham inset, beklenen etkin]
      for (const [raw, want] of cases) {
        probe.style.paddingTop = raw + "px";
        probe.style.paddingBottom = raw + "px";
        w.resize();
        const got = w.__safeTop;
        if (Math.abs(got - want) > 0.5)
          fails.push(`safe-area: ham ${raw}px → etkin ${got} (beklenen ${want.toFixed(1)})`);
      }
      probe.style.paddingTop = probe.style.paddingBottom = "0px";
      w.resize();
      console.log(`  safe-area mantığı: letterbox(${sy.toFixed(1)}px) içi yutuluyor, aşan kısım ekleniyor ✓`);
    }
  } catch (e) { fails.push("safe-area testi hatası: " + e.message); }

  console.log(`\n  self-test uyarısı: ${warns.length}`);
  warns.slice(0, 20).forEach(l => console.log("    ⚠ " + l));

  if (fails.length) { console.log("\nBAŞARISIZ:"); fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
  console.log("\nBOOT OK ✓");
  process.exit(0);
}, 2500);
