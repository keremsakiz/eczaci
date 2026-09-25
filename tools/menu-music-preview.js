// Ana ekran müziğini DOSYAYA çıkarır: oyunun kendi ses motoru (mmBuildGraph + mmSchedule +
// mmAmbience) OfflineAudioContext'te, stereo → WAV → (ffmpeg varsa) MP3.
//   node tools/menu-music-preview.js [saniye] [çıktı.mp3] [day|night] [başlangıç sekizliği]
const fs = require("fs"), path = require("path"), http = require("http"), { execSync } = require("child_process");
const SEC = +(process.argv[2] || 45);
const OUT = process.argv[3] || path.join(__dirname, "..", "shots", "ana-ekran-muzik.mp3");
const PHASE = process.argv[4] || "day";
const FROM = +(process.argv[5] || 0);
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
  await p.waitForTimeout(800);
  const res = await p.evaluate(async ([sec, phase, from]) => {
    MenuMusic.on = false; MenuMusic.sync();                     // canlı sesi sustur
    const sr = 44100, ac = new OfflineAudioContext(2, sr * sec, sr);
    const g = mmBuildGraph(ac, ac.destination);
    mmApplyPhase(g, phase, 0);
    g.master.gain.setValueAtTime(0.0001, 0.05);
    g.master.gain.exponentialRampToValueAtTime(MenuMusic.volume, 1.2);
    g.master.gain.setValueAtTime(MenuMusic.volume, sec - 1.5);
    g.master.gain.exponentialRampToValueAtTime(0.0001, sec - 0.05);
    const A = mmAmbInit(phase, 0.1);
    mmAmbience(ac, g, phase, A, 0, sec - 0.5);
    for (let i = from, t = 0.1; t < sec - 0.5; i++, t += mmEighth(phase)) mmSchedule(ac, g, phase, i, t);
    const buf = await ac.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1);
    let peak = 0;
    const pcm = new Int16Array(L.length * 2);
    for (let i = 0; i < L.length; i++) {
      peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      pcm[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767;
      pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767;
    }
    return { peak, pcm: Array.from(pcm) };
  }, [SEC, PHASE, FROM]);
  await b.close(); srv.close();
  const pcm = Int16Array.from(res.pcm), data = Buffer.from(pcm.buffer);
  const hdr = Buffer.alloc(44);
  hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write("WAVE", 8); hdr.write("fmt ", 12);
  hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(44100, 24);
  hdr.writeUInt32LE(176400, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write("data", 36); hdr.writeUInt32LE(data.length, 40);
  const wav = OUT.replace(/\.mp3$/, ".wav");
  fs.mkdirSync(path.dirname(wav), { recursive: true });
  fs.writeFileSync(wav, Buffer.concat([hdr, data]));
  console.log(`${PHASE}: tepe ${(20 * Math.log10(res.peak)).toFixed(1)} dBFS`);
  if (OUT.endsWith(".mp3")) {
    try { execSync(`ffmpeg -y -loglevel error -i "${wav}" -codec:a libmp3lame -b:a 160k "${OUT}"`); fs.unlinkSync(wav); console.log("yazıldı:", OUT); }
    catch (e) { console.log("ffmpeg yok, WAV bırakıldı:", wav); }
  }
})();
