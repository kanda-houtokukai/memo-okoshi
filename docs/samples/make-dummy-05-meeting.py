# 会議メモの手書き風ダミー（P9 の会議変換の確認用）を作る一回きりのツール。
# 架空の内容で、実データは一切含まない（人名も架空）。ビルドにもテストにも関わらない（手で動かすだけ）。
# 必要なもの: Python の PIL（Pillow）と macOS の Klee フォント。無い環境では動かない。
# 原本テキストは dummy-memo-05-meeting.md にある。乱数の種は固定。
# 走り書きらしく、内容・決定・今後の対応（旧「宿題」）を段落の中に混ぜて書いてある（AIが振り分けられるかを見る素材）。
import random
from PIL import Image, ImageDraw, ImageFont

random.seed(20260917)
KLEE = "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/81e879dcb4d596ab140f7cffcd5ccaaf8108519b.asset/AssetData/Klee.ttc"
OUT = "docs/samples/dummy-memo-05-meeting.png"
W, H, SS = 1700, 1560, 2

paper = Image.new("RGB", (W*SS, H*SS), (250, 248, 242))
d = ImageDraw.Draw(paper)
for y in range(120, H-40, 60):
    d.line([(70*SS, y*SS), ((W-70)*SS, y*SS)], fill=(226, 224, 214), width=SS)
canvas = paper.convert("RGBA")
INK = (34, 40, 54)

def draw_text(text, x, y, size, jit=1.0, bold=False):
    cx = x
    for ch in text:
        if ch == " ":
            cx += size*0.34; continue
        s = int(size*random.uniform(1-0.08*jit, 1+0.08*jit))
        f = ImageFont.truetype(KLEE, s*SS, index=0 if bold else 1)
        pad = s
        tile = Image.new("RGBA", ((s+pad*2)*SS,)*2, (0,0,0,0))
        td = ImageDraw.Draw(tile)
        alpha = int(255*random.uniform(0.7, 1.0))
        td.text((pad*SS, pad*SS), ch, font=f, fill=INK+(alpha,))
        if bold:
            td.text((pad*SS+SS, pad*SS+SS//2), ch, font=f, fill=INK+(alpha,))
        w0, h0 = tile.size
        tile = tile.resize((int(w0*random.uniform(0.9, 1.05)), h0), Image.BICUBIC)
        tile = tile.rotate(random.uniform(-7, 7)*jit, resample=Image.BICUBIC, expand=False)
        dy = random.uniform(-0.12, 0.12)*size*jit
        canvas.alpha_composite(tile, (int((cx-pad)*SS), int((y-pad+dy)*SS)))
        cx += s*random.uniform(0.82, 0.98)
    return cx

Y = 95
def line(t, x=110, size=44, jit=1.0, bold=False, dy=60):
    global Y
    draw_text(t, x, Y, size, jit, bold); Y += dy

line("運営会議  9/14(月) 14:00〜15:30  本部会議室", 110, 48, 1.0, True)
line("出席: 施設長・サビ管・相談員(佐藤)・看護師   欠: 栄養士", 110, 42)
Y += 6
line("【送迎】", 110, 46, 0.8, True)
line("・朝の便 集中 → 到着 遅れる日 あり", 140, 42, 1.2)
line("・ルート 2系統に 分ける案（相談員）", 140, 42, 1.2)
line("・増車は 今年度 むずかしい（施設長）", 140, 42, 1.3)
line("→ 10月から 2系統で 決定", 160, 44, 1.1, True)
line("・新ルート案 作成: 佐藤 9月末まで", 140, 42, 1.2)
Y += 6
line("【夏行事 ふり返り】", 110, 46, 0.8, True)
line("・参加 例年より 多い", 140, 42, 1.2)
line("・休憩 増やした → 熱中症 なし ○", 140, 42, 1.3)
line("・保護者「駐車場 分かりにくい」", 140, 42, 1.3)
line("→ 次回 案内図 配る（担当 未定）", 160, 44, 1.1, True)
line("・周知文 作成: サビ管（期限?）", 140, 42, 1.2)
Y += 6
line("【その他】", 110, 46, 0.8, True)
line("・車両 増車 → 来年度 予算で 検討", 140, 42, 1.3)
line("・次回 10/12 14:00", 140, 42, 1.2)

canvas.convert("RGB").resize((W, H), Image.LANCZOS).save(OUT, quality=92)
print(OUT)
