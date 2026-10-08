# 絵を AI で作って差し替える

ゲームの絵はすべて `src/game/art.ts` が手続きで描いている。下の流れで、**キーごとに画像へ差し替えられる**(差し替えなければ手続きの絵のまま)。

## 流れ(手元の PC。ComfyUI を使う場合)
1. ComfyUI を起動する(Desktop 版はポートが 8000 のことがある)。
2. 候補をまとめて作る:
   `python tools/art/comfy_batch.py --ckpt <チェックポイント名>`
   (自分の流れを使うなら `--workflow 流れ_api.json`。中に `{PROMPT}` `{NEGATIVE}` `{SEED}` `{WIDTH}` `{HEIGHT}` を書く)
   → `assets/mine/candidates/<キー>/` に溜まる(git には入れない)。
3. 気に入ったものを入れる:
   `python tools/art/use.py g_fuwa assets/mine/candidates/g_fuwa/g_fuwa_12345.png`
   → 背景を抜いて `public/art/g_fuwa.png` に置き、`public/art/manifest.json` に書く。
4. `npm run dev` で見る。戻すなら `python tools/art/use.py --remove g_fuwa`。
5. `CREDITS.md` に使ったモデル名とライセンスを書いて push。

商用に使えるモデルを選ぶ(会議室の knowledge/local-ai.md の表: FLUX.2 klein 4B は Apache 2.0 で可、SDXL 系は派生ごとに確認)。

## ChatGPT / Gemini で作る場合
`prompts.json` の `_style` と各 `prompt` をつなげて貼る(背景は「pure black background」/「pure white background」と指定)。
保存した画像を 3 と同じく `use.py` で入れる。

## キーと大きさ(表示される大きさ。縦横比が合っていると綺麗に収まる)
| キー | 何 | 枠 (px) | 背景 |
|---|---|---|---|
| g_fuwa | まっすぐ来る幽霊 | 48×56 | 黒 |
| g_kasa | ジグザグの唐傘 | 52×60 | 黒 |
| g_oni | 曲がって来る鬼火 | 48×56 | 黒 |
| lantern | 提灯 | 36×52 | 黒 |
| house_vline_lit / _dark | 縦の楼(縦に光る家) | 72×72 | 白 |
| house_hline_lit / _dark | 長屋(横に光る家) | 72×72 | 白 |
| moon | 月 | 90×90 | 黒 |
| bg | 背景一枚(960×540 全体) | 960×540 | 抜かない |

候補は多めに作って選ぶ(1 キー 10 枚前後)。並べて見比べるなら、フォルダを画像ビューアで開くのが早い。
