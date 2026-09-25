// Canlı ayar panelı artefaktını üretir: oyunun GERÇEK menü kodu bir iframe'de koşar,
// panel onun ST / CONFIG.colors nesnelerini doğrudan oynar. Ara katman yok.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

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


// Oyunun iç nesnelerini iframe dışına aç.
// ST: AKTİF yerleşim — PNG arka plan yüklüyse STB, değilse kod sokağının ST'si.
// "ready" asset'ler yüklendikten SONRA gönderilir; yoksa panel yanlış nesneyi taban alır.
const HOOK = ';window.__G={get ST(){return menuST();},get CONFIG(){return CONFIG;},' +
             'get game(){return game;},get layout(){return layout;},get STATE(){return STATE;},' +
             'setName:function(v){setPharmacyName(v);},hasBg:function(){return !!menuBg();},' +
             'setTime:function(v){setMenuTime(v);},timeNow:function(){return menuShownPhase();}};' +
             '(function(){var n=0,t=setInterval(function(){' +
             'if(Assets.loaded>=Assets.total||++n>120){clearInterval(t);window.parent.postMessage({eczaci:"ready"},"*");}' +
             '},50);})();\n';
const i = src.lastIndexOf("</script>");
if (i < 0) throw new Error("kapanış script etiketi yok");
let game = src.slice(0, i) + HOOK + src.slice(i);
game = game.replace('"use strict";', '"use strict";' + RADIO_HOOK);

// <script type="text/html"> içine gömülecek: kapanış etiketini gizle.
game = game.split("</script>").join("@@ES@@");

const SLIDERS = {
  "Sokak": [
    ["roof",     "Çatı çizgisi",      0.15, 0.50, 0.005],
    ["wallTop",  "Cephe üst",         0.20, 0.50, 0.005],
    ["wallBot",  "Cephe alt",         0.80, 1.00, 0.005],
    ["awning",   "Tente",             0.25, 0.55, 0.005],
    ["lamp",     "Fener yüksekliği",  0.28, 0.55, 0.005],
    ["lampX",    "Fener yanı",        0.02, 0.25, 0.002],
    ["lampW",    "Fener boyu",        0.030, 0.110, 0.002],
    ["lampGlow", "Fener ışığı",       0.06, 0.40, 0.005],
    ["vitrin",   "Vitrin üst",        0.30, 0.65, 0.005],
    ["vitrinH",  "Vitrin yüksekliği", 0.04, 0.22, 0.005],
    ["moonX",    "Ay — yatay",        0.05, 0.95, 0.005],
    ["moonY",    "Ay — dikey",        0.01, 0.30, 0.005],
    ["moonR",    "Ay boyu",           0.01, 0.09, 0.002]
  ],
  "Tabela": [
    ["tabela",   "Tabela üst",        0.02, 0.32, 0.005],
    ["tabelaH",  "Tabela yüksekliği", 0.06, 0.24, 0.005],
    ["tabelaW",  "Tabela eni",        0.40, 0.98, 0.005]
  ],
  "Butonlar": [
    ["btnTop",   "Yığın başlangıcı",  0.35, 0.78, 0.005],
    ["btnGap",   "Butonlar arası",    0.000, 0.050, 0.002],
    ["btnH1",    "1. buton boyu",     0.040, 0.100, 0.002],
    ["btnH2",    "2.–3. buton boyu",  0.040, 0.100, 0.002],
    ["btnH3",    "Ad butonu boyu",    0.040, 0.100, 0.002],
    ["recBottom","Rekor paneli alt",  0.80, 1.00, 0.005],
    ["nobetY",   "Nöbet levhası",     0.28, 0.52, 0.005]
  ]
};

const COLORS = [
  ["skyTop",      "Gök — tepe"],
  ["skyMid",      "Gök — orta"],
  ["skyWarm",     "Gök — sıcak"],
  ["skyLow",      "Gök — dip"],
  ["paveTop",     "Kaldırım üst"],
  ["paveLow",     "Kaldırım alt"],
  ["wallTop",     "Cephe üst"],
  ["wallMid",     "Cephe orta"],
  ["wallLow",     "Cephe alt"],
  ["awningRed",   "Tente kırmızı"],
  ["awningCream", "Tente krem"],
  ["rxRed",       "ECZANE kırmızı"],
  ["rxRedMid",    "Kabartma orta"],
  ["rxRedDeep",   "Kabartma dip"],
  ["signFace",    "Tabela yüzü"],
  ["signInk",     "Ad mürekkebi"],
  ["neon",        "Vurgu (neon)"],
  ["cream",       "Buton yazısı"]
];

function sliderRows(list) {
  return list.map(([k, label, min, max, step]) =>
    `<div class="row"><label for="s_${k}">${label}</label>` +
    `<input type="range" id="s_${k}" data-k="${k}" min="${min}" max="${max}" step="${step}">` +
    `<output id="o_${k}"></output></div>`).join("\n");
}

const tabs = Object.keys(SLIDERS);

const html = `<title>Eczacı Menü Ayarı</title>
<style>
:root{
  --bg:#12101a; --panel:#1b1826; --line:#2e2a3d; --ink:#f3ece1; --dim:#9d93a8;
  --accent:#ff9d2f;
}
:root:not([data-theme="light"]){ color-scheme: dark; }
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{background:var(--bg);color:var(--ink);font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  height:100dvh;display:flex;flex-direction:column;overflow:hidden}
#stage{flex:1 1 auto;min-height:0;position:relative;background:#000}
#stage iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}
#bar{flex:0 0 auto;display:flex;gap:6px;padding:8px 10px;background:var(--panel);
  border-top:1px solid var(--line);overflow-x:auto;scrollbar-width:none}
#bar::-webkit-scrollbar{display:none}
.chip{flex:0 0 auto;padding:7px 12px;border:1px solid var(--line);border-radius:999px;
  background:transparent;color:var(--dim);font-size:13px;font-weight:600;cursor:pointer}
.chip.on{color:#12101a;background:var(--accent);border-color:var(--accent)}
#panel{flex:0 0 44%;min-height:0;overflow-y:auto;background:var(--panel);
  border-top:1px solid var(--line);padding:10px 12px 22px;-webkit-overflow-scrolling:touch}
body.collapsed #panel{display:none}
body.collapsed #stage{flex:1 1 100%}
.row{display:grid;grid-template-columns:1fr 1.25fr 52px;align-items:center;gap:8px;padding:5px 0}
.row label{font-size:13px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row output{font-size:12px;font-variant-numeric:tabular-nums;color:var(--ink);text-align:right}
input[type=range]{width:100%;accent-color:var(--accent);height:26px}
.crow{display:grid;grid-template-columns:1fr 46px;align-items:center;gap:8px;padding:4px 0}
.crow label{font-size:13px;color:var(--dim)}
input[type=color]{width:46px;height:30px;border:1px solid var(--line);border-radius:7px;background:transparent;padding:2px}
.sec{display:none}
.sec.on{display:block}
.tools{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.btn{flex:1 1 auto;padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:#252034;
  color:var(--ink);font-size:13px;font-weight:600;cursor:pointer}
.btn.pri{background:var(--accent);color:#12101a;border-color:var(--accent)}
#nameIn{width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:#252034;
  color:var(--ink);font-size:14px;margin-bottom:10px;text-transform:uppercase}
#out{width:100%;min-height:150px;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;
  background:#0f0d16;color:#c8f0c0;border:1px solid var(--line);border-radius:9px;padding:9px;
  white-space:pre;overflow:auto}
#msg{font-size:12px;color:var(--dim);margin-top:8px;min-height:16px}
@media (min-width:900px){ body{flex-direction:row} #stage{flex:1 1 auto}
  #panel{flex:0 0 380px;border-top:0;border-left:1px solid var(--line)}
  #bar{position:absolute;bottom:0;left:0;right:380px;border-top:1px solid var(--line)} }
</style>

<div id="stage"><iframe id="fr" title="Eczacı menü"></iframe></div>

<div id="bar">
  <button class="chip" data-st="MENU">Ana ekran</button>
  <button class="chip" data-st="NAMING">Ad girişi</button>
  <button class="chip" data-st="HOWTO">Nasıl oynanır</button>
  <button class="chip" id="time">Saat: otomatik</button>
  <button class="chip" id="sign">Tabela: kutu</button>
  <button class="chip" id="split">Alt butonlar: yan yana</button>
  <button class="chip" id="fold">Paneli gizle</button>
</div>

<div id="panel">
  <div class="tools">
    ${tabs.map((t, n) => `<button class="btn tab${n === 0 ? " pri" : ""}" data-tab="${n}">${t}</button>`).join("")}
    <button class="btn tab" data-tab="${tabs.length}">Renkler</button>
    <button class="btn tab" data-tab="${tabs.length + 1}">Çıktı</button>
  </div>

${tabs.map((t, n) => `  <div class="sec${n === 0 ? " on" : ""}" data-sec="${n}">\n${sliderRows(SLIDERS[t])}\n  </div>`).join("\n")}

  <div class="sec" data-sec="${tabs.length}">
${COLORS.map(([k, l]) => `    <div class="crow"><label for="c_${k}">${l}</label><input type="color" id="c_${k}" data-c="${k}"></div>`).join("\n")}
  </div>

  <div class="sec" data-sec="${tabs.length + 1}">
    <input id="nameIn" maxlength="14" value="AİLE" placeholder="Eczane adı (önizleme)">
    <div class="tools">
      <button class="btn pri" id="save">Kaydet · Claude'a gönder</button>
      <button class="btn" id="reset">Başa dön</button>
    </div>
    <pre id="out"></pre>
    <div id="msg"></div>
  </div>
</div>

${radioB64 ? '<script type="text/plain" id="radio-b64">' + radioB64 + '</scr' + 'ipt>' : ""}
<script type="text/html" id="gamesrc">${game}</script>
<script>
(function(){
  var SL = ${JSON.stringify(SLIDERS)};
  var CL = ${JSON.stringify(COLORS)};
  var fr = document.getElementById("fr");
  var W = null, base = null, ready = false;

  fr.srcdoc = document.getElementById("gamesrc").textContent.split("@@ES@@").join("</"+"script>");

  window.addEventListener("message", function(e){
    if (!e.data || e.data.eczaci !== "ready") return;
    W = fr.contentWindow;
    base = JSON.parse(JSON.stringify({ st: W.__G.ST, colors: pickColors() }));
    ready = true;
    // İlk açılışta oyun AD ekranından başlar (adı yok). Ayar panelı için başlangıç
    // ana ekran olmalı: örnek bir ad koyup MENU'ye geç.
    W.__G.setName(document.getElementById("nameIn").value || "AİLE");
    W.__G.game.state = W.__G.STATE.MENU;
    syncUI();
  });

  function pickColors(){
    var o = {}; CL.forEach(function(p){ o[p[0]] = W.__G.CONFIG.colors[p[0]]; }); return o;
  }
  function syncUI(){
    Object.keys(SL).forEach(function(t){
      SL[t].forEach(function(r){
        var el = document.getElementById("s_" + r[0]);
        var has = (r[0] in W.__G.ST);
        el.closest(".row").style.display = has ? "" : "none";
        if (!has) return;
        el.value = W.__G.ST[r[0]];
        document.getElementById("o_" + r[0]).textContent = (+el.value).toFixed(3);
      });
    });
    CL.forEach(function(p){
      var v = W.__G.CONFIG.colors[p[0]];
      if (/^#[0-9a-f]{6}$/i.test(v)) document.getElementById("c_" + p[0]).value = v;
    });
    dumpOut();
  }

  document.querySelectorAll('input[type=range]').forEach(function(el){
    el.addEventListener("input", function(){
      if (!ready) return;
      W.__G.ST[el.dataset.k] = +el.value;
      document.getElementById("o_" + el.dataset.k).textContent = (+el.value).toFixed(3);
      dumpOut();
    });
  });
  document.querySelectorAll('input[type=color]').forEach(function(el){
    el.addEventListener("input", function(){
      if (!ready) return;
      W.__G.CONFIG.colors[el.dataset.c] = el.value;
      dumpOut();
    });
  });

  document.querySelectorAll('.chip[data-st]').forEach(function(b){
    b.addEventListener("click", function(){
      if (!ready) return;
      document.querySelectorAll('.chip[data-st]').forEach(function(x){ x.classList.remove("on"); });
      b.classList.add("on");
      var s = b.dataset.st;
      if (s === "NAMING") W.__G.game.nameInput = W.__G.game.pharmacyName || "";
      W.__G.game.state = W.__G.STATE[s];
    });
  });
  document.getElementById("fold").addEventListener("click", function(){
    document.body.classList.toggle("collapsed");
    this.textContent = document.body.classList.contains("collapsed") ? "Paneli aç" : "Paneli gizle";
  });
  document.querySelectorAll(".tab").forEach(function(b){
    b.addEventListener("click", function(){
      document.querySelectorAll(".tab").forEach(function(x){ x.classList.remove("pri"); });
      b.classList.add("pri");
      document.querySelectorAll(".sec").forEach(function(s){
        s.classList.toggle("on", s.dataset.sec === b.dataset.tab);
      });
    });
  });
  document.getElementById("nameIn").addEventListener("input", function(){
    if (!ready) return;
    W.__G.setName(this.value || "AİLE");
  });
  document.getElementById("reset").addEventListener("click", function(){
    if (!ready) return;
    Object.keys(base.st).forEach(function(k){ W.__G.ST[k] = base.st[k]; });
    Object.keys(base.colors).forEach(function(k){ W.__G.CONFIG.colors[k] = base.colors[k]; });
    syncUI(); syncToggles();
    document.getElementById("msg").textContent = "Başlangıç değerlerine dönüldü.";
  });

  function diff(){
    var d = { st: {}, colors: {} };
    if (!ready) return d;
    Object.keys(base.st).forEach(function(k){
      var v = W.__G.ST[k], b = base.st[k];
      if (typeof v === "string") { if (v !== b) d.st[k] = v; }
      else if (Math.abs(v - b) > 1e-9) d.st[k] = +v.toFixed(4);
    });
    Object.keys(base.colors).forEach(function(k){
      if (W.__G.CONFIG.colors[k] !== base.colors[k]) d.colors[k] = W.__G.CONFIG.colors[k];
    });
    return d;
  }
  function dumpOut(){
    var d = diff(), n = Object.keys(d.st).length + Object.keys(d.colors).length;
    document.getElementById("out").textContent = n === 0
      ? "Henüz değişiklik yok.\\nKaydırıcıları oynat, buraya yalnız DEĞİŞENLER yazılır."
      : JSON.stringify(d, null, 2);
  }

  document.getElementById("save").addEventListener("click", async function(){
    var msg = document.getElementById("msg");
    var d = diff();
    msg.textContent = "Kaydediliyor…";
    try {
      var db = await claude.use("db");
      if (!db) { msg.textContent = "Kayıt bu görünümde açık değil — yukarıdaki metni kopyala."; return; }
      await db.doc("menu/ayar").set({ st: d.st, colors: d.colors, at: new Date().toISOString() });
      msg.textContent = "Kaydedildi. Claude okuyabilir.";
    } catch (err) {
      msg.textContent = "Kaydedilemedi (" + (err && err.code ? err.code : "hata") + ") — metni kopyala.";
    }
  });

  function syncToggles(){
    if (!ready) return;
    var bg = W.__G.hasBg(), st = W.__G.ST;
    document.getElementById("sign").style.display = bg ? "" : "none";
    document.getElementById("split").style.display = ("btnSplit" in st) ? "" : "none";
    document.getElementById("sign").textContent = "Tabela: " + (st.signStyle === "fascia" ? "cephe" : "kutu");
    document.getElementById("split").textContent = "Alt butonlar: " + (st.btnSplit ? "yan yana" : "alt alta");
  }
  var TIMES = [null, "day", "night"], TNAME = { "null": "otomatik", day: "gündüz", night: "gece" }, ti = 0;
  document.getElementById("time").addEventListener("click", function(){
    if (!ready) return;
    ti = (ti + 1) % TIMES.length;
    W.__G.setTime(TIMES[ti]);
    this.textContent = "Saat: " + TNAME[String(TIMES[ti])];
  });
  document.getElementById("sign").addEventListener("click", function(){
    if (!ready) return;
    W.__G.ST.signStyle = W.__G.ST.signStyle === "fascia" ? "lightbox" : "fascia";
    syncToggles(); dumpOut();
  });
  document.getElementById("split").addEventListener("click", function(){
    if (!ready) return;
    W.__G.ST.btnSplit = W.__G.ST.btnSplit ? 0 : 1;
    syncToggles(); dumpOut();
  });
  window.addEventListener("message", function(e){ if (e.data && e.data.eczaci === "ready") setTimeout(syncToggles, 0); });
  document.querySelector('.chip[data-st="MENU"]').classList.add("on");
})();
</script>
`;

const out = process.argv[2] || path.join(ROOT, "tuner.html");
fs.writeFileSync(out, html);
console.log("yazıldı:", out, (html.length / 1024).toFixed(0) + " KB");
