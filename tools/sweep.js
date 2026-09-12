/**
 * CONFIG taraması — bir ya da iki anahtarın ızgarasında ölçüm alır.
 *
 *   node tools/sweep.js --grid "beggarReturnMul=2.5,3,3.5;beggarReturnChance=0.55,0.7" \
 *                       --compare help --seeds 40 --profiles A,B
 *
 *   --compare help|news  → eşleştirilmiş fark (politika açık/kapalı) ölçülür,
 *                          hücrede profil başına yüzde fark yazar
 *   (yoksa)              → düz kariyer ölçümü, hücrede skor ve sezon medyanı
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { stats } = require("./harness.js");

// HER HÜCRE AYRI SÜREÇTE koşar. Sebep: jsdom penceresi Node'da tam serbest
// bırakılmıyor; onlarca yükleme aynı süreçte heap'i patlatıyor (ölçüldü: 18 hücrede
// "heap out of memory"). Süreç sınırı en ucuz ve en kesin temizlik.
function runCell(args) {
  const out = path.join(os.tmpdir(), "eczaci-sweep-" + process.pid + "-" + Math.random().toString(36).slice(2) + ".json");
  execFileSync(process.execPath, [path.join(__dirname, "harness.js"), ...args, "--json", out],
               { stdio: ["ignore", "ignore", "inherit"], maxBuffer: 1 << 26 });
  const j = JSON.parse(fs.readFileSync(out, "utf8"));
  fs.unlinkSync(out);
  return j;
}

function parse(argv) {
  const o = { grid: [], seeds: 40, profiles: ["A", "B"], compare: null, news: true, help: true,
              file: "index.html", set: {} };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--grid") {
      for (const part of argv[++i].split(";")) {
        const [k, vs] = part.split("=");
        o.grid.push({ key: k.trim(), values: vs.split(",").map(Number) });
      }
    }
    else if (a === "--seeds") o.seeds = parseInt(argv[++i], 10);
    else if (a === "--profiles") o.profiles = argv[++i].split(",");
    else if (a === "--compare") o.compare = argv[++i];
    else if (a === "--set") { const [k, v] = argv[++i].split("="); o.set[k] = parseFloat(v); }
    else if (a === "--no-news") o.news = false;
    else if (a === "--no-help") o.help = false;
  }
  if (!o.grid.length) throw new Error("--grid zorunlu");
  return o;
}

function cells(grid) {
  let out = [{}];
  for (const g of grid) {
    const next = [];
    for (const base of out) for (const v of g.values) next.push(Object.assign({}, base, { [g.key]: v }));
    out = next;
  }
  return out;
}

const TL = n => Math.round(n).toLocaleString("tr-TR") + "₺";

function main() {
  const o = parse(process.argv);
  const combos = cells(o.grid);
  const header = o.grid.map(g => g.key).join(" · ");
  console.log(`\nTARAMA — ${combos.length} hücre × ${o.seeds} tohum · ${header}` +
              (o.compare ? ` · eşleştirilmiş fark (${o.compare})` : ""));
  console.log("─".repeat(92));
  const keys = o.grid.map(g => g.key);
  console.log(keys.map(k => k.slice(0, 20).padEnd(21)).join("") + "│ " +
              o.profiles.map(p => p.padEnd(o.compare ? 16 : 22)).join(""));
  console.log("─".repeat(92));

  const rows = [];
  for (const c of combos) {
    const base = Object.assign({}, o, { set: Object.assign({}, o.set, c) });
    let cellTxt = [], rec = { combo: c, by: {} };
    const common = ["--seeds", String(o.seeds), "--profiles", o.profiles.join(",")];
    for (const k in base.set) common.push("--set", k + "=" + base.set[k]);
    if (!o.news) common.push("--no-news");
    if (o.compare) {
      const j = runCell([...common, "--compare", o.compare]);
      for (const p of o.profiles) {
        const a = j.on[p], b = j.off[p];
        const ma = stats(a.map(x => x.score)).mean, mb = stats(b.map(x => x.score)).mean;
        let win = 0; for (let i = 0; i < a.length; i++) if (a[i].score > b[i].score) win++;
        const pct = mb ? (ma - mb) / mb * 100 : 0;
        rec.by[p] = { pct, win, n: a.length, on: ma, off: mb };
        cellTxt.push((pct.toFixed(1) + "%  " + win + "/" + a.length).padEnd(16));
      }
    } else {
      const j = runCell([...common, ...(o.help ? [] : ["--no-help"])]);
      for (const p of o.profiles) {
        const sc = stats(j[p].map(x => x.score)), se = stats(j[p].map(x => x.seasons));
        const repDeath = j[p].filter(x => x.reason === "reputation").length;
        rec.by[p] = { score: sc.mean, seasons: se.med, cv: sc.cv, repDeath, n: j[p].length };
        cellTxt.push((TL(sc.mean) + " " + se.med + "sz it%" +
                      Math.round(repDeath / j[p].length * 100)).padEnd(22));
      }
    }
    rows.push(rec);
    console.log(keys.map(k => String(c[k]).padEnd(21)).join("") + "│ " + cellTxt.join(""));
  }
  console.log("─".repeat(92));
  return rows;
}

if (require.main === module) main();
module.exports = { main };
