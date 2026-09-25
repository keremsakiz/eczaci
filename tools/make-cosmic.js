// COSMIC FM — 34 saniyelik özgün enstrümantal, kodla bestelenip çevrimdışı işlenir.
//   node tools/make-cosmic.js            → assets/radio_cosmic.mp3
//
// Konsept (Kerem): uzay destanı havası + nostaljik, old-school, Daft Punk vari enstrümantal.
// Hiçbir mevcut eserin melodisi kullanılmadı; yalnız TARZ öğeleri:
//   0–8 sn   GİRİŞ   — kilise orgu (katmanlı harmonikler), tik-tak eden saat, derin uğultu
//   8–16 sn  YÜKSELİŞ — dörtlük davul, "pompalanan" org (sidechain), funky oktav bas,
//                       alçak geçiren filtresi yavaşça AÇILAN disko akor kesmeleri (French house)
//  16–24 sn  PATLAMA — el çırpma, 16'lık arpej (yankılı), robot korosu (formant süzgeçli testere),
//                       kare dalga ana melodi
//  24–32 sn  ÇIKIŞ   — org melodiyi devralır, filtre yeniden KAPANIR, son ölçüde davul susar
//  32–34 sn  SON     — tek La minör org akoru, saat son kez tıklar
// La minör, 120 BPM (ölçü 2 sn), akorlar: Am – F – C – G.
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const OUT = path.join(__dirname, "..", "assets", "radio_cosmic.mp3");

(async () => {
  const { chromium } = require("playwright");
  const b = await chromium.launch(), p = await b.newPage();
  await p.setContent("<html><body></body></html>");
  const res = await p.evaluate(async () => {
    const SR = 44100, DUR = 34, BAR = 2, BEAT = 0.5, S16 = 0.125;
    const ac = new OfflineAudioContext(2, SR * DUR, SR);
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

    // --- ana zincir ---
    const master = ac.createGain(); master.gain.value = 0.8;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
    master.connect(comp); comp.connect(ac.destination);
    // yankı: üretilmiş dürtü yanıtı (stereo, 2,8 sn)
    const ir = ac.createBuffer(2, SR * 2.8, SR);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.2);
    }
    const rev = ac.createConvolver(); rev.buffer = ir;
    const revOut = ac.createGain(); revOut.gain.value = 0.65; rev.connect(revOut); revOut.connect(master);
    // POMPA: dörtlüklerde kısılan kanal (org, koro, akor kesmeleri) — French house nefesi
    const pump = ac.createGain(); pump.connect(master);
    for (let t = 8; t < 32; t += BEAT) {
      pump.gain.setValueAtTime(0.32, t);
      pump.gain.linearRampToValueAtTime(1, t + 0.32);
    }
    const noise = ac.createBuffer(1, SR, SR);
    { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const bus = (dest, send, pan) => {
      const g = ac.createGain(); let n = g;
      if (pan !== undefined) { const pn = ac.createStereoPanner(); pn.pan.value = pan; g.connect(pn); n = pn; }
      n.connect(dest);
      if (send) { const s = ac.createGain(); s.gain.value = send; n.connect(s); s.connect(rev); }
      return g;
    };
    const env = (g, t, a, peak, d, rel) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.setValueAtTime(peak, t + Math.max(a, d - rel));
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    };

    // --- enstrümanlar ---
    // org: 150 Hz altı kesilir (çamurlaşmasın), notalar perdeye göre sağa-sola yayılır (genişlik)
    const organHp = ac.createBiquadFilter(); organHp.type = "highpass"; organHp.frequency.value = 150;
    const organBus = bus(pump, 0.75); organHp.connect(organBus);
    function organ(m, t, d, vel) {
      const g = ac.createGain(), pn = ac.createStereoPanner();
      pn.pan.value = ((m % 12) / 11 - 0.5) * 0.7; g.connect(pn); pn.connect(organHp);
      env(g, t, 0.18, vel, d, 0.35);
      const lfo = ac.createOscillator(), ld = ac.createGain();
      lfo.frequency.value = 5.6; ld.gain.value = 5; lfo.connect(ld); lfo.start(t); lfo.stop(t + d + 0.05);
      [[1, 1], [2, 0.55], [3, 0.32], [4, 0.24], [6, 0.12], [8, 0.08]].forEach(([h, a]) => {
        const o = ac.createOscillator(), og = ac.createGain();
        o.frequency.value = mtof(m) * h; og.gain.value = a * 0.16;
        ld.connect(o.detune); o.connect(og); og.connect(g); o.start(t); o.stop(t + d + 0.05);
      });
    }
    function tick(t, pan, vel) {
      const s = ac.createBufferSource(); s.buffer = noise;
      const f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 3200; f.Q.value = 6;
      const g = ac.createGain(); g.gain.setValueAtTime(0.9 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
      const pn = ac.createStereoPanner(); pn.pan.value = pan;
      s.connect(f); f.connect(g); g.connect(pn); pn.connect(master);
      s.start(t, Math.random() * 0.5); s.stop(t + 0.04);
    }
    function kick(t) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.32);
    }
    function hat(t, open, vel) {
      const s = ac.createBufferSource(); s.buffer = noise;
      const f = ac.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7500;
      const g = ac.createGain(), pn = ac.createStereoPanner(); pn.pan.value = open ? 0.25 : -0.25;
      g.gain.setValueAtTime(0.8 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.16 : 0.04));
      s.connect(f); f.connect(g); g.connect(pn); pn.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + 0.2);
    }
    const clapBus = bus(master, 0.35);
    function clap(t) {
      for (let k = 0; k < 3; k++) {
        const s = ac.createBufferSource(); s.buffer = noise;
        const f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1500; f.Q.value = 1;
        const g = ac.createGain(), tt = t + k * 0.012;
        g.gain.setValueAtTime(0.5, tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.06 + k * 0.04);
        s.connect(f); f.connect(g); g.connect(clapBus); s.start(tt, Math.random() * 0.5); s.stop(tt + 0.2);
      }
      const sn = ac.createBufferSource(); sn.buffer = noise;                 // parlak "şak"
      const hf = ac.createBiquadFilter(); hf.type = "highpass"; hf.frequency.value = 3500;
      const hg = ac.createGain(); hg.gain.setValueAtTime(0.35, t); hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      sn.connect(hf); hf.connect(hg); hg.connect(clapBus); sn.start(t, Math.random() * 0.5); sn.stop(t + 0.12);
    }
    const bassF = ac.createBiquadFilter(); bassF.type = "lowpass"; bassF.frequency.value = 850; bassF.Q.value = 4;
    bassF.connect(master);
    function bass(m, t, d) {
      const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain();
      o.type = "sawtooth"; o2.type = "square"; o.frequency.value = mtof(m); o2.frequency.value = mtof(m - 12);
      const g2 = ac.createGain(); g2.gain.value = 0.5;
      env(g, t, 0.005, 0.30, d, 0.05);
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(bassF);
      o.start(t); o2.start(t); o.stop(t + d + 0.02); o2.stop(t + d + 0.02);
    }
    // disko akor kesmeleri: filtresi ölçüler boyunca açılıp kapanır
    const stabF = ac.createBiquadFilter(); stabF.type = "lowpass"; stabF.Q.value = 7;
    stabF.frequency.setValueAtTime(350, 8);
    stabF.frequency.exponentialRampToValueAtTime(4200, 16);
    stabF.frequency.setValueAtTime(4200, 26);
    stabF.frequency.exponentialRampToValueAtTime(500, 32);
    const stabBus = bus(pump, 0.2); stabF.connect(stabBus);
    function stab(notes, t) {
      notes.forEach(m => [-9, 0, 9].forEach(cents => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sawtooth"; o.frequency.value = mtof(m); o.detune.value = cents;
        env(g, t, 0.004, 0.05, 0.14, 0.06);
        o.connect(g); g.connect(stabF); o.start(t); o.stop(t + 0.16);
      }));
    }
    // arpej: yankılı kare dalga, sağ-sol
    const arpDly = ac.createDelay(1); arpDly.delayTime.value = 0.375;
    const arpFb = ac.createGain(); arpFb.gain.value = 0.38;
    const arpBus = bus(master, 0.3);
    arpDly.connect(arpFb); arpFb.connect(arpDly); arpDly.connect(arpBus);
    function arp(m, t, pan) {
      const o = ac.createOscillator(), g = ac.createGain(), pn = ac.createStereoPanner(), f = ac.createBiquadFilter();
      o.type = "square"; o.frequency.value = mtof(m); f.type = "lowpass"; f.frequency.value = 5200;
      pn.pan.value = pan; env(g, t, 0.003, 0.10, 0.11, 0.05);
      o.connect(f); f.connect(g); g.connect(pn); pn.connect(arpBus); pn.connect(arpDly);
      o.start(t); o.stop(t + 0.13);
    }
    // robot korosu: testere dişi → iki formant süzgeci ("aa" ünlüsü) + titreşim
    const choirBus = bus(pump, 0.6);
    function choir(notes, t, d) {
      notes.forEach((m, i) => {
        const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(m);
        const lfo = ac.createOscillator(), ld = ac.createGain(); lfo.frequency.value = 4.8 + i * 0.3; ld.gain.value = 9;
        lfo.connect(ld); ld.connect(o.detune);
        const g = ac.createGain(); env(g, t, 0.12, 0.06, d, 0.3);
        const pn = ac.createStereoPanner(); pn.pan.value = (i % 2 ? 0.45 : -0.45);
        [[730, 7, 1], [1090, 8, 0.6], [2440, 9, 0.25]].forEach(([fq, q, a]) => {
          const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = fq; bp.Q.value = q;
          const ga = ac.createGain(); ga.gain.value = a * 3.2;
          o.connect(bp); bp.connect(ga); ga.connect(g);
        });
        g.connect(pn); pn.connect(choirBus);
        o.start(t); lfo.start(t); o.stop(t + d + 0.05); lfo.stop(t + d + 0.05);
      });
    }
    const leadDly = ac.createDelay(1); leadDly.delayTime.value = 0.25;
    const leadFb = ac.createGain(); leadFb.gain.value = 0.3;
    const leadBus = bus(master, 0.35); leadDly.connect(leadFb); leadFb.connect(leadDly); leadDly.connect(leadBus);
    function lead(m, t, d) {
      const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
      o.type = "square"; o.frequency.setValueAtTime(mtof(m) * 0.985, t);
      o.frequency.setTargetAtTime(mtof(m), t, 0.02);                    // hafif kayma (talkbox hissi)
      f.type = "lowpass"; f.frequency.value = 3800; f.Q.value = 2;
      env(g, t, 0.01, 0.10, d, 0.06);
      o.connect(f); f.connect(g); g.connect(leadBus); g.connect(leadDly);
      o.start(t); o.stop(t + d + 0.02);
    }

    // --- akorlar ve ezgiler ---
    const CH = [
      { root: 45, org: [57, 60, 64, 69], stab: [69, 72, 76], arp: [69, 72, 76, 81], ost: [69, 72, 76, 72] }, // Am
      { root: 41, org: [57, 60, 65, 69], stab: [69, 72, 77], arp: [65, 69, 72, 77], ost: [69, 72, 77, 72] }, // F
      { root: 48, org: [55, 60, 64, 67], stab: [67, 72, 76], arp: [67, 72, 76, 79], ost: [67, 72, 76, 72] }, // C
      { root: 43, org: [55, 59, 62, 67], stab: [67, 71, 74], arp: [67, 71, 74, 79], ost: [67, 71, 74, 71] }  // G
    ];
    const LEAD = [   // [nota, başlangıç (16'lık), uzunluk (16'lık)]
      [[76, 0, 3], [74, 3, 1], [72, 4, 4], [69, 8, 2], [72, 10, 2], [76, 12, 4]],
      [[77, 0, 3], [76, 3, 1], [72, 4, 4], [69, 8, 4], [72, 12, 4]],
      [[79, 0, 3], [76, 3, 1], [72, 4, 4], [76, 8, 2], [79, 10, 2], [84, 12, 4]],
      [[83, 0, 4], [79, 4, 4], [74, 8, 4], [71, 12, 4]]
    ];

    for (let bar = 0; bar < 16; bar++) {
      const t0 = bar * BAR, c = CH[bar % 4];
      const intro = bar < 4, build = bar >= 4 && bar < 8, drop = bar >= 8 && bar < 12, outro = bar >= 12;
      // org akoru (girişte crescendo), pedal notası
      const ov = intro ? 0.22 + bar * 0.08 : (outro ? 0.50 : 0.30);
      c.org.forEach(m => organ(m, t0, BAR + 0.05, ov));
      organ(c.root + 12, t0, BAR + 0.05, ov * 0.8);
      // org ostinatosu: 8'liklerle akor tonları (girişte ve çıkışta öne çıkar)
      const ostV = intro ? 0.24 + bar * 0.05 : (outro ? 0.34 : 0.14);
      for (let e = 0; e < 8; e++) organ(c.ost[e % 4] + 12, t0 + e * 0.25, 0.24, ostV);
      // saat tik-takı: her vuruş, sağ-sol
      for (let k = 0; k < 4; k++) tick(t0 + k * BEAT, k % 2 ? 0.55 : -0.55, drop ? 0.35 : 0.7);
      if (intro) continue;
      const lastBar = bar === 15;
      for (let k = 0; k < 4; k++) {
        const tb = t0 + k * BEAT;
        if (!(lastBar && k >= 2)) kick(tb);
        if (!(lastBar && k >= 2)) hat(tb + BEAT / 2, true, 1);
        if ((drop || outro) && (k === 1 || k === 3) && !(lastBar && k === 3)) clap(tb);
        if (drop) hat(tb + BEAT / 4, false, 0.6), hat(tb + 3 * BEAT / 4, false, 0.6);
      }
      // funky oktav bas (16'lıklar)
      [[0, 0, 2], [2, 12, 1], [3, 0, 1], [6, 12, 2], [8, 0, 2], [10, 12, 1], [11, 0, 1], [14, 12, 2]]
        .forEach(([st, iv, ln]) => { if (!(lastBar && st >= 8)) bass(c.root + iv, t0 + st * S16, ln * S16 * 0.9); });
      // disko kesmeleri: arka 8'liklerde
      [2, 6, 10, 14].forEach(st => { if (!(lastBar && st >= 8)) stab(c.stab, t0 + st * S16); });
      if (drop || outro) {
        for (let st = 0; st < 16; st++) {
          if (lastBar && st >= 8) break;
          arp(c.arp[st % 4] + (st >= 8 ? 12 : 0), t0 + st * S16, st % 2 ? 0.5 : -0.5);
        }
      }
      if (drop) {
        choir(c.stab.map(m => m - 12), t0, BAR);
        LEAD[bar % 4].forEach(([m, st, ln]) => lead(m, t0 + st * S16, ln * S16 * 0.95));
      }
      if (outro && !lastBar) {        // org melodiyi devralır (bir oktav aşağıda)
        LEAD[bar % 4].forEach(([m, st, ln]) => organ(m - 12, t0 + st * S16, ln * S16 * 1.05, 0.42));
      }
    }
    // son: tek büyük La minör org akoru + son tik
    [45, 57, 60, 64, 69, 76].forEach(m => organ(m, 32, 1.95, 0.5));
    tick(32, 0, 0.8); tick(33, 0, 0.35);

    const buf = await ac.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let peak = 0; for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const pcm = new Int16Array(L.length * 2), k = peak > 0.98 ? 0.98 / peak : 1;
    for (let i = 0; i < L.length; i++) { pcm[i * 2] = L[i] * k * 32767; pcm[i * 2 + 1] = R[i] * k * 32767; }
    return { peak, pcm: Array.from(pcm) };
  });
  await b.close();
  const data = Buffer.from(Int16Array.from(res.pcm).buffer), hdr = Buffer.alloc(44);
  hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write("WAVE", 8); hdr.write("fmt ", 12);
  hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(44100, 24);
  hdr.writeUInt32LE(176400, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write("data", 36); hdr.writeUInt32LE(data.length, 40);
  const wav = OUT.replace(/\.mp3$/, ".wav");
  fs.writeFileSync(wav, Buffer.concat([hdr, data]));
  // ses düzeyi: -16 LUFS (oyunda istasyon kazancıyla ECZA FM'e eşitlenir)
  // Yalnız KAZANÇ (loudnorm'un dinamik modu girişi patlamayla aynı seviyeye eziyordu) + tepe sınırlayıcı.
  const meas = execSync(`ffmpeg -hide_banner -i "${wav}" -af ebur128 -f null - 2>&1`).toString();
  const I = parseFloat((meas.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop().split(/\s+/)[1]);
  const gainDb = (-16 - I).toFixed(2);
  execSync(`ffmpeg -y -loglevel error -i "${wav}" -af volume=${gainDb}dB,alimiter=limit=0.84:level=false -ar 44100 -codec:a libmp3lame -b:a 128k "${OUT}"`);
  console.log("ölçülen", I, "LUFS → kazanç", gainDb, "dB");
  fs.unlinkSync(wav);
  console.log("ham tepe", res.peak.toFixed(3), "→ yazıldı:", OUT);
})();
