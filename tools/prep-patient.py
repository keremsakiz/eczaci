#!/usr/bin/env python3
"""
Gemini'den gelen müşteri görselini oyunun hasta PNG'si kalıbına sokar.

    python3 tools/prep-patient.py girdi.png student          # → assets/patient_student.png
    python3 tools/prep-patient.py girdi.png student --onizle  # + shots/prep-student.png (koyu zemin üstünde)

Gemini gerçek saydam PNG veremiyor; komutta DÜZ YEŞİL (#00FF00) zemin istenir, bu araç:
  1. zemini köşelerden ölçer, renk uzaklığına göre alfa çıkarır (yumuşak kenar),
  2. saçtaki/kenardaki yeşil taşmayı temizler (despill),
  3. karakteri kırpar ve mevcut hastalarla AYNI kalıba oturtur: 896×1200, alt kenar resmin
     dibinde (tezgah onu göğüs/bel hizasından keser), başın tepesi üstten ~%11, yatayda ortalı.
"""
import argparse, os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
W, H = 896, 1200
TOP_MARGIN = 0.11          # başın üstündeki boşluk (mevcut hastalar %7–17)
KEEP = 0.80                # Gemini karakteri kalçanın altına kadar çiziyor; üstten bu kadarı tutulur
                           # → baş/omuz ölçeği mevcut hastalarla eşleşir (--kes ile değişir)


def key_out(img):
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    h, w, _ = a.shape
    k = max(4, min(h, w) // 40)
    corners = np.concatenate([a[:k, :k].reshape(-1, 3), a[:k, -k:].reshape(-1, 3),
                              a[-k:, :k].reshape(-1, 3), a[-k:, -k:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    d = np.sqrt(((a - bg) ** 2).sum(axis=2))
    lo, hi = 60.0, 130.0                                   # bu aralıkta yumuşak geçiş
    alpha = np.clip((d - lo) / (hi - lo), 0, 1)
    # despill: kenar bölgesinde (yarı saydam + 3 px içerisi) baskın zemin kanalı, diğer iki
    # kanalın en büyüğüne indirilir → saç ve omuz kenarındaki yeşil hale kaybolur
    g_dom = int(np.argmax(bg))                             # zeminin baskın kanalı (yeşilse 1)
    others = [c for c in range(3) if c != g_dom]
    cap = a[..., others].max(axis=2)
    edge = Image.fromarray(((alpha < 0.995) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))
    edge = np.asarray(edge) > 0
    a[..., g_dom] = np.where(edge, np.minimum(a[..., g_dom], cap), a[..., g_dom])
    al = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert("RGBA")
    out.putalpha(al)
    return out, bg


def fit(img):
    al = np.asarray(img)[..., 3]
    ys, xs = np.where(al > 24)
    if len(xs) == 0:
        sys.exit("karakter bulunamadı (zemin anahtarlanamadı?)")
    y0, y1 = ys.min(), ys.max() + 1
    y1 = y0 + int((y1 - y0) * KEEP)                        # alttan kes: bel/kalça hizası (mevcutlarla aynı ölçek)
    sub = al[y0:y1]; xs2 = np.where(sub.max(axis=0) > 24)[0]
    crop = img.crop((xs2.min(), y0, xs2.max() + 1, y1))
    cw, ch = crop.size
    # Ölçek BOYDAN gelir (tüm hastalarda baş aynı yükseklikte). Kolları/eşyası geniş olan karakter
    # tuvale sığmazsa yanlardan kırpılır (mevcut worker/lady de kenara dayalı) — küçültülmez,
    # yoksa baş tezgaha gömülüyordu (kurye: baş üstü 312 px'e inmişti).
    s = (H * (1 - TOP_MARGIN)) / ch
    crop = crop.resize((max(1, round(cw * s)), max(1, round(ch * s))), Image.LANCZOS)
    if crop.width > W:
        ox = (crop.width - W) // 2
        crop = crop.crop((ox, 0, ox + W, crop.height))
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(crop, ((W - crop.width) // 2, H - crop.height))
    return canvas


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("girdi")
    ap.add_argument("ad", help="student, teacher, taxi, baker, fan, courier, nurse, housewife, barber, runner …")
    ap.add_argument("--onizle", action="store_true")
    ap.add_argument("--kes", type=float, default=None, help="üstten tutulacak oran (varsayılan 0.80)")
    a = ap.parse_args()
    if a.kes: KEEP = a.kes
    keyed, bg = key_out(Image.open(a.girdi))
    out = fit(keyed)
    path = os.path.join(ROOT, "assets", f"patient_{a.ad}.png")
    out.save(path, optimize=True)
    print(f"{path}  (zemin rengi {bg.round().astype(int).tolist()}, {os.path.getsize(path)//1024} KB)")
    if a.onizle:
        prev = Image.new("RGBA", (W, H), (58, 40, 28, 255))
        prev.alpha_composite(out)
        pp = os.path.join(ROOT, "shots", f"prep-{a.ad}.png")
        prev.convert("RGB").save(pp)
        print("önizleme:", pp)
