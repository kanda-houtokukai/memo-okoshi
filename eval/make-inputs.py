# 評価キット（P20）の入力画像を作る一回きりのツール。ビルドにもテストにも関わらない（手で動かすだけ）。
# アプリが変換APIへ送るのと同じ形（JPEG・画質 0.92＝lib/pages.ts の JPEG_QUALITY・最長辺 2200px まで）にして eval/cases/ に置く。
# 元の画像（docs/samples/*.png）は架空のダミー。塗った箇所は元の画像の時点で黒く塗ってある（「伏せる」のあとの形）。
import json, glob
from PIL import Image

MAX_SIDE = 2200      # lib/pages.ts の MAX_SIDE
QUALITY = 92         # lib/pages.ts の JPEG_QUALITY（0.92）
for path in sorted(glob.glob("eval/cases/*.json") + glob.glob("eval/cases/v2/*.json")):  # v1 と v2（P26）
    case = json.load(open(path, encoding="utf-8"))
    im = Image.open(case["source"]).convert("RGB")
    s = min(1.0, MAX_SIDE / max(im.size))
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    im.save(case["image"], "JPEG", quality=QUALITY)
    print(case["id"], case["source"], "→", case["image"], im.size)
