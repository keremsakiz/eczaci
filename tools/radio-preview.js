// Radyonun sesini DOSYAYA çıkarır: oyunun kendi ses motoru (radioBuildGraph +
// istasyonun zamanlayıcısı) OfflineAudioContext'te çalıştırılır → WAV → (ffmpeg varsa) MP3.
//   node tools/radio-preview.js [saniye] [çıktı.mp3] [istasyon: 0=ECZA FM, 1=ANADOLU FM]
const fs = require("fs"), path = require("path"), http = require("http"), { execSync } = require("child_process");
const SEC = +(process.argv[2] || 30);
const OUT = process.argv[3] || path.join(__dirname, "..", "shots", "radyo-onizleme.mp3");
const STATION = +(process.argv[4] || 0);
const OFFSET = +(process.argv[5] || 0);           // dosyalı istasyonda şarkının kaçıncı saniyesinden başlansın
const WITH_AD = process.argv[6] !== "reklamsiz";   // 13. saniyede reklam arası (oyundaki gibi)
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
  const res = await p.evaluate(async ([sec, si, off, withAd]) => {
    const sr = 44100, ac = new OfflineAudioContext(1, sr * sec, sr);
    const g = radioBuildGraph(ac, ac.destination);
    radioTuneStatic(ac, g, 0.02);
    g.master.gain.setValueAtTime(0.0001, 0.35);
    g.master.gain.exponentialRampToValueAtTime(Radio.volume, 0.95);
    g.master.gain.setValueAtTime(Radio.volume, sec - 1.2);
    g.master.gain.exponentialRampToValueAtTime(0.0001, sec - 0.05);
    const st = RADIO_STATIONS[si];
    g.bus.gain.value = st.gain;
    if (st.file) {                              // oyunun çalacağı yol: dosya → fileIn → sıkıştırıcı → ana ses
      const ab = await (await fetch(st.file)).arrayBuffer();
      const buf = await ac.decodeAudioData(ab);
      const s = ac.createBufferSource(), gg = ac.createGain();
      s.buffer = buf; gg.gain.value = st.fileGain; s.connect(gg); gg.connect(g.fileIn);
      s.start(0.35, off);
    } else {
      for (let i = 0, t = 0.35; t < sec - 0.3; i++, t += st.stepDur()) st.schedule(ac, g, i, t);
    }
    if (withAd && st.ad && RADIO_AD_AT - off > 0 && RADIO_AD_AT - off < sec) {   // oyundaki reklam arası
      const adBuf = await ac.decodeAudioData(await (await fetch(st.ad)).arrayBuffer());
      radioPlayAd(ac, g, adBuf, 0.35 + RADIO_AD_AT - off);
    }
    const buf = await ac.startRendering(), d = buf.getChannelData(0);
    let peak = 0, sum = 0; for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; }
    const pcm = new Int16Array(d.length);
    for (let i = 0; i < d.length; i++) pcm[i] = Math.max(-1, Math.min(1, d[i])) * 32767;
    return { peak, rms: Math.sqrt(sum / d.length), pcm: Array.from(pcm) };
  }, [SEC, STATION, OFFSET, WITH_AD]);
  await b.close(); srv.close();
  const pcm = Int16Array.from(res.pcm), data = Buffer.from(pcm.buffer);
  const hdr = Buffer.alloc(44);
  hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write("WAVE", 8); hdr.write("fmt ", 12);
  hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(44100, 24);
  hdr.writeUInt32LE(88200, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write("data", 36); hdr.writeUInt32LE(data.length, 40);
  const wav = OUT.replace(/\.mp3$/, ".wav");
  fs.mkdirSync(path.dirname(wav), { recursive: true });
  fs.writeFileSync(wav, Buffer.concat([hdr, data]));
  console.log(`tepe ${res.peak.toFixed(3)} (${(20 * Math.log10(res.peak)).toFixed(1)} dBFS) · RMS ${(20 * Math.log10(res.rms)).toFixed(1)} dBFS`);
  if (OUT.endsWith(".mp3")) {
    try { execSync(`ffmpeg -y -loglevel error -i "${wav}" -codec:a libmp3lame -b:a 128k "${OUT}"`); fs.unlinkSync(wav); console.log("yazıldı:", OUT); }
    catch (e) { console.log("ffmpeg yok, WAV bırakıldı:", wav); }
  }
})();
