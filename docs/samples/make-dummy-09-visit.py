# 見学記録（P21）のダミーメモを作る一回きりのツール。架空の内容で、実データは一切含まない。ビルドにもテストにも関わらない。
# 印刷した「見学記録」の用紙（題＋左に項目名・右に書く欄の2列の表）に手書きで記入した、という想定。
# 名前・来所者の名前・住所は「伏せる」で塗ったあと（アプリに送る形）にしてある。内容の1か所（体験の日付）をにじませた。
# 必要なもの: Python の PIL と macOS の Klee フォント。字の崩し方は make-dummy-eval.py と同じ。正解は dummy-memo-09-visit.md。
import importlib.util, random
from PIL import Image, ImageDraw, ImageFont

spec = importlib.util.spec_from_file_location("ev", "docs/samples/make-dummy-eval.py")
src = open("docs/samples/make-dummy-eval.py", encoding="utf-8").read()
src = src[: src.index("# ---------- 07")]  # Memo の作りだけを使う（07・08 は作り直さない）
ns = {}
exec(src, ns)
Memo, SS, KLEE = ns["Memo"], ns["SS"], ns["KLEE"]

W, H = 1700, 2400
m = Memo(20261016, W, H)
# 用紙を白紙に描き直す（ノートの罫線を消し、印刷した表を描く）
paper = Image.new("RGBA", (W * SS, H * SS), (252, 251, 248, 255))
m.canvas = paper
d = ImageDraw.Draw(m.canvas)
PX = W / 210  # 1mm あたりの画素（A4 の幅に合わせる）
mm = lambda v: v * PX * SS
left, top = 9, 9
d.text((mm(left), mm(top)), "見学記録", font=ImageFont.truetype(KLEE, int(mm(4.6)), index=0), fill=(30, 30, 30, 255))
t0 = top + 9.5
labels = ["名前", "日時", "来所者", "通園、通所先", "住所", "事前情報", "内容"]
rows = [10] * 6 + [279 - 9.5 - 60]
x0, x1, xl = left, 210 - left, left + 192 * 0.2
y = t0
gray = (138, 138, 138, 255)
lf = ImageFont.truetype("/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc", int(mm(3.2)))
ys = []
for i, (lb, h) in enumerate(zip(labels, rows)):
    d.rectangle((mm(x0), mm(y), mm(xl), mm(y + h)), fill=(243, 241, 235, 255))
    d.text((mm(x0 + 2), mm(y + (3 if i < 6 else 2.4))), lb, font=lf, fill=(40, 40, 40, 255))
    ys.append(y)
    y += h
for yy in ys + [y]:
    d.line((mm(x0), mm(yy), mm(x1), mm(yy)), fill=gray, width=SS)
for xx in (x0, xl, x1):
    d.line((mm(xx), mm(t0), mm(xx), mm(y)), fill=gray, width=SS)
for k in range(1, 34):
    yy = ys[6] + 1 + 6 * k
    for xx in range(int(mm(xl + 1.6)), int(mm(x1 - 1.6)), 6 * SS):
        d.point((xx, mm(yy)), fill=(189, 189, 189, 255))

hx = xl + 4  # 書く欄の左端（mm）
def write(row, parts, dy=0, size=34, jit=1.1):
    m.text(parts, int(hx * PX), int((ys[row] + 2.2 + dy) * PX), size, jit)

write(0, [("鈴木 ひかり", "mask_name")])
write(1, ["R8. 10/9（木） 10:00〜11:00"])
write(2, ["母（", ("鈴木", "mask_mother"), "）・相談支援 ", ("田村", "mask_sw"), "さん"])
write(3, ["ひまわり保育園 年長"])
write(4, [("〇〇市 さくら町 3-12", "mask_addr")])
write(5, ["相談支援から紹介。言葉の遅れ、集団が苦手"])
body = [
    ["・園の様子を見学（30分）。体操の時間に参加"],
    ["・母「送迎の時間が合うか心配」→ 9:30 到着なら可"],
    ["・本人 はじめは 母から離れず → 10分ほどで 遊具へ"],
    ["・体験利用 希望 → ", ("10/16", "blot_trial"), "（木）で 調整"],
    ["・利用料・受給者証 について 説明した"],
]
for k, parts in enumerate(body):
    m.text(parts, int(hx * PX), int((ys[6] + 1 + 6 * k + 1.2) * PX), 34, 1.2)
m.blot("blot_trial", 4.6)
for t in ("mask_name", "mask_mother", "mask_sw", "mask_addr"):
    m.mask(t)
m.Y = int((ys[6] + 1 + 6 * 7) * PX) + 120
out = m.canvas.convert("RGB").resize((W, H), Image.LANCZOS).crop((0, 0, W, int(m.Y)))
out.save("docs/samples/dummy-memo-09-visit.png")
print("saved", out.size)
