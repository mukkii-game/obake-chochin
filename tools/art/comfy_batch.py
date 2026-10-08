"""ComfyUI で絵の候補をまとめて作る(手元の PC で動かす。クラウドの AI からは ComfyUI に届かない)。

使い方(ComfyUI を起動してから):
  python tools/art/comfy_batch.py --ckpt <チェックポイント名.safetensors>        # 既定の SDXL 系の流れで
  python tools/art/comfy_batch.py --workflow my_flow_api.json                    # 自分の流れ(API 形式で保存したもの)で
  python tools/art/comfy_batch.py --only g_fuwa,lantern --n 20                   # 一部だけ・数を変えて

--workflow を使う時は、流れの中の文字に {PROMPT} {NEGATIVE} {SEED} {WIDTH} {HEIGHT} を書いておくと差し込む。
出来た絵は assets/mine/candidates/<キー>/ に保存する。気に入ったものを tools/art/use.py でゲームに入れる。
ポートは既定 8188(ComfyUI Desktop は 8000 のことがある: --url http://127.0.0.1:8000)。
"""
import argparse, json, os, random, sys, time, urllib.request, urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def post(url, data):
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers={'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(req).read())


def get(url):
    return json.loads(urllib.request.urlopen(url).read())


def default_flow(ckpt, prompt, negative, seed, w, h, steps, cfg):
    """SDXL 系の素直な流れ(ComfyUI の標準ノードだけ)"""
    return {
        '1': {'class_type': 'CheckpointLoaderSimple', 'inputs': {'ckpt_name': ckpt}},
        '2': {'class_type': 'CLIPTextEncode', 'inputs': {'text': prompt, 'clip': ['1', 1]}},
        '3': {'class_type': 'CLIPTextEncode', 'inputs': {'text': negative, 'clip': ['1', 1]}},
        '4': {'class_type': 'EmptyLatentImage', 'inputs': {'width': w, 'height': h, 'batch_size': 1}},
        '5': {'class_type': 'KSampler', 'inputs': {'seed': seed, 'steps': steps, 'cfg': cfg, 'sampler_name': 'dpmpp_2m', 'scheduler': 'karras',
                                                    'denoise': 1.0, 'model': ['1', 0], 'positive': ['2', 0], 'negative': ['3', 0], 'latent_image': ['4', 0]}},
        '6': {'class_type': 'VAEDecode', 'inputs': {'samples': ['5', 0], 'vae': ['1', 2]}},
        '7': {'class_type': 'SaveImage', 'inputs': {'filename_prefix': 'obake', 'images': ['6', 0]}},
    }


def fill(flow, values):
    s = json.dumps(flow)
    for k, v in values.items():
        if isinstance(v, (int, float)):
            s = s.replace('"{%s}"' % k, str(v))
        s = s.replace('{%s}' % k, json.dumps(str(v))[1:-1])
    return json.loads(s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='http://127.0.0.1:8188')
    ap.add_argument('--ckpt', help='チェックポイント名(--workflow を使わない時)')
    ap.add_argument('--workflow', help='API 形式で保存した流れ(JSON)')
    ap.add_argument('--only', help='キーを , 区切りで')
    ap.add_argument('--n', type=int, help='候補の数(prompts.json の n を上書き)')
    ap.add_argument('--steps', type=int, default=28)
    ap.add_argument('--cfg', type=float, default=6.0)
    a = ap.parse_args()
    if not a.ckpt and not a.workflow:
        sys.exit('--ckpt か --workflow を指定してください(ComfyUI の models/checkpoints にあるファイル名)')
    spec = json.load(open(os.path.join(os.path.dirname(__file__), 'prompts.json'), encoding='utf-8'))
    custom = json.load(open(a.workflow, encoding='utf-8')) if a.workflow else None
    only = set(a.only.split(',')) if a.only else None
    for asset in spec['assets']:
        key = asset['key']
        if only and key not in only:
            continue
        out = os.path.join(ROOT, 'assets', 'mine', 'candidates', key)
        os.makedirs(out, exist_ok=True)
        bgw = {'black': ', isolated on a pure black background', 'white': ', isolated on a pure white background', 'none': ''}[asset['bg']]
        prompt = f"{asset['prompt']}, {spec['_style']}{bgw}"
        w, h = asset['size']
        for i in range(a.n or asset['n']):
            seed = random.randint(1, 2**31)
            vals = {'PROMPT': prompt, 'NEGATIVE': spec['_negative'], 'SEED': seed, 'WIDTH': w, 'HEIGHT': h}
            flow = fill(custom, vals) if custom else default_flow(a.ckpt, prompt, spec['_negative'], seed, w, h, a.steps, a.cfg)
            pid = post(a.url + '/prompt', {'prompt': flow})['prompt_id']
            while True:
                hist = get(a.url + '/history/' + pid)
                if pid in hist:
                    break
                time.sleep(1)
            for node in hist[pid]['outputs'].values():
                for im in node.get('images', []):
                    q = urllib.parse.urlencode({'filename': im['filename'], 'subfolder': im['subfolder'], 'type': im['type']})
                    data = urllib.request.urlopen(a.url + '/view?' + q).read()
                    path = os.path.join(out, f'{key}_{seed}.png')
                    open(path, 'wb').write(data)
                    print('saved', os.path.relpath(path, ROOT))


if __name__ == '__main__':
    main()
