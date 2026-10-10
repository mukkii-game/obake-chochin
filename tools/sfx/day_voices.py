# 日のはじめの声(vo_day1〜3.wav)を Open JTalk + HTS Voice「Mei」(mei_happy)で作る。
# かなで書くと語の切れ目を間違えて抑揚がおかしくなる(「ふつ|かめ」など)ので、漢字で書いて、
# 読みとアクセントがずれる語(中日 → なかび・平板)だけ手で直す。
# 使い方: python3 tools/sfx/day_voices.py <mei_happy.htsvoice> <出力フォルダ>
#   声は MMDAgent_Example(http://www.mmdagent.jp/)の Voice/mei/mei_happy.htsvoice
import sys, wave
import numpy as np
import pyopenjtalk
from pyopenjtalk import HTSEngine

voice, outdir = sys.argv[1], sys.argv[2]
LINES = {
    'day1': ('一日目、迎え盆!', {}),
    'day2': ('二日目、中日!', {'中日': ('ナカビ', 0, 3)}),  # 読み・アクセント核(0 = 平板)・拍の数
    'day3': ('三日目、お盆!', {}),
}
for name, (text, fix) in LINES.items():
    njd = pyopenjtalk.run_frontend(text)
    for w in njd:
        if w['string'] in fix:
            pron, acc, mora = fix[w['string']]
            w.update(pron=pron, read=pron, acc=acc, mora_size=mora)
    print(name, [(w['string'], w['pron'], w['acc']) for w in njd])
    e = HTSEngine(voice.encode())
    e.set_speed(1.05)
    e.add_half_tone(4.0)
    x = e.synthesize(pyopenjtalk.make_label(njd))
    x = np.clip(x, -32768, 32767).astype(np.int16)
    with wave.open(f'{outdir}/{name}.wav', 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(e.get_sampling_frequency()); f.writeframes(x.tobytes())
