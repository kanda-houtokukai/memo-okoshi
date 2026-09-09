# 判読しにくい手書き風ダミーメモ（P7-c モデル比較用）を作る一回きりのツール。
# 架空の内容で、実データは一切含まない。ビルドにもテストにも関わらない（手で動かすだけ）。
# 必要なもの: Python の PIL（Pillow）と macOS の Klee フォント。無い環境では動かない。
# 原本テキストと「わざと潰した5か所」は dummy-memo-04-hard.md にある。乱数の種は固定。
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

random.seed(20260910)
KLEE = "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/81e879dcb4d596ab140f7cffcd5ccaaf8108519b.asset/AssetData/Klee.ttc"
OUT = "docs/samples/dummy-memo-04-hard.png"
W, H, SS = 1700, 1500, 2

paper = Image.new("RGB", (W*SS, H*SS), (249, 247, 241))
d = ImageDraw.Draw(paper)
for y in range(120, H-40, 60):
    d.line([(70*SS, y*SS), ((W-70)*SS, y*SS)], fill=(228, 226, 216), width=SS)
for x in range(0, 55):
    a = int(20*(1-x/55)); d.line([(x*SS,0),(x*SS,H*SS)], fill=(249-a,247-a,241-a), width=SS)
canvas = paper.convert("RGBA")
INK = (36, 42, 56)

def draw_text(text, x, y, size, jit=1.0, bold=False, faint=0.0):
    cx = x
    for ch in text:
        if ch == " ":
            cx += size*0.34; continue
        s = int(size*random.uniform(1-0.10*jit, 1+0.10*jit))
        f = ImageFont.truetype(KLEE, s*SS, index=0 if bold else 1)
        pad = s
        tile = Image.new("RGBA", ((s+pad*2)*SS,)*2, (0,0,0,0))
        td = ImageDraw.Draw(tile)
        # 濃さを1文字ごとに散らす（かすれ）
        alpha = int(255*random.uniform(0.62, 1.0) * (1-faint))
        td.text((pad*SS, pad*SS), ch, font=f, fill=INK+(alpha,))
        if bold:
            td.text((pad*SS+SS, pad*SS+SS//2), ch, font=f, fill=INK+(alpha,))
        # 横に潰す／伸ばす
        w0, h0 = tile.size
        tile = tile.resize((int(w0*random.uniform(0.86, 1.06)), h0), Image.BICUBIC)
        tile = tile.rotate(random.uniform(-9, 9)*jit, resample=Image.BICUBIC, expand=False)
        dy = random.uniform(-0.16, 0.16)*size*jit
        canvas.alpha_composite(tile, (int((cx-pad)*SS), int((y-pad+dy)*SS)))
        cx += s*random.uniform(0.78, 0.98)   # 詰まって重なる
    return cx

def blot(box, r):
    x0,y0,x1,y1 = [v*SS for v in box]
    reg = canvas.crop((x0,y0,x1,y1)).filter(ImageFilter.GaussianBlur(r*SS))
    reg = ImageEnhance.Contrast(reg.convert("RGB")).enhance(0.72).convert("RGBA")
    canvas.paste(reg, (x0,y0))

Y = 100
def line(t, x=110, size=44, jit=1.0, bold=False, faint=0.0, dy=60):
    global Y
    draw_text(t, x, Y, size, jit, bold, faint); Y += dy

line("モニタリング  9/12(木) 14:00〜  自宅訪問", 110, 48, 1.0, True)
line("本人 ＋ 姉 同席", 110, 44)
Y += 8
line("【生活】", 110, 46, 0.8, True)
line("・起床 7:00 頃、朝食は 食べたり 食べなかったり", 140, 42, 1.2)
line("・週3 で B型作業所（送迎あり）", 140, 42, 1.2)
line("・部屋の 片づけが 苦手 → ヘルパーと 一緒に 月2回", 140, 42, 1.3, faint=0.22)
Y += 8
line("【服薬】", 110, 46, 0.8, True)
y1 = Y; line("・眠剤 は 自己管理、飲み忘れ 週1〜2", 140, 42, 1.4)
y2 = Y; line("・訪看 から 声かけ もらっている", 140, 42, 1.4)
Y += 8
line("【就労】", 110, 46, 0.8, True)
y3 = Y; line("・工賃 は 月 12,000円 くらい", 140, 42, 1.3)
line("・「もう少し 増やしたい」との 発言", 140, 42, 1.3, faint=0.18)
line("・サビ管 と 個支計 の 見直しを 10月に 予定", 140, 42, 1.4)
Y += 8
line("【困りごと】", 110, 46, 0.8, True)
line("・金銭管理、月末に 苦しくなる", 140, 42, 1.2)
line("・姉「本人に 任せると 使いすぎる」", 140, 42, 1.3, faint=0.2)
Y += 8
line("【次回】", 110, 46, 0.8, True)
y4 = Y; line("・ケース会 10/3 、モニタ は 11月", 140, 42, 1.3)

blot((138, y1-10, 268, y1+48), 3.4)   # 眠剤
blot((520, y1-10, 700, y1+48), 3.0)   # 週1〜2
blot((138, y2-10, 258, y2+48), 3.6)   # 訪看
blot((300, y3-10, 520, y3+48), 2.9)   # 12,000円
blot((300, y4-10, 430, y4+48), 3.2)   # 10/3

bottom = int((Y+40))
out = canvas.convert("RGB").crop((0, 0, W*SS, min(bottom*SS, H*SS))).resize((W, min(bottom, H)), Image.LANCZOS)
out = out.rotate(-0.8, resample=Image.BICUBIC, fillcolor=(249,247,241))
out = out.filter(ImageFilter.GaussianBlur(0.6))
out.save(OUT)
print("saved", out.size)
