#!/usr/bin/env node
/**
 * `npx cap add ios` SONRASI çalışır. Capacitor'ın stok Info.plist'ini
 * bu oyunun ihtiyaçlarına göre yamalar. Fikirsiz (idempotent): tekrar
 * çalıştırmak aynı sonucu verir, ikinci bir kopya anahtar yazmaz.
 *
 *   node tools/ios-prep.js [plist-yolu]
 *
 * NEDEN her madde:
 *   CFBundleDisplayName            ana ekranda görünen ad
 *   UISupportedInterfaceOrientations  9:16 dikey oyun — yatay YOK
 *   UIStatusBarHidden              tam ekran; saat/pil oyunun HUD'ına biner
 *   UIViewControllerBasedStatusBarAppearance=false  yukarıdaki anahtarın
 *                                  geçerli olması için şart
 *   UIRequiresFullScreen           iPad Split View'da 9:16 kolon bozulur
 *   ITSAppUsesNonExemptEncryption  her yüklemede sorulan ihracat sorusunu kapatır
 */
const fs = require("fs");
const path = require("path");

const APP_NAME = "Eczacı";
const plistPath = process.argv[2] ||
  path.join(__dirname, "..", "ios", "App", "App", "Info.plist");

if (!fs.existsSync(plistPath)) {
  console.error(`[ios-prep] Info.plist yok: ${plistPath}\n` +
                `           Önce: npx cap add ios`);
  process.exit(1);
}
let s = fs.readFileSync(plistPath, "utf8");
const before = s;
const done = [];

/** <key>K</key> ile onu izleyen değer düğümünü bulur; yoksa null. */
function findKey(k) {
  const re = new RegExp(`([ \\t]*)<key>${k}</key>\\s*\\n?\\s*`, "");
  const m = re.exec(s);
  if (!m) return null;
  const valStart = m.index + m[0].length;
  // değer: <true/> | <false/> | <string>…</string> | <array>…</array> | <dict>…</dict>
  const rest = s.slice(valStart);
  const vm = /^(<true\/>|<false\/>|<string>[\s\S]*?<\/string>|<array>[\s\S]*?<\/array>|<dict>[\s\S]*?<\/dict>)/.exec(rest);
  if (!vm) return null;
  return { indent: m[1], keyStart: m.index, valStart, valEnd: valStart + vm[1].length, value: vm[1] };
}

function setKey(k, xml, label) {
  const hit = findKey(k);
  if (hit) {
    if (hit.value === xml) return;                       // zaten doğru
    s = s.slice(0, hit.valStart) + xml + s.slice(hit.valEnd);
  } else {
    const close = s.lastIndexOf("</dict>");
    s = s.slice(0, close) + `\t<key>${k}</key>\n\t${xml}\n` + s.slice(close);
  }
  done.push(label || k);
}

const PORTRAIT = "<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>";

setKey("CFBundleDisplayName", `<string>${APP_NAME}</string>`, `CFBundleDisplayName = ${APP_NAME}`);
setKey("UISupportedInterfaceOrientations", PORTRAIT, "yön: yalnız dikey (iPhone)");
setKey("UISupportedInterfaceOrientations~ipad", PORTRAIT, "yön: yalnız dikey (iPad)");
setKey("UIStatusBarHidden", "<true/>", "durum çubuğu gizli");
setKey("UIViewControllerBasedStatusBarAppearance", "<false/>", "durum çubuğu kontrolü plist'te");
setKey("UIRequiresFullScreen", "<true/>", "iPad Split View kapalı");
setKey("ITSAppUsesNonExemptEncryption", "<false/>", "ihracat uyumu: şifreleme yok");

if (s === before) { console.log("[ios-prep] Info.plist zaten hazır — değişiklik yok."); process.exit(0); }
fs.writeFileSync(plistPath, s, "utf8");
console.log("[ios-prep] " + path.relative(process.cwd(), plistPath) + " yamalandı:");
done.forEach(d => console.log("  · " + d));
