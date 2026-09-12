/**
 * index.html'i jsdom içinde ÇALIŞTIRIR ve oyunun kendi fonksiyonlarını dışarı verir.
 *
 * Oyun kodu YENİDEN YAZILMAZ — buildDaySchedule, checkOrder, update, beginSeason…
 * hepsi dosyadaki orijinal koddur. Bu modül yalnız iki şey yapar:
 *   1. Çizim yüzeyini stub'lar (canvas 2D bağlamı, Image, rAF)
 *   2. `const` ile tanımlı iç nesneleri (CONFIG, MEDICINES, game…) window.__G'ye açar
 *
 * (2) için kaynak dosyaya DOKUNULMAZ: HTML metni belleğe okunur, kapanış </script>
 * etiketinden hemen önce tek satırlık bir dışa-aktarım eklenir ve jsdom'a o metin verilir.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const EXPORT_LINE =
  ";window.__G={CONFIG,MEDICINES,GROUPS,SYMPTOMS,UPGRADES,UPGRADE_BY_ID,STATE," +
  "get game(){return game;},get layout(){return layout;}};";

function stubCtx() {
  const target = {
    canvas: null,
    measureText: (t) => ({
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

/**
 * @param {object}  o
 * @param {string}  o.file     yüklenecek HTML (varsayılan index.html)
 * @param {boolean} o.animate  true ise requestAnimationFrame gerçek çalışır (render döngüsü
 *                             döner). Ölçüm için FALSE: loop() hiç koşmaz, update()'i
 *                             çağıran biziz, yani zaman adımı bizim kontrolümüzde.
 * @returns {{window, logs, G}}
 */
function loadGame(o) {
  o = o || {};
  const file = o.file || "index.html";
  let html = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const close = html.lastIndexOf("</script>");
  if (close < 0) throw new Error("kapanış </script> bulunamadı: " + file);
  html = html.slice(0, close) + EXPORT_LINE + "\n" + html.slice(close);

  const logs = { warn: [], error: [], log: [] };
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => logs.error.push("[jsdomError] " + (e && e.message)));
  ["warn", "error", "log"].forEach(lvl => vc.on(lvl, (...a) => logs[lvl].push(a.map(String).join(" "))));

  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.HTMLCanvasElement.prototype.getContext = function () { const c = stubCtx(); c.canvas = this; return c; };
      w.devicePixelRatio = o.dpr || 3;
      Object.defineProperty(w, "innerWidth",  { value: o.width  || 390, configurable: true });
      Object.defineProperty(w, "innerHeight", { value: o.height || 844, configurable: true });
      if (!o.animate) {
        // Render döngüsünü hiç başlatma: ölçüm çizime bağlı değil ve her kare
        // yüzlerce stub çağrısı demek. update()'i harness tek tek çağırır.
        w.requestAnimationFrame = function () { return 0; };
        w.cancelAnimationFrame = function () {};
      }
      class FakeImage {
        constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; }
        set src(v) { this._src = v; setTimeout(() => this.onerror && this.onerror(new Error("stub")), 0); }
        get src() { return this._src; }
        addEventListener(t, f) { if (t === "error") this.onerror = f; }
      }
      w.Image = FakeImage;
    }
  });

  const w = dom.window;
  if (!w.__G) throw new Error("window.__G kurulamadı — dışa aktarım satırı çalışmamış");
  return { window: w, logs, G: w.__G, dom };
}

module.exports = { loadGame, stubCtx };
