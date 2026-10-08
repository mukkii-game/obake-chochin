"""選んだ候補をゲームに入れる(背景を抜いて、余白を切り、public/art/ に置き、manifest.json に書く)。

使い方:
  python tools/art/use.py g_fuwa assets/mine/candidates/g_fuwa/g_fuwa_12345.png
  python tools/art/use.py --remove g_fuwa      # 手続きの絵に戻す
背景の抜き方は prompts.json の bg(black = 暗い所を透明に / white = 明るい所を透明に / none = 抜かない)。
要るもの: pip install pillow
"""
import json, os, sys
from PIL import Image, ImageChops, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ART = os.path.join(ROOT, 'public', 'art')
MANIFEST = os.path.join(ART, 'manifest.json')


def key_out(im, mode):
    im = im.convert('RGBA')
    if mode == 'none':
        return im
    gray = im.convert('L')
    if mode == 'white':
        gray = ImageChops.invert(gray)
    # 背景(真っ黒 / 真っ白)に近いほど透明に。光る物の縁はなめらかに残す
    lo, hi = 18, 70
    alpha = gray.point(lambda v: 0 if v <= lo else 255 if v >= hi else int((v - lo) * 255 / (hi - lo)))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))
    im.putalpha(ImageChops.multiply(alpha, im.getchannel('A')))
    return im


def main():
    m = json.load(open(MANIFEST, encoding='utf-8')) if os.path.exists(MANIFEST) else {}
    if sys.argv[1] == '--remove':
        m.pop(sys.argv[2], None)
    else:
        key, src = sys.argv[1], sys.argv[2]
        spec = json.load(open(os.path.join(os.path.dirname(__file__), 'prompts.json'), encoding='utf-8'))
        mode = next((a['bg'] for a in spec['assets'] if a['key'] == key), 'black')
        im = key_out(Image.open(src), mode)
        if mode != 'none':
            box = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
            if box:
                im = im.crop(box)
        os.makedirs(ART, exist_ok=True)
        name = f'{key}.png'
        im.save(os.path.join(ART, name))
        m[key] = name
        print('ゲームに入れました:', os.path.relpath(os.path.join(ART, name), ROOT))
    json.dump(m, open(MANIFEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('CREDITS.md に、使ったモデル名とライセンスを書いてください(AGENTS.md の決まり)')


if __name__ == '__main__':
    main()
