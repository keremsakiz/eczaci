#!/usr/bin/env python3
"""
Radyo reklam araları (spiker anonsları) — her istasyonun kendi sesi ve jingle'ı.

    python3 tools/make-ads.py                       # üç anonsu TASLAK sesle üret
    python3 tools/make-ads.py --voice ecza=kayit.wav # gerçek seslendirmeyi işle (EQ + jingle)

Oyun her şarkının 13. saniyesinde müziği kısar, bu dosyayı çalar, müziği geri açar.
Çıktı: assets/ad_ecza.mp3, assets/ad_anadolu.mp3, assets/ad_cosmic.mp3

TASLAK SES: espeak-ng + MBROLA Türkçe diphone sesleri (tr1 erkek, tr2 kadın). Anlaşılır ama
"yumuşak/seksi" ya da "tok" gibi bir tonlamayı gerçekten veremez; MBROLA ses veritabanlarının
lisansı da ticari kullanımı kısıtlar. Yayın öncesi gerçek seslendirme (ör. ElevenLabs, ücretli
planda ticari hak) --voice ile aynı işlemden geçirilip yerine konmalı.
"""
import argparse, os, subprocess, tempfile, shutil

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SR = 44100

# Her istasyon: seslendirme yönergesi, metin parçaları (aradaki sessizlikler), taslak TTS ayarı,
# ses işleme zinciri ve jingle.
ADS = {
    "ecza": {
        "direction": "Kadın spiker. Yumuşak, fısıltıya yakın, baştan çıkarıcı; yavaş ve sıcak.",
        "lines": [("Ağrınızı banlayın.", 0.40), ("Ağrıban.", 0.55), ("Tüm eczanelerde.", 0.0)],
        "tts": ["-v", "mb-tr2", "-s", "112", "-p", "36", "-g", "4"],
        # sıcak alt, yumuşak üst, hafif oda + kısa koro (yumuşaklık)
        "fx": "highpass=f=90,lowpass=f=7200,equalizer=f=180:t=q:w=1:g=3,"
              "equalizer=f=3200:t=q:w=1.2:g=-2,chorus=0.6:0.9:40:0.25:0.3:2,"
              "aecho=0.8:0.6:45:0.18,acompressor=threshold=-20dB:ratio=3:attack=10:release=150",
        "jingle": "bell",
        # gerçek kayıt (ElevenLabs, Ağrıban.mp3). Kaynak dosya çok KOYU: ~1,5 kHz üstü neredeyse yok
        # (2 kHz'de −38 dB) ve kelime aralarında −46 dBFS uğultu var → boğuk / kapalı oda sesi.
        # Zincir: oda yankısı YOK; gürültü azaltma + kapı (aralardaki uğultu), 280 Hz çamur −5 dB,
        # 1,3 kHz +3, 2,6 kHz +6; kayıpta olmayan tizi üretmek için hafif "exciter":
        # 700–1800 Hz bandı tanh ile doyurulur, yalnız 2,2 kHz üstü harmonikler geri karıştırılır.
        "fx_real": "[0:a]highpass=f=100,afftdn=nr=14:nf=-50,equalizer=f=280:t=q:w=1:g=-5,"
                   "equalizer=f=1300:t=q:w=1:g=3,asplit[d][e];"
                   "[e]highpass=f=700,lowpass=f=1800,volume=24dB,asoftclip=type=tanh,"
                   "highpass=f=2200,highpass=f=2200,volume=1.0[h];"
                   "[d]equalizer=f=2600:t=q:w=1.2:g=6[dd];[dd][h]amix=inputs=2:normalize=0,"
                   "agate=threshold=0.012:ratio=3:attack=5:release=180,"
                   "acompressor=threshold=-20dB:ratio=2.5:attack=8:release=150",
    },
    "anadolu": {
        "direction": "Erkek spiker. Kalın, tok, bariton; rahat ve esprili, maç anlatıcısı sıcaklığı.",
        "lines": [("Bugün maç mı var?", 0.35), ("Sakin ol.", 0.40), ("Sakinol.", 0.50), ("Tüm eczanelerde.", 0.0)],
        "tts": ["-v", "mb-tr1", "-s", "122", "-p", "22", "-g", "3"],
        # 10% aşağı perde (kalınlık), bas gövde, hafif sıkıştırma
        "pitch": 0.90,
        "fx": "highpass=f=70,lowpass=f=7000,equalizer=f=130:t=q:w=1:g=5,"
              "equalizer=f=2500:t=q:w=1:g=1.5,aecho=0.8:0.5:35:0.12,"
              "acompressor=threshold=-18dB:ratio=3.5:attack=8:release=120",
        "jingle": "saz",
        "fx_real": "highpass=f=70,equalizer=f=130:t=q:w=1:g=2.5,"
                   "acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120",
    },
    "cosmic": {
        "direction": "Robot / vokoder sesi (Daft Punk tadında); ağır, gizemli, uzay yayını.",
        "lines": [("Göznur,", 0.20), ("gözünüze iyi gelir.", 0.40),
                  ("Işık yılı ötesini bile net görün.", 0.50), ("Tüm eczanelerde.", 0.0)],
        "tts": ["-v", "mb-tr1", "-s", "118", "-p", "40", "-g", "4"],
        # ROBOT: faz sıfırlama (afftfilt) sabit perdeli vokoder tınısı verir; üstüne flanger + yankı
        "fx": "afftfilt=real='hypot(re,im)':imag='0':win_size=512:overlap=0.75,"
              "highpass=f=120,lowpass=f=7500,flanger=delay=2:depth=2:speed=0.25,"
              "aecho=0.8:0.7:180|360:0.25|0.12,acompressor=threshold=-18dB:ratio=3",
        "jingle": "arp",
        # gerçek kayıtta robotlaştırma YOK; yalnız uzay yankısı
        "fx_real": "highpass=f=90,aecho=0.8:0.55:140|280:0.16|0.08,"
                   "acompressor=threshold=-20dB:ratio=2.5:attack=10:release=150",
    },
}

# Jingle'lar: ffmpeg aevalsrc ile üretilen kısa tanıtım sesi (anonstan önce).
JINGLES = {
    # iki notalı yumuşak zil (Mi6 → Do6), üstel sönüm
    "bell": "0.30*sin(2*PI*1318.5*t)*exp(-6*t)*lt(t,0.9)+0.12*sin(2*PI*2637*t)*exp(-9*t)*lt(t,0.9)"
            "+0.30*sin(2*PI*1046.5*(t-0.28))*exp(-5*(t-0.28))*gte(t,0.28)",
    # saz tınısında üç kısa çırpma (La–Do#–Mi), tel sönümü
    "saz": "0.26*sin(2*PI*440*t)*exp(-9*t)*lt(t,0.5)+0.12*sin(2*PI*880*t)*exp(-12*t)*lt(t,0.5)"
           "+0.26*sin(2*PI*554.4*(t-0.16))*exp(-9*(t-0.16))*gte(t,0.16)"
           "+0.28*sin(2*PI*659.3*(t-0.32))*exp(-6*(t-0.32))*gte(t,0.32)",
    # yükselen synth arpej (La minör), testere-benzeri harmonikler
    "arp": "".join("+0.10*(sin(2*PI*{f}*(t-{d}))+0.5*sin(4*PI*{f}*(t-{d}))+0.33*sin(6*PI*{f}*(t-{d})))"
                   "*exp(-7*(t-{d}))*gte(t,{d})".format(f=f, d=d)
                   for f, d in [(440, 0), (523.25, 0.11), (659.25, 0.22), (880, 0.33), (1046.5, 0.44)])[1:],
}


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def tts_segments(ad, tmp):
    """Taslak ses: her cümle ayrı sentezlenir, aralara sessizlik konur."""
    parts = []
    for i, (text, pause) in enumerate(ad["lines"]):
        raw = os.path.join(tmp, f"l{i}.wav")
        run(["espeak-ng", *ad["tts"], "-w", raw, text])
        norm = os.path.join(tmp, f"n{i}.wav")
        # espeak her cümlenin başına/sonuna ~0,4 sn sessizlik koyuyor: kırp, araları biz belirleyelim
        trim = ("silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
                "silenceremove=start_periods=1:start_threshold=-45dB,areverse")
        run(["ffmpeg", "-y", "-i", raw, "-ar", str(SR), "-ac", "1", "-af", trim, norm])
        parts.append(norm)
        if pause > 0:
            sil = os.path.join(tmp, f"s{i}.wav")
            run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"anullsrc=r={SR}:cl=mono", "-t", str(pause), sil])
            parts.append(sil)
    lst = os.path.join(tmp, "list.txt")
    with open(lst, "w") as f:
        f.writelines(f"file '{p}'\n" for p in parts)
    out = os.path.join(tmp, "voice_raw.wav")
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", out])
    return out


def build(key, voice_file=None):
    ad = ADS[key]
    tmp = tempfile.mkdtemp()
    try:
        if voice_file:
            # gerçek kayıt: mono, baş/son sessizlik kırpılır, hafif işleme
            src = os.path.join(tmp, "real.wav")
            trim = ("silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                    "silenceremove=start_periods=1:start_threshold=-50dB,areverse")
            run(["ffmpeg", "-y", "-i", voice_file, "-map", "0:a", "-ac", "1", "-ar", str(SR), "-af", trim, src])
        else:
            src = tts_segments(ad, tmp)
        fx = ad["fx_real"] if voice_file else ad["fx"]
        if ad.get("pitch") and not voice_file:        # yalnız taslakta perde düşür
            p = ad["pitch"]
            fx = f"asetrate={SR}*{p},aresample={SR},atempo={1/p:.4f}," + fx
        voice = os.path.join(tmp, "voice.wav")
        # "[0:a]" ile başlayan zincir dallanıyor (asplit) → filter_complex
        flag = "-filter_complex" if fx.startswith("[0:a]") else "-af"
        run(["ffmpeg", "-y", "-i", src, "-ac", "1", "-ar", str(SR), flag, fx, voice])
        jing = os.path.join(tmp, "jingle.wav")
        run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"aevalsrc='{JINGLES[ad['jingle']]}':s={SR}:d=1.1",
             "-af", "afade=t=out:st=0.8:d=0.3", jing])
        # jingle + 0,15 sn boşluk + anons; sonra ses düzeyi -16 LUFS'a
        out = os.path.join(ROOT, "assets", f"ad_{key}.mp3")
        mix = os.path.join(tmp, "mix.wav")
        run(["ffmpeg", "-y", "-i", jing, "-i", voice, "-filter_complex",
             "[1:a]adelay=1250:all=1[v];[0:a][v]amix=inputs=2:duration=longest:normalize=0",
             "-ac", "1", "-ar", str(SR), mix])
        # Ses düzeyi: ölç → tam −16 LUFS'a kazançla getir (tek geçişli loudnorm kısa kliplerde tutmuyordu)
        meas = subprocess.run(["ffmpeg", "-hide_banner", "-i", mix, "-af", "ebur128", "-f", "null", "-"],
                              capture_output=True, text=True).stderr
        I = float([l for l in meas.splitlines() if l.strip().startswith("I:")][-1].split()[1])
        run(["ffmpeg", "-y", "-i", mix, "-af", f"volume={-16 - I:.2f}dB,alimiter=limit=0.93:level=false",
             "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "96k", out])
        dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
                             capture_output=True, text=True).stdout.strip()
        print(f"{out}  {float(dur):.1f} sn  ({'gerçek kayıt' if voice_file else 'taslak TTS'})")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", action="append", default=[], help="istasyon=dosya (gerçek seslendirme)")
    ap.add_argument("--only", choices=list(ADS), help="yalnız bu istasyon")
    a = ap.parse_args()
    given = dict(v.split("=", 1) for v in a.voice)
    for k in ADS:
        if a.only and k != a.only:
            continue
        build(k, given.get(k))
