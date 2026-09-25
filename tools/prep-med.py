#!/usr/bin/env python3
"""
Gemini'den gelen ilaç kutusu görselini oyunun med_*.png kalıbına sokar.

    python3 tools/prep-med.py girdi.png hapsirmaz            # → assets/med_hapsirmaz.png
    python3 tools/prep-med.py girdi.png polenkes --onizle     # + shots/prep-med-polenkes.png

Komutta DÜZ YEŞİL (#00FF00) zemin istenir (Gemini saydam PNG veremiyor). Araç zemini köşelerden
ölçer, yumuşak kenarla alfa çıkarır, kenardaki yeşil taşmayı temizler, kutuyu kırpar ve uzun
kenarı 460 px olacak şekilde ölçekler (mevcut kutular 300–600 px; raf kartı "contain" çizer).
"""
import argparse, os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
LONG = 460

def key_out(img):
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    h, w, _ = a.shape
    k = max(4, min(h, w) // 40)
    corners = np.concatenate([a[:k, :k].reshape(-1, 3), a[:k, -k:].reshape(-1, 3),
                              a[-k:, :k].reshape(-1, 3), a[-k:, -k:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    d = np.sqrt(((a - bg) ** 2).sum(axis=2))
    alpha = np.clip((d - 60.0) / 70.0, 0, 1)
    g = int(np.argmax(bg)); others = [c for c in range(3) if c != g]
    cap = a[..., others].max(axis=2)
    edge = np.asarray(Image.fromarray(((alpha < 0.995) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))) > 0
    a[..., g] = np.where(edge, np.minimum(a[..., g], cap), a[..., g])
    al = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert("RGBA")
    out.putalpha(al)
    return out

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("girdi"); ap.add_argument("ad", help="hapsirmaz, polenkes …")
    ap.add_argument("--onizle", action="store_true")
    a = ap.parse_args()
    im = key_out(Image.open(a.girdi))
    bb = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    if not bb: sys.exit("kutu bulunamadı (zemin anahtarlanamadı?)")
    im = im.crop(bb)
    s = LONG / max(im.size)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    path = os.path.join(ROOT, "assets", f"med_{a.ad}.png")
    im.save(path, optimize=True)
    print(f"{path}  {im.size}  {os.path.getsize(path)//1024} KB")
    if a.onizle:
        prev = Image.new("RGBA", im.size, (246, 239, 221, 255)); prev.alpha_composite(im)
        pp = os.path.join(ROOT, "shots", f"prep-med-{a.ad}.png"); os.makedirs(os.path.dirname(pp), exist_ok=True)
        prev.convert("RGB").save(pp); print("önizleme:", pp)
