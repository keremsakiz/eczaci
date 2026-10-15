#!/usr/bin/env python3
"""prep-patient.py'nin yeşil-baskınlık anahtarlı hâli: zemin tam #00FF00 değilse (Gemini ızgara
çıktısı ~#58E95C) renk uzaklığı zeytin/haki giysileri de yiyordu. Burada alfa, pikselin YEŞİL
BASKINLIĞINDAN (g - max(r,b)) çıkar: haki/zeytin giysi baskın değildir, zemin çok baskındır.
    python3 tools/prep-patient2.py girdi.png ad [--kes 0.8] [--kutu x0,y0,x1,y1] [--onizle]"""
import argparse, os, sys, importlib.util
import numpy as np
from PIL import Image, ImageFilter
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("pp", os.path.join(here, "prep-patient.py"))
pp = importlib.util.module_from_spec(spec); spec.loader.exec_module(pp)

def key_green(img):
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    dom = a[..., 1] - np.maximum(a[..., 0], a[..., 2])
    h, w = dom.shape; k = max(4, min(h, w) // 40)
    bgdom = np.median(np.concatenate([dom[:k, :k].ravel(), dom[:k, -k:].ravel()]))
    hi = bgdom * 0.50; lo = bgdom * 0.22                    # lo altı tam opak, hi üstü tam saydam
    alpha = np.clip((hi - dom) / (hi - lo), 0, 1)
    edge = Image.fromarray(((alpha < 0.995) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))
    edge = np.asarray(edge) > 0
    # yarı saydam kenarda zemin rengini çıkar (un-premultiply): gözlenen = α·renk + (1-α)·zemin
    bgc = np.median(np.concatenate([a[:k, :k].reshape(-1, 3), a[:k, -k:].reshape(-1, 3)]), axis=0)
    m = (alpha > 0.03) & (alpha < 0.97)
    al3 = np.maximum(alpha, 0.03)[..., None]
    a = np.where(m[..., None], np.clip((a - (1 - al3) * bgc) / al3, 0, 255), a)
    cap = np.maximum(a[..., 0], a[..., 2])
    a[..., 1] = np.where(edge, np.minimum(a[..., 1], cap), a[..., 1])   # despill
    al = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert("RGBA"); out.putalpha(al)
    return out, bgdom

ap = argparse.ArgumentParser()
ap.add_argument("girdi"); ap.add_argument("ad")
ap.add_argument("--kes", type=float, default=0.80); ap.add_argument("--kutu", default=None)
ap.add_argument("--onizle", action="store_true")
a = ap.parse_args()
pp.KEEP = a.kes
img = Image.open(a.girdi)
if a.kutu: img = img.crop(tuple(int(v) for v in a.kutu.split(",")))
keyed, bgd = key_green(img)
out = pp.fit(keyed)
path = os.path.join(pp.ROOT, "assets", f"patient_{a.ad}.png")
out.save(path, optimize=True)
print(path, "zemin baskınlığı", round(float(bgd)), os.path.getsize(path) // 1024, "KB")
