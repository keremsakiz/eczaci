// iPad/telefon görüntüleme artefaktı: oyunun kendi index.html'i bir iframe'de,
// PNG'ler artefaktın yan dosyaları olarak servis edilir (srcdoc üst belgenin URL'sini
// taban alır, yani "assets/x.png" doğru çözülür).
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

// Radyo şarkısı: artefakt güvenlik politikası fetch'i engelleyebilir → base64 olarak göm.
// Radyo sesleri (şarkılar + reklam anonsları) — assets/radio_*.mp3 ve assets/ad_*.mp3 hepsi gömülür.
const RADIO_FILES_EMB = fs.readdirSync(path.join(ROOT, "assets"))
  .filter(f => /^(radio_|ad_).*\.mp3$/.test(f)).map(f => "assets/" + f);
const radioB64 = RADIO_FILES_EMB.length
  ? JSON.stringify(Object.fromEntries(RADIO_FILES_EMB.map(f => [f, fs.readFileSync(path.join(ROOT, f)).toString("base64")])))
  : "";
const RADIO_HOOK = radioB64
  ? '\ntry{window.__RADIO_EMBED=JSON.parse(window.parent.document.getElementById("radio-b64").textContent);}catch(e){}\n'
  : "";


// Açılışta ad girişi yerine ANA EKRAN: tasarımı görmek için açılıyor.
const HOOK = ';(function(){var n=0,t=setInterval(function(){' +
  'if(typeof game!=="undefined"&&game.state){if(!game.pharmacyName){setPharmacyName("AİLE");}if(game.state===STATE.NAMING)game.state=STATE.MENU;clearInterval(t);}' +
  'else if(++n>100)clearInterval(t);},40);})();\n';
const i = src.lastIndexOf("</script>");
src = src.slice(0, i) + HOOK + src.slice(i);

src = src.replace('"use strict";', '"use strict";' + RADIO_HOOK);
const game = src.split("</script>").join("@@ES@@");
const html = `<title>Eczacı Ana Ekran</title>
<style>
  html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}
  :root:not([data-theme="light"]){color-scheme:dark}
  #fr{position:fixed;inset:0;width:100%;height:100%;border:0;display:block}
</style>
<iframe id="fr" title="Eczacı"></iframe>
${radioB64 ? '<script type="text/plain" id="radio-b64">' + radioB64 + '</scr' + 'ipt>' : ""}
<script type="text/html" id="src">${game}</script>
<script>
  document.getElementById("fr").srcdoc =
    document.getElementById("src").textContent.split("@@ES@@").join("</"+"script>");
</script>
`;
fs.writeFileSync(process.argv[2], html);
console.log("yazıldı", (html.length/1024).toFixed(0)+" KB");
