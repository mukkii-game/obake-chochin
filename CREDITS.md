# CREDITS(使った素材と規約)

<!-- 使った素材は全部ここに。書いていない素材は使わない。AI 生成はどの AI かも書く。
     評価: 人間が遊んで「良かった」ものに ★、イマイチは ✕(空欄でよい)。会議室が毎晩集めて「使った素材」表にする。 -->

| 素材 | 種類 | 出典 URL | ライセンス | クレジット文 | 用途 | 評価 |
|---|---|---|---|---|---|---|
| 絵すべて(巻物・夜の都の遠景・家・提灯・おばけ 3 種・月) | 手続き生成のコード(Claude が書いた Canvas2D の描画) | `src/game/art.ts` | この repo のライセンス | 不要 | 全画面 | |
| BGM「ネオ・ユートピア」(ネオロック57) | 魔王魂(森田交一)の配布音源 | https://maou.audio/bgm_neorock57/ | CC BY 4.0(魔王魂の規約も可) | 音楽：魔王魂 | タイトルの BGM(`public/audio/bgm_title.mp3`。112kbps に変換) | |
| BGM「Speed Rush」(ネオロック74) | 魔王魂(森田交一)の配布音源 | https://maou.audio/bgm_neorock74/ | CC BY 4.0(魔王魂の規約も可) | 音楽：魔王魂 | 遊ぶ間の BGM(`public/audio/bgm_rock.mp3`。112kbps に変換。曲の終わりから頭へ戻る) | |
| 弾ける音「ばしゅーん」 | Kenney「Sci-Fi Sounds」の laserLarge_001 と lowFrequency_explosion_001 を ffmpeg で重ねたもの | https://kenney.nl/assets/sci-fi-sounds | CC0 | 不要(任意: Kenney) | 提灯が弾ける音(`public/audio/se_boom.mp3`) | |
| ほかの効果音すべて(太鼓・鈴・拍子木・寺の鐘・逃げる人の叫び声など) | 手続き生成のコード(Claude が書いた WebAudio 合成。残響も合成) | `src/game/sound.ts` `src/core/audio.ts` | この repo のライセンス | 不要 | 全場面 | |
| 文字 | 端末の明朝体フォント(読み込みなし) | — | 端末に依存 | 不要 | 文字 | |

※ `public/art/manifest.json` で絵を画像に差し替えた時は、その画像の行をここに足す(作ったモデル名・ライセンス)。作り方は `tools/art/README.md`。
※ 魔王魂の表記はタイトル画面の左下にも出している。
