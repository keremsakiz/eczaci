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
  const lines = html.split("\n");
  const startIdx = lines.findIndex(l => l.includes("ADMIN BLOK BAŞLANGIÇ"));
  const endIdx   = lines.findIndex(l => l.includes("ADMIN BLOK BİTİŞ"));
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error("ADMIN blok sınırları bulunamadı (BAŞLANGIÇ/BİTİŞ şeritleri). " +
                    "Blok elle silindiyse bu kontrolü build.js'ten kaldır.");
  }
  // banner satırları: ═ şeridi işaretin hemen üstünde ve altında
  const from = (startIdx > 0 && lines[startIdx - 1].includes("═")) ? startIdx - 1 : startIdx;
  let to = endIdx;
  while (to + 1 < lines.length && lines[to + 1].includes("═")) to++;
  const removed = to - from + 1;
  lines.splice(from, removed + 1);   // +1: blok sonrası boş satır
  html = lines.join("\n");
  notes.push(`ADMIN blok silindi (${removed} satır)`);

  if (/\bADMIN_MODE\b/.test(html) || /admPanel/.test(html)) {
    throw new Error("ADMIN blok silindi ama geride ADMIN_MODE/admPanel referansı kaldı.");
  }

  // --- 3. konsol teşhisi kapat ---------------------------------------------
  const dbg = /(\n\s*debugDecisions:\s*)true(\s*,)/;
  if (!dbg.test(html)) throw new Error("CONFIG.debugDecisions satırı bulunamadı.");
  html = html.replace(dbg, "$1false$2");
  notes.push("CONFIG.debugDecisions = false");
}

// --- 4. yaz ----------------------------------------------------------------
// NOT: www/ SİLİNMEZ, üzerine yazılır. Bağlı klasörde dosya silme izni yok ve
// derlemenin buna ihtiyacı da yok — kaynakta olmayan bir asset www/'de kalırsa
// sadece ölü bayt olur, çıktının doğruluğunu etkilemez.
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });
fs.writeFileSync(path.join(OUT, "index.html"), html, "utf8");
let copied = 0;
for (const f of fs.readdirSync(path.join(ROOT, "assets"))) {
  const src = path.join(ROOT, "assets", f);
  if (f.startsWith(".") || !fs.statSync(src).isFile()) continue;
  fs.writeFileSync(path.join(OUT, "assets", f), fs.readFileSync(src));
  copied++;
}

const pngs = copied;
console.log(`[build] ${DEV ? "DEV" : "RELEASE"} → www/`);
notes.forEach(n => console.log(`[build]   · ${n}`));
console.log(`[build]   · index.html ${before} → ${html.length} bayt (${html.split("\n").length} satır)`);
console.log(`[build]   · assets/ ${pngs} dosya kopyalandı`);
