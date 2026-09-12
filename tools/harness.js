/**
 * ECZACI — denge ölçüm harness'ı (DURUM.md §14.1).
 *
 * Oyunun GERÇEK fonksiyonlarını çalıştırır: buildDaySchedule, update, checkOrder,
 * rejectPrescription, beginSeason, tryStartNextSeason, placeDepotOrder, buyUpgrade,
 * beggarPayCollect… hiçbiri yeniden yazılmadı. Bot yalnız KARAR verir; zamanı ve
 * durumu oyunun kendi update() döngüsü yürütür.
 *
 * Botun rastgeleliği oyununkinden BAĞIMSIZ bir mulberry32'dir — gün üretimini bozmaz.
 *
 *   node tools/harness.js                        → 4 profil × 20 tohum kariyer tablosu
 *   node tools/harness.js --seeds 60             → tohum sayısı
 *   node tools/harness.js --profiles A,B         → alt küme
 *   node tools/harness.js --set nightFakeRateCap=0.75 --set priceStepMax=0.3
 *   node tools/harness.js --no-news              → zam haberini kullanma
 *   node tools/harness.js --no-help              → dilenciye hiç yardım etme
 *   node tools/harness.js --json out.json
 */
const { loadGame } = require("./gamevm.js");

// ---------------------------------------------------------------- ayarlar
const DT = 0.5;              // update() zaman adımı (sn)
const MAX_SEASONS = 12;      // kariyer üst sınırı (A profili buna dayanmamalı)
const TICK_GUARD = 400000;   // sonsuz döngü sigortası (gün başına)

// ---------------------------------------------------------------- bot RNG
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- profiller
// A  kusursuz            → tavan/doyma ölçümü
// B  sabit %85 (i.i.d.)  → "iyi oyuncu" referansı
// B2 korelasyonlu kötü seri: %25 ihtimalle kötü gün (%65), diğer günler %88
// C  %70                 → "vasat oyuncu", ölmesi beklenen
const PROFILES = {
  A:  { key: "A",  acc: () => 1.00 },
  B:  { key: "B",  acc: () => 0.85 },
  "B'":{ key: "B'", acc: null, badDayChance: 0.25, badAcc: 0.65, goodAcc: 0.88 },
  C:  { key: "C",  acc: () => 0.70 }
};

// ---------------------------------------------------------------- yardımcılar
function plannedIds(G, p) {
  // Botun hastaya VERECEĞİ liste. expectedMedicineIds() ile aynı mantık, ama aktif
  // hasta yerine herhangi bir hasta için (sabah stok ihtiyacı çıkarılırken lazım).
  const r = p.request;
  if (!r || r.type === "beggar" || r.type === "beggarpay") return [];
  const out = [];
  if (r.type === "prescription" || r.type === "medula") {
    for (const it of r.items) for (let i = 0; i < it.qty; i++) out.push(it.id);
    return out;
  }
  for (const it of (r.items || [{ symptom: r.symptom, qty: 1 }])) {
    const m = G.MEDICINES.find(x => x.category === it.symptom.category);
    if (m) for (let i = 0; i < it.qty; i++) out.push(m.id);
  }
  return out;
}

function haveStock(G, ids) {
  const need = {};
  for (const id of ids) need[id] = (need[id] || 0) + 1;
  for (const id in need) if ((G.game.stock[id] || 0) < need[id]) return false;
  return true;
}

/** Aynı adette ama BİR kalemi yanlış kategoriden olan liste (stokta olan bir ilaçla). */
function wrongList(G, ids) {
  if (!ids.length) return null;
  const firstMed = G.MEDICINES.find(m => m.id === ids[0]);
  const badCat = firstMed ? firstMed.category : null;
  const sub = G.MEDICINES.find(m => m.category !== badCat && (G.game.stock[m.id] || 0) > 0 &&
                                    ids.indexOf(m.id) < 0);
  if (!sub) return null;
  const out = ids.slice();
  out[0] = sub.id;
  return haveStock(G, out) ? out : null;
}

// ---------------------------------------------------------------- sabah rutini
/** Hedef stoğa kadar sipariş ver; para bittiğinde durur. Rezerv UYGULANMAZ. */
function buyToTarget(w, G, need, factor, onlyIds) {
  const g = G.game, maxS = w.effMaxStock();
  const ids = Object.keys(need).sort((a, b) => need[b] - need[a]);
  g.depotPending = {};
  for (const id of ids) {
    if (onlyIds && onlyIds.indexOf(id) < 0) continue;
    const target = Math.min(maxS, Math.ceil(need[id] * factor));
    const gap = target - (g.stock[id] || 0);
    if (gap > 0) g.depotPending[id] = gap;
  }
  // Bütçeye sığdır: en pahalı kalemden kırparak sepeti küçült.
  let guard = 0;
  while (w.depotOrderTotal() > g.money && guard++ < 5000) {
    let worst = null, worstCost = -1;
    for (const id in g.depotPending) {
      if (!g.depotPending[id]) continue;
      const m = w.getMedicine(id);
      const c = m ? w.medCost(m) : 0;
      if (c > worstCost) { worstCost = c; worst = id; }
    }
    if (!worst) break;
    g.depotPending[worst]--;
  }
  w.placeDepotOrder();
  g.depotPending = {};
}

function morning(w, G, bot) {
  const g = G.game, C = G.CONFIG, day = g.dayNumber;
  const sch = g.daySchedule;
  if (!sch) return;

  // 1) BUGÜNÜN gerçek listesinden ihtiyaç → ×1.5 payla stok tamamla.
  //    Bu adım bedel rezervinden ETKİLENMEZ: rafı boş bırakmak itibardan öldürüyor,
  //    o zaman bedeli ödeyecek sezon da kalmıyor (ölçüldü).
  const need = {};
  for (const p of sch.patients) for (const id of plannedIds(G, p)) need[id] = (need[id] || 0) + 1;
  buyToTarget(w, G, need, 1.5);

  // 2) Zam haberi: YARIN alışı artacak kategorilerden, bir sonraki tura kadar gerçekten
  //    satılacak miktarın %20'si kadar fazladan al. Sezonun son 2 gününde HİÇ alma —
  //    devredilemeyen stok yakılmış nakittir… ama stok sezonlar arası DEVREDER, o yüzden
  //    yalnız kariyerin son sezonu bilinmediğinden sezon sonu kısıtı uygulanmaz.
  if (bot.useNews) {
    const round = w.priceRoundOn(day + 1);
    if (round) {
      const upCats = round.cats.filter(c => c.up).map(c => c.category);
      if (upCats.length) {
        const ahead = {};
        const horizon = C.priceUpdateEvery;             // bir sonraki tura kadar
        for (const id in need) {
          const m = w.getMedicine(id);
          if (!m || upCats.indexOf(m.category) < 0) continue;
          ahead[id] = Math.ceil(need[id] * horizon * 0.20);
        }
        if (Object.keys(ahead).length) {
          const combined = {};
          for (const id in ahead) combined[id] = (g.stock[id] || 0) + ahead[id];
          buyToTarget(w, G, combined, 1, Object.keys(ahead));
        }
      }
    }
  }

  // 3) Geliştirme: yalnız rezervin ÜSTÜNDEKİ fazladan. Sezonun son 3 gününde rezerve
  //    sonraki sezonun ruhsat bedeli de eklenir (yoksa geliştirmeye harcanan para
  //    kariyeri bitirir).
  let reserve = 20 * G.__avgCost;
  if (day > C.seasonDays - 3) reserve += w.nextSeasonFee();
  let guard = 0;
  while (guard++ < 50) {
    let best = null, bestCost = Infinity;
    for (const u of G.UPGRADES) {
      const cur = w.upgradeLevel(u.id);
      if (cur >= u.maxLevel) continue;
      const cost = w.upgradeCost(u.id, cur + 1);
      if (cost < bestCost) { bestCost = cost; best = u; }
    }
    if (!best || g.money - bestCost < reserve) break;
    if (!w.buyUpgrade(best.id)) break;
  }
}

// ---------------------------------------------------------------- karar anı
function act(w, G, bot, ctx) {
  const g = G.game;
  if (g.feedback) return;
  const p = w.activePatient();
  if (!p) return;
  const t = p.request.type;

  if (t === "beggarpay") { w.beggarPayCollect(); return; }

  if (t === "beggar") {
    if (!bot.help) { w.beggarRefuse(false); return; }
    // Stok bolsa ilaç, değilse para, ikisi de yoksa reddet.
    const gift = w.beggarGiftMedicine();
    const plenty = gift && (g.stock[gift.id] || 0) >= 3;
    if (plenty) w.beggarGiveMedicine();
    else if (g.money >= G.CONFIG.beggarMoneyGive) w.beggarGiveMoney();
    else if (gift) w.beggarGiveMedicine();
    else w.beggarRefuse(false);
    return;
  }

  const ok = ctx.rng() < ctx.acc;          // bu kararı doğru mu yapıyor

  if (t === "prescription" && !p.decided) {
    const shouldReject = !!p.request.fake;
    const doReject = ok ? shouldReject : !shouldReject;
    if (doReject) { w.rejectPrescription(); return; }
    w.approvePrescription();
    // onaydan sonra aynı tick'te servise geç
  }
  if (t === "prescription" && p.decided !== "approve") return;

  // --- servis ---
  const want = w.expectedMedicineIds();
  if (!want.length) return;
  let give = null;
  if (ok) give = haveStock(G, want) ? want : null;
  else    give = wrongList(G, want);
  // Raf yetmiyorsa hiç dokunma: hasta sabrı bitip küser (angryRepLoss). Gerçek oyuncu
  // kısmi/yanlış servis de yapabilir; bu model bir tık daha serttir (DURUM.md §14.1).
  if (!give) return;
  g.counter = give.slice();
  w.checkOrder();
}

// ---------------------------------------------------------------- gün / kariyer
function runDay(w, G, bot, ctx) {
  const g = G.game, S = G.STATE;
  let guard = 0;
  while (g.state === S.PLAYING && guard++ < TICK_GUARD) {
    act(w, G, bot, ctx);
    w.update(DT);
  }
  if (guard >= TICK_GUARD) throw new Error("gün bitmedi (tick sigortası) — gün " + g.dayNumber);
}

function runCareer(w, G, profile, seed, bot) {
  const g = G.game, S = G.STATE;
  w.newRunSeed = function () { return seed >>> 0 || 1; };   // kariyer tohumunu sabitle
  w.startNewCareer();

  const ctx = { rng: mulberry32((seed ^ 0x9E3779B9) >>> 0), acc: 1 };
  const seasonEarned = [];
  let guard = 0;
  while (guard++ < MAX_SEASONS * G.CONFIG.seasonDays + 50) {
    if (g.state === S.PLAYING) {
      // Günün doğruluğu: B' korelasyonlu kötü seriler üretir (gün bazında çekilir).
      ctx.acc = profile.acc ? profile.acc()
              : (ctx.rng() < profile.badDayChance ? profile.badAcc : profile.goodAcc);
      morning(w, G, bot);
      runDay(w, G, bot, ctx);
      continue;
    }
    if (g.state === S.DAYEND) { w.startNextDay(); continue; }
    if (g.state === S.SEASONEND) {
      seasonEarned.push(g.seasonResult ? g.seasonResult.earned : 0);
      if (g.career.completed >= MAX_SEASONS) { w.finishCareer("fee"); continue; }
      if (!w.tryStartNextSeason()) continue;      // yetmezse CAREEREND'e düşer
      continue;
    }
    if (g.state === S.CAREEREND) break;
    throw new Error("beklenmeyen state: " + g.state);
  }
  const res = g.careerResult || w.buildCareerResult("fee");
  return {
    seed, profile: profile.key,
    score: res.score, seasons: res.seasonsCompleted, reason: res.reason,
    money: g.money, seasonEarned,
    totals: (g.career && g.career.totals) || {}
  };
}

// ---------------------------------------------------------------- istatistik
function stats(xs) {
  if (!xs.length) return { n: 0 };
  const s = xs.slice().sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return { n: xs.length, mean, med: s[Math.floor(s.length / 2)], min: s[0], max: s[s.length - 1],
           cv: mean ? sd / mean : 0 };
}
const TL = n => Math.round(n).toLocaleString("tr-TR") + "₺";
const PC = n => (n * 100).toFixed(0) + "%";

// ---------------------------------------------------------------- ana akış
function parseArgs(argv) {
  const o = { seeds: 20, profiles: ["A", "B", "B'", "C"], set: {}, news: true, help: true, json: null,
              file: "index.html" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seeds") o.seeds = parseInt(argv[++i], 10);
    else if (a === "--profiles") o.profiles = argv[++i].split(",");
    else if (a === "--set") { const [k, v] = argv[++i].split("="); o.set[k] = parseFloat(v); }
    else if (a === "--no-news") o.news = false;
    else if (a === "--no-help") o.help = false;
    else if (a === "--json") o.json = argv[++i];
    else if (a === "--compare") o.compare = argv[++i];      // "help" | "news"
    else if (a === "--file") o.file = argv[++i];
  }
  return o;
}

function run(opts) {
  const { window: w, G, logs, dom } = loadGame({ file: opts.file });
  // CONFIG override — taban ekonomisi (avgPrice/avgCost, startMoney, geliştirme fiyatları)
  // MEDICINES'ten bir kez türetildiği ve dondurulduğu için buradaki değişiklikler
  // yalnız RUNTIME davranışını etkiler. Gün cache'i temizlenir.
  for (const k in opts.set) {
    if (!(k in G.CONFIG)) throw new Error("CONFIG'te böyle bir anahtar yok: " + k);
    G.CONFIG[k] = opts.set[k];
  }
  w.invalidateDaySchedules();
  G.__avgCost = G.MEDICINES.reduce((a, m) => a + m.cost, 0) / G.MEDICINES.length;

  const bot = { help: opts.help, useNews: opts.news };
  const out = {};
  for (const key of opts.profiles) {
    const prof = PROFILES[key];
    if (!prof) throw new Error("bilinmeyen profil: " + key);
    const rows = [];
    for (let i = 0; i < opts.seeds; i++) rows.push(runCareer(w, G, prof, 1000 + i * 7919, bot));
    out[key] = rows;
  }
  // jsdom penceresi kapatılmazsa her run() bir DOM'u bellekte bırakır; tarama
  // (tools/sweep.js) onlarca run() çağırdığı için bu sızıntı heap'i patlatıyordu.
  try { dom.window.close(); } catch (e) { /* kapanmadıysa da ölçüm bitti */ }
  return { out, warnings: logs.warn, config: opts };
}

function report(r) {
  const setStr = Object.keys(r.config.set).map(k => k + "=" + r.config.set[k]).join(" ") || "—";
  console.log(`\nKARİYER ÖLÇÜMÜ — ${r.config.seeds} tohum · haber:${r.config.news ? "var" : "yok"} · ` +
              `dilenci:${r.config.help ? "yardım" : "reddet"} · override: ${setStr}`);
  console.log("─".repeat(104));
  console.log("prof │ sezon ort/med/aralık │ skor ort      med        en kötü    en iyi     │  CV  │ bitiş");
  console.log("─".repeat(104));
  for (const key in r.out) {
    const rows = r.out[key];
    const sc = stats(rows.map(x => x.score));
    const se = stats(rows.map(x => x.seasons));
    const fee = rows.filter(x => x.reason === "fee").length;
    const rep = rows.filter(x => x.reason === "reputation").length;
    console.log(
      `${key.padEnd(4)} │ ${se.mean.toFixed(1)} / ${String(se.med).padStart(2)} / ${se.min}–${se.max}`.padEnd(31) +
      `│ ${TL(sc.mean).padStart(12)} ${TL(sc.med).padStart(10)} ${TL(sc.min).padStart(10)} ${TL(sc.max).padStart(10)} ` +
      `│ ${PC(sc.cv).padStart(4)} │ bedel ${fee} · itibar ${rep}`);
  }
  console.log("─".repeat(104));
  if (r.warnings.length) {
    console.log(`\n⚠ boot self-test uyarısı (${r.warnings.length}):`);
    r.warnings.slice(0, 10).forEach(l => console.log("   " + l));
  }
}

/**
 * EŞLEŞTİRİLMİŞ KARŞILAŞTIRMA — aynı tohumlar, tek fark bir politika anahtarı.
 * Ortalama farkı değil, KOŞU BAŞINA farkı sayar: gürültüde kaybolan bir etkiyle
 * küçük ama tutarlı bir etkiyi ayırt eden şey budur.
 */
function compare(opts, key) {
  const onOpts  = Object.assign({}, opts, { [key]: true });
  const offOpts = Object.assign({}, opts, { [key]: false });
  const on = run(onOpts), off = run(offOpts);
  const label = key === "help" ? ["yardım", "reddet"] : ["haber var", "haber yok"];
  console.log(`\nEŞLEŞTİRİLMİŞ: ${label[0]} vs ${label[1]} — ${opts.seeds} tohum, aynı tohumlar`);
  console.log("─".repeat(96));
  console.log("prof │ " + label[0].padEnd(11) + "│ " + label[1].padEnd(11) +
              "│ fark   │ kazandıran/kaybettiren/eşit │ medyan fark │ sezon");
  console.log("─".repeat(96));
  for (const k in on.out) {
    const a = on.out[k], b = off.out[k];
    const ma = stats(a.map(x => x.score)).mean, mb = stats(b.map(x => x.score)).mean;
    let win = 0, lose = 0, tie = 0;
    const diffs = [];
    for (let i = 0; i < a.length; i++) {
      const d = a[i].score - b[i].score;
      diffs.push(d);
      if (d > 0) win++; else if (d < 0) lose++; else tie++;
    }
    const md = stats(diffs).med;
    const sa = stats(a.map(x => x.seasons)).med, sb = stats(b.map(x => x.seasons)).med;
    console.log(`${k.padEnd(4)} │ ${TL(ma).padStart(10)} │ ${TL(mb).padStart(10)} │ ` +
                `${(mb ? ((ma - mb) / mb * 100) : 0).toFixed(1).padStart(5)}% │ ` +
                `${String(win).padStart(3)}/${String(lose).padStart(3)}/${String(tie).padStart(3)}`.padEnd(28) +
                `│ ${TL(md).padStart(10)}  │ ${sa} / ${sb}`);
  }
  console.log("─".repeat(96));
  return { on, off };
}

if (require.main === module) {
  const opts = parseArgs(process.argv);
  const t0 = Date.now();
  if (opts.compare) {
    const { on, off } = compare(opts, opts.compare);
    if (opts.json) require("fs").writeFileSync(opts.json, JSON.stringify({ on: on.out, off: off.out }));
    console.log(`\nsüre: ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
    process.exit(0);
  }
  const r = run(opts);
  report(r);
  console.log(`\nsüre: ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
  if (opts.json) require("fs").writeFileSync(opts.json, JSON.stringify(r.out, null, 1));
}

module.exports = { run, runCareer, compare, stats, PROFILES, loadGame };
