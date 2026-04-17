"""扫描 images 文件夹，生成 photo-manifest.js（排除 wall-01.png，按文件名里的数字排序）。"""
import json
import os
import re

IMG_DIR = os.path.join(os.path.dirname(__file__), "images")
OUT = os.path.join(os.path.dirname(__file__), "photo-manifest.js")

ext = (".jpg", ".jpeg", ".png", ".webp", ".gif")
files = [
    f
    for f in os.listdir(IMG_DIR)
    if f.lower().endswith(ext) and f.lower() != "wall-01.png"
]
files.sort(key=lambda f: [int(x) for x in re.findall(r"\d+", f)])

if len(files) != 52:
    raise SystemExit(f"需要 52 张图（不含 wall-01.png），当前 {len(files)} 张")

paths = ["images/" + f for f in files]
with open(OUT, "w", encoding="utf-8") as w:
    w.write("window.__WALL_PHOTOS__ = ")
    json.dump(paths, w, ensure_ascii=False, indent=2)
    w.write(";\n")
print("已写入", OUT)
