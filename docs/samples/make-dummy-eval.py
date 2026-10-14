# 評価キット（P20）用の判読しにくい手書き風ダミーメモを2枚作る一回きりのツール。
# 架空の内容で、実データは一切含まない。ビルドにもテストにも関わらない（手で動かすだけ）。
# 必要なもの: Python の PIL（Pillow）と macOS の Klee フォント。字の崩し方は make-dummy-04-hard.py と同じ。
#   docs/samples/dummy-memo-07-names.png   … 面談。架空の名前4か所を黒く塗ってある（「伏せる」のあと＝AIに送る形）。にじみ2か所
#   docs/samples/dummy-memo-08-symbols.png … 会議。→・↑・↓・？・！ を使う。にじみ2か所
# 正解（書き起こし・振り分け・にじませた箇所・塗った箇所）は eval/cases/*.json。乱数の種は固定。
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

KLEE = "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/81e879dcb4d596ab140f7cffcd5ccaaf8108519b.asset/AssetData/Klee.ttc"
SS = 2
INK = (36, 42, 56)


class Memo:
    def __init__(self, seed, w=1700, h=1500):
        random.seed(seed)
        self.W, self.H = w, h
        paper = Image.new("RGB", (w * SS, h * SS), (249, 247, 241))
        d = ImageDraw.Draw(paper)
        for y in range(120, h - 40, 60):
            d.line([(70 * SS, y * SS), ((w - 70) * SS, y * SS)], fill=(228, 226, 216), width=SS)
        for x in range(0, 55):
            a = int(20 * (1 - x / 55))
            d.line([(x * SS, 0), (x * SS, h * SS)], fill=(249 - a, 247 - a, 241 - a), width=SS)
        self.canvas = paper.convert("RGBA")
        self.Y = 100
        self.spans = {}  # 印の名前 → (x0, y0, x1, y1)

    def text(self, parts, x, y, size, jit=1.0, bold=False, faint=0.0):
        """parts: 文字列か (文字列, 印の名前) の並び。印の付いた部分の外形を覚える"""
        cx = x
        for part in parts:
            t, tag = (part, None) if isinstance(part, str) else part
            x0 = cx
            for ch in t:
                if ch == " ":
                    cx += size * 0.34
                    continue
                s = int(size * random.uniform(1 - 0.10 * jit, 1 + 0.10 * jit))
                f = ImageFont.truetype(KLEE, s * SS, index=0 if bold else 1)
                pad = s
                tile = Image.new("RGBA", ((s + pad * 2) * SS,) * 2, (0, 0, 0, 0))
                td = ImageDraw.Draw(tile)
                alpha = int(255 * random.uniform(0.62, 1.0) * (1 - faint))
                td.text((pad * SS, pad * SS), ch, font=f, fill=INK + (alpha,))
                if bold:
                    td.text((pad * SS + SS, pad * SS + SS // 2), ch, font=f, fill=INK + (alpha,))
                w0, h0 = tile.size
                tile = tile.resize((int(w0 * random.uniform(0.86, 1.06)), h0), Image.BICUBIC)
                tile = tile.rotate(random.uniform(-9, 9) * jit, resample=Image.BICUBIC, expand=False)
                dy = random.uniform(-0.16, 0.16) * size * jit
                self.canvas.alpha_composite(tile, (int((cx - pad) * SS), int((y - pad + dy) * SS)))
                cx += s * random.uniform(0.78, 0.98)
            if tag:
                # 字の外形（ゆれのぶん上下に余裕を取る）。にじみと塗りで左右の余白を変える（下の blot / mask）
                self.spans[tag] = (int(x0), y - 8, int(cx), y + size + 10)
        return cx

    def line(self, parts, x=110, size=44, jit=1.0, bold=False, faint=0.0, dy=60):
        if isinstance(parts, str):
            parts = [parts]
        self.text(parts, x, self.Y, size, jit, bold, faint)
        self.Y += dy

    def blot(self, tag, r):
        x0, y0, x1, y1 = self.spans[tag]
        x0, y0, x1, y1 = [v * SS for v in (x0 - 8, y0, x1 + 8, y1)]
        reg = self.canvas.crop((x0, y0, x1, y1)).filter(ImageFilter.GaussianBlur(r * SS))
        reg = ImageEnhance.Contrast(reg.convert("RGB")).enhance(0.72).convert("RGBA")
        self.canvas.paste(reg, (x0, y0))

    def mask(self, tag):
        # 「伏せる」で塗ったのと同じ真っ黒の四角（アプリの塗りは #000）
        x0, y0, x1, y1 = self.spans[tag]
        x0, y0, x1, y1 = [v * SS for v in (x0 - 4, y0 + 2, x1 - 2, y1 - 2)]
        ImageDraw.Draw(self.canvas).rectangle((x0, y0, x1, y1), fill=(0, 0, 0, 255))

    def save(self, out, mask_after_blur=True):
        bottom = int(self.Y + 40)
        im = self.canvas.convert("RGB").crop((0, 0, self.W * SS, min(bottom, self.H) * SS)).resize((self.W, min(bottom, self.H)), Image.LANCZOS)
        im = im.rotate(-0.8, resample=Image.BICUBIC, fillcolor=(249, 247, 241))
        im = im.filter(ImageFilter.GaussianBlur(0.6))
        im.save(out)
        print("saved", out, im.size)
        return im


# ---------- 07: 面談・名前を塗ったもの ----------
m = Memo(20261014)
m.line("面談 10/8(水) 15:00〜  事業所 相談室", 110, 48, 1.0, True)
m.line(["本人 ＋ 母（", ("鈴木 和子", "mask_mother"), "さん）同席"], 110, 44)
m.Y += 8
m.line("【家での様子】", 110, 46, 0.8, True)
m.line("・夜 22時 には 寝ている", 140, 42, 1.2)
m.line("・休日は 図書館へ 行く（週1）", 140, 42, 1.2)
m.line("・弟と ケンカ 増えた と 母", 140, 42, 1.3, faint=0.18)
m.Y += 8
m.line("【日中】", 110, 46, 0.8, True)
m.line("・B型 週4、作業は 袋詰め", 140, 42, 1.2)
m.line(["・職員 ", ("高橋", "mask_staff"), "さん と 相性 良い"], 140, 42, 1.3)
m.line(["・昼食 ", ("半分", "blot_half"), " 残す 日 あり"], 140, 42, 1.4)
m.Y += 8
m.line("【健康】", 110, 46, 0.8, True)
m.line(["・体重 ", ("2kg", "blot_kg"), " 減（3か月で）"], 140, 42, 1.4)
m.line("・歯科 受診 を すすめた", 140, 42, 1.2)
m.Y += 8
m.line("【次回】", 110, 46, 0.8, True)
m.line(["・担当：", ("中村", "mask_tanto"), "  ／  ", ("森", "mask_w"), "W と 共有"], 140, 42, 1.3)
m.line("・次回 11月 中旬", 140, 42, 1.2)
m.blot("blot_half", 4.6)
m.blot("blot_kg", 4.6)
for t in ("mask_mother", "mask_staff", "mask_tanto", "mask_w"):
    m.mask(t)
m.save("docs/samples/dummy-memo-07-names.png")

# ---------- 08: 会議・記号を使うもの ----------
m = Memo(20261015)
m.line("ケース会議 10/6(月) 10:00〜11:00  会議室", 110, 48, 1.0, True)
m.line("出席：管理者・サビ管・支援員 3名", 110, 44)
m.Y += 8
m.line("【様子】", 110, 46, 0.8, True)
m.line("・通所 日数 ↑（週3 → 週4）", 140, 42, 1.2)
m.line("・食事量 ↓、体重 も ↓？", 140, 42, 1.2)
m.line("・夜 眠れていない？ → 家族に 確認", 140, 42, 1.3, faint=0.18)
m.Y += 8
m.line("【送迎】", 110, 46, 0.8, True)
m.line("・雨の日 遅れ 多い！", 140, 42, 1.2)
m.line(["→ 出発を ", ("10分", "blot_10min"), " 早める で 決定"], 140, 42, 1.3)
m.Y += 8
m.line("【今後】", 110, 46, 0.8, True)
m.line(["・家族へ 連絡：サビ管 ", ("10/10", "blot_due"), " まで"], 140, 42, 1.4)
m.line("・通院 同行 の 調整：担当 未定！", 140, 42, 1.3)
m.line("・次回 11/4", 140, 42, 1.2)
m.blot("blot_10min", 4.6)
m.blot("blot_due", 4.6)
m.save("docs/samples/dummy-memo-08-symbols.png")
