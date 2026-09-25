// Bütün tıklama seslerini (SFX) oyunun kendi koduyla üretip arka arkaya tek dosyaya dizer
// ve her birinin tepe düzeyini yazar.
//   node tools/sfx-preview.js [çıktı.mp3] [aralık sn]
const fs = require("fs"), path = require("path"), http = require("http"), { execSync } = require("child_process");
const OUT = process.argv[2] || path.join(__dirname, "..", "shots", "tik-sesleri.mp3");
const GAP = +(process.argv[3] || 1.0);
(async () => {
  const { chromium } = require("playwright");
  const root = path.join(__dirname, "..");
  const srv = http.createServer((q, r) => {
    const f = path.join(root, decodeURIComponent(q.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { "Content-Type": f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
    fs.createReadStream(f).pipe(r);
  }).listen(0);
  await new Promise(r => srv.on("listening", r));
  const b = await chromium.launch(), p = await b.newPage();
  await p.goto("http://127.0.0.1:" + srv.address().port + "/index.html");
  await p.waitForTimeout(600);
  const res = await p.evaluate(async (gap) => {
    MenuMusic.on = false; MenuMusic.sync();
    const names = Object.keys(SFX), sr = 44100;
    const ac = new OfflineAudioContext(1, Math.ceil(sr * (names.length * gap + 0.5)), sr);
    const out = ac.createGain(); out.gain.value = Sfx.volume;
    const lim = ac.createDynamicsCompressor();
    lim.threshold.value = -10; lim.ratio.value = 6; lim.attack.value = 0.002; lim.release.value = 0.1;
    out.connect(lim); lim.connect(ac.destination);
    const n = ac.createBuffer(1, sr, sr), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    names.forEach((k, i) => SFX[k](ac, out, 0.2 + i * gap, { noise: n }));
    const x = (await ac.startRendering()).getChannelData(0);
    const peaks = names.map((k, i) => {
      let pk = 0;
      for (let j = Math.floor((0.2 + i * gap) * sr); j < Math.min(x.length, Math.floor((0.2 + (i + 1) * gap) * sr)); j++) pk = Math.max(pk, Math.abs(x[j]));
      return [k, 0.2 + i * gap, 20 * Math.log10(pk)];
    });
    const pcm = new Int16Array(x.length);
    for (let i = 0; i < x.length; i++) pcm[i] = Math.max(-1, Math.min(1, x[i])) * 32767;
    return { peaks, pcm: Array.from(pcm) };
  }, GAP);
  await b.close(); srv.close();
  for (const [k, at, db] of res.peaks) console.log(`${at.toFixed(1).padStart(5)} sn  ${k.padEnd(8)} tepe ${db.toFixed(1)} dBFS`);
  const data = Buffer.from(Int16Array.from(res.pcm).buffer), h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(44100, 24);
  h.writeUInt32LE(88200, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  const wav = OUT.replace(/\.mp3$/, ".wav");
  fs.mkdirSync(path.dirname(wav), { recursive: true });
  fs.writeFileSync(wav, Buffer.concat([h, data]));
  if (OUT.endsWith(".mp3")) {
    try { execSync(`ffmpeg -y -loglevel error -i "${wav}" -codec:a libmp3lame -b:a 160k "${OUT}"`); fs.unlinkSync(wav); console.log("yazıldı:", OUT); }
    catch (e) { console.log("ffmpeg yok, WAV bırakıldı:", wav); }
  }
})();
