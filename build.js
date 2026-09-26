#!/usr/bin/env node
/**
 * ECZACI — yayın derlemesi.
 *
 *   node build.js            → www/ üretir  (ADMIN blok silinir, debugDecisions false)
 *   node build.js --dev      → www/ üretir  (kaynak birebir, hiçbir şey çıkarılmaz)
 *
 * Kaynak index.html'e ASLA yazmaz; çıktı yalnız www/ altına gider.
 * www/ bir türev klasördür — .gitignore'dadır, elle düzenlenmemelidir.
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SRC  = path.join(ROOT, "index.html");
const OUT  = path.join(ROOT, "www");
const DEV  = process.argv.includes("--dev");

// --- 1. kaynak -------------------------------------------------------------
let html = fs.readFileSync(SRC, "utf8");
const before = html.length;
const notes = [];

if (!DEV) {
  // --- 2. ADMIN blok — banner'dan banner'a, satır bazında --------------------
  // Sınırlar metinden bulunur, satır numarası GÖMÜLMEZ: blok büyüyüp küçülse de
  // derleme çalışmaya devam etsin.
  // ADMIN blok yalnız `admin-test` dalında bulunur; main'de hiç yoktur. Bu yüzden
  // blok YOKSA hata değil — atlanır. VARSA eksiksiz silinmesi şart: yarım silinmiş
  // bir blok sessiz bir ReferenceError'a dönüşür, o yüzden kalıntı kontrolü katı.
  const lines = html.split("\n");
  const startIdx = lines.findIndex(l => l.includes("ADMIN BLOK BAŞLANGIÇ"));
  const endIdx   = lines.findIndex(l => l.includes("ADMIN BLOK BİTİŞ"));
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // banner satırları: ═ şeridi işaretin hemen üstünde ve altında
    const from = (startIdx > 0 && lines[startIdx - 1].includes("═")) ? startIdx - 1 : startIdx;
    let to = endIdx;
    while (to + 1 < lines.length && lines[to + 1].includes("═")) to++;
    const removed = to - from + 1;
    lines.splice(from, removed + 1);   // +1: blok sonrası boş satır
    html = lines.join("\n");
    notes.push(`ADMIN blok silindi (${removed} satır)`);
  } else if (startIdx !== -1 || endIdx !== -1) {
    throw new Error("ADMIN blok şeritlerinden yalnız biri bulundu — blok yarım silinmiş olabilir.");
  } else {
    notes.push("ADMIN blok yok (main dalı) — atlandı");
  }

  if (/\bADMIN_MODE\b/.test(html) || /admPanel/.test(html)) {
    throw new Error("Geride ADMIN_MODE/admPanel referansı kaldı.");
  }

  // --- 3. konsol teşhisi kapat ---------------------------------------------
  const dbg = /(\n\s*debugDecisions:\s*)true(\s*,)/;
  if (!dbg.test(html)) throw new Error("CONFIG.debugDecisions satırı bulunamadı.");
  html = html.replace(dbg, "$1false$2");
  notes.push("CONFIG.debugDecisions = false");

  // --- 3b. boot self-test'lerini kapat (telefonda açılışı geciktiriyorlar) --------
  const st = /\nconst SELFTEST = true;/;
  if (!st.test(html)) throw new Error("const SELFTEST = true; satırı bulunamadı.");
  html = html.replace(st, "\nconst SELFTEST = false;");
  notes.push("SELFTEST = false (boot denetimleri yalnız geliştirmede)");
}

// --- 4. yaz ----------------------------------------------------------------
// NOT: www/ SİLİNMEZ, üzerine yazılır. Bağlı klasörde dosya silme izni yok ve
// derlemenin buna ihtiyacı da yok — kaynakta olmayan bir asset www/'de kalırsa
// sadece ölü bayt olur, çıktının doğruluğunu etkilemez.
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });
fs.writeFileSync(path.join(OUT, "index.html"), html, "utf8");
let copied = 0;
// Alt klasörler de kopyalanır: assets/fonts/OFL-*.txt (SIL OFL lisans metni uygulamayla
// dağıtılmak ZORUNDA; HAKKINDA ekranı oraya atıf yapıyor). Eskiden yalnız kök dosyalar gidiyordu.
(function copyDir(rel) {
  const dir = path.join(ROOT, "assets", rel);
  fs.mkdirSync(path.join(OUT, "assets", rel), { recursive: true });
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(".")) continue;
    const src = path.join(dir, f), st = fs.statSync(src);
    if (st.isDirectory()) { copyDir(path.join(rel, f)); continue; }
    if (!st.isFile()) continue;
    fs.writeFileSync(path.join(OUT, "assets", rel, f), fs.readFileSync(src));
    copied++;
  }
})("");

const pngs = copied;
console.log(`[build] ${DEV ? "DEV" : "RELEASE"} → www/`);
notes.forEach(n => console.log(`[build]   · ${n}`));
console.log(`[build]   · index.html ${before} → ${html.length} bayt (${html.split("\n").length} satır)`);
console.log(`[build]   · assets/ ${pngs} dosya kopyalandı`);
