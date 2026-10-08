# カメラのシャッター風「カシャッ」を作る(public/audio/se_shutter.mp3 の元)。
# 使い方: python3 tools/sfx/shutter.py && ffmpeg -y -i shutter.wav -b:a 96k public/audio/se_shutter.mp3
# 鋭い当たり(カ)+ 短いこすれ(シャ)+ 戻りの当たり(ッ)を、帯域を絞った雑音で重ねる。
import numpy as np, wave
sr = 44100
rng = np.random.default_rng(7)
def burst(dur, f_lo, f_hi, decay):
    n = int(sr * dur); x = rng.standard_normal(n)
    X = np.fft.rfft(x); f = np.fft.rfftfreq(n, 1 / sr); X[(f < f_lo) | (f > f_hi)] = 0; x = np.fft.irfft(X, n)
    return x * np.exp(-np.arange(n) / (sr * decay))
out = np.zeros(int(sr * 0.22))
def put(sig, t, g):
    i = int(sr * t); out[i:i + len(sig)] += sig[:len(out) - i] * g
put(burst(0.03, 2500, 9000, 0.004), 0.0, 1.0)
put(burst(0.05, 600, 2500, 0.010), 0.0, 0.6)
put(burst(0.06, 3000, 12000, 0.020), 0.012, 0.25)
put(burst(0.03, 1800, 7000, 0.005), 0.075, 0.85)
put(burst(0.05, 400, 1800, 0.012), 0.075, 0.5)
out /= np.max(np.abs(out)); out *= 0.89
w = wave.open('shutter.wav', 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
w.writeframes((out * 32767).astype(np.int16).tobytes()); w.close()
