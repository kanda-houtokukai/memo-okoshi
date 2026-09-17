# 印刷した「会議記録メモ」の用紙に手書きで記入した、という想定のダミー（P9-c の確認用）を作る一回きりのツール。
# 架空の内容で、実データは一切含まない（人名・事業所名も架空）。ビルドにもテストにも関わらない（手で動かすだけ）。
# 必要なもの: Python の PIL（Pillow）、macOS の Klee（手書き）とヒラギノ角ゴシック（印刷の文字）。無い環境では動かない。
# 原本テキストは dummy-memo-06-meeting-sheet.md にある。乱数の種は固定。
# 見るべき点: **会議名は頭の「会議名」欄にだけ書いてある**（本文には出てこない）。AIがそこから会議概要に入れられるか。
# 用紙の割り付けは P9-d の会議の用紙（2026-09-17 に「宿題」→「今後の対応」・内容23本/決定事項と今後の対応6本に作り直した）。元は P9-c の会議の用紙（頭: 題＋会議名／日時のマス／場所／出席者・右上に押印欄。枠: 内容／決定事項・宿題／その他）。
import random
from PIL import Image, ImageDraw, ImageFont

random.seed(20260917 + 6)
KLEE = "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/81e879dcb4d596ab140f7cffcd5ccaaf8108519b.asset/AssetData/Klee.ttc"
GO3 = "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"
GO6 = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
OUT = "docs/samples/dummy-memo-06-meeting-sheet.png"

MM = 8  # 1mm = 8px（A4 の印字範囲 192×279mm → 1536×2232px）
W, H = 192 * MM, 279 * MM
img = Image.new("RGB", (W + 2 * 9 * MM, H + 2 * 9 * MM), (252, 251, 247))
d = ImageDraw.Draw(img)
OX, OY = 9 * MM, 9 * MM  # 余白 9mm

def P(x, y):
    return (OX + x * MM, OY + y * MM)

def text(x, y, s, size_pt, font=GO3, fill=(60, 58, 52)):
    f = ImageFont.truetype(font, int(size_pt * 25.4 / 72 * MM))
    d.text(P(x, y), s, font=f, fill=fill)

def rect(x0, y0, x1, y1, w=2, fill=None, outline=(70, 68, 62)):
    d.rectangle([P(x0, y0), P(x1, y1)], outline=outline, width=w, fill=fill)

def hline(x0, x1, y, w=2, fill=(150, 146, 138)):
    d.line([P(x0, y), P(x1, y)], fill=fill, width=w)

def dotted(x0, x1, y):
    x = x0
    while x < x1:
        d.line([P(x, y), P(min(x + 0.5, x1), y)], fill=(190, 190, 190), width=2)
        x += 1.0

INK = (30, 38, 60)
def hand(x, y, s, size_mm=4.6, jit=1.0):
    cx = OX + x * MM
    for ch in s:
        if ch == " ":
            cx += size_mm * MM * 0.35
            continue
        px = int(size_mm * MM * random.uniform(0.92, 1.08))
        f = ImageFont.truetype(KLEE, px, index=1)
        tile = Image.new("RGBA", (px * 2, px * 2), (0, 0, 0, 0))
        ImageDraw.Draw(tile).text((px // 2, px // 2), ch, font=f, fill=INK + (int(255 * random.uniform(0.75, 1.0)),))
        tile = tile.rotate(random.uniform(-6, 6) * jit, resample=Image.BICUBIC)
        img.paste(tile, (int(cx - px // 2), int(OY + y * MM - px // 2 + random.uniform(-1, 1) * jit * 3)), tile)
        cx += px * random.uniform(0.84, 0.97)

# ---- 頭 ----
text(0, 0.6, "会議記録メモ", 12, GO6, (40, 38, 34))
text(31, 3.2, "会議名", 8, GO6)
hline(40, 158.9, 7.4)
hand(43, 2.3, "第2回 送迎検討会", 5.0)
# 押印欄（作成者／署名）
rect(161.9, 0, 192, 19.7, w=2)
d.line([P(176.95, 0), P(176.95, 19.7)], fill=(70, 68, 62), width=2)
hline(161.9, 192, 4.7, fill=(70, 68, 62))
text(164.5, 1.0, "作成者", 7, GO6)
text(180.8, 1.0, "署名", 7, GO6)
# 日時のマス
y0 = 9.4
text(0, y0 + 2.6, "日時", 8, GO6)
x = 8
cells = [(13, "R8"), (7, "9"), (7, "24"), (7, "15"), (7, "00"), (7, "16"), (7, "10")]
units = ["年", "月", "日", "時", "分", "時", "分"]
for i, ((w, v), u) in enumerate(zip(cells, units)):
    rect(x, y0, x + w, y0 + 7, w=2, outline=(150, 146, 138))
    hand(x + 1.2, y0 + 1.2, v, 4.4)
    x += w + 0.8
    text(x, y0 + 3.2, u, 8)
    x += 4
    if i == 4:
        text(x, y0 + 3.0, "〜", 8)
        x += 4.5
# 場所
y1 = 19.0
text(0, y1 + 4.0, "場所", 8, GO6)
hline(8, 158.9, y1 + 8)
hand(11, y1 + 2.6, "ひだまり 2階 相談室", 4.8)
# 出席者（押印欄の下まで横いっぱい）
y2 = 29.6
text(0, y2 + 4.0, "出席者", 8, GO6)
hline(11, 192, y2 + 8)
hand(14, y2 + 2.6, "管理者・サビ管 山本・支援員2名・運転手", 4.6)
d.line([P(0, 40.0), P(192, 40.0)], fill=(20, 20, 20), width=4)

# ---- 枠 ----
def box(x0, y0, x1, y1, label, color, lines):
    rect(x0, y0, x1, y1, w=2)
    d.rectangle([P(x0, y0), P(x1, y0 + 5.2)], fill=(239, 236, 230), outline=(70, 68, 62), width=2)
    d.rectangle([P(x0 + 1.6, y0 + 1.1), P(x0 + 2.6, y0 + 4.1)], fill=color)
    text(x0 + 4, y0 + 1.0, label, 8.5, GO6)
    for i in range(lines):
        dotted(x0 + 1.6, x1 - 1.6, y0 + 8.4 + 6 * (i + 1) - 6 + 6)
    return y0 + 8.4

top = 42.4
b1 = box(0, top, 192, top + 150.7, "内容", (147, 169, 192), 23)
lines_body = [
    "【送迎ルート】",
    "・朝便 A ルート 9:20 着 が 多い（15分 遅れ）",
    "・保護者から 事前連絡 が ほしい との声",
    "・B ルートと 入れ替える 案 → 運転手さん 了承",
    "【車いす 対応】",
    "・リフト車 1台 のみ、雨の日 乗降 に 時間",
    "・スロープ の 位置 を 変える 案、要見積",
]
for i, s in enumerate(lines_body):
    hand(4, b1 + 1.2 + i * 6, s, 4.2)

top2 = top + 150.7 + 2.4
b2 = box(0, top2, 94.8, top2 + 47.8, "決定事項", (203, 180, 120), 6)
b3 = box(97.2, top2, 192, top2 + 47.8, "今後の対応", (195, 154, 138), 6)
for i, s in enumerate(["・10/1 から A・B の 順番を", "  入れ替える", "・遅れる時は 8:50 までに", "  電話 連絡 する"]):
    hand(3, b2 + 1.2 + i * 6, s, 4.2)
for i, s in enumerate(["・新時刻表 作成 → 山本", "  9/30 まで", "・スロープ 見積 依頼", "  （担当？）"]):
    hand(100, b3 + 1.2 + i * 6, s, 4.2)

top3 = top2 + 47.8 + 2.4
b4 = box(0, top3, 192, top3 + 27.85, "その他", (123, 118, 108), 3)
hand(4, b4 + 1.2, "・次回 10/22(水) 15:00", 4.2)
text(176, 272.5, "メモおこし", 6, GO3, (170, 165, 158))

img.save(OUT)
print(OUT, img.size)
