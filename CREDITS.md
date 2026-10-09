# CREDITS(使った素材と規約)

<!-- 使った素材は全部ここに。書いていない素材は使わない。AI 生成はどの AI かも書く。
     評価: 人間が遊んで「良かった」ものに ★、イマイチは ✕(空欄でよい)。会議室が毎晩集めて「使った素材」表にする。 -->

| 素材 | 種類 | 出典 URL | ライセンス | クレジット文 | 用途 | 評価 |
|---|---|---|---|---|---|---|
| 絵すべて(巻物・夜の都の遠景・家・提灯・おばけ 3 種・月) | 手続き生成のコード(Claude が書いた Canvas2D の描画) | `src/game/art.ts` | この repo のライセンス | 不要 | 全画面 | |
| BGM サイバー16 | 魔王魂(森田交一)の配布音源 | https://maou.audio/bgm_cyber16/ | CC BY 4.0(魔王魂の規約も可) | 音楽：魔王魂 | 遊ぶ間の BGM(`public/audio/bgm_play.mp3`。112kbps に変換) | |
| 始まりの声「おばけが、くるぞー!」、日のはじめの声「いちにちめ、むかえぼん! / ふつかめ、なかび! / みっかめ、おぼん!」とやられた声(やられたー・ひゃー・うわーん・きゅうー・まいったー) | Open JTalk(pyopenjtalk)で合成。声は HTS Voice「Mei」(mei_happy / sad / bashful、半音 +3〜+7) | http://www.mmdagent.jp/ | Mei: CC BY 3.0(Copyright (c) 2009-2018 Nagoya Institute of Technology)/ Open JTalk: 修正 BSD | HTS Voice "Mei" (c) Nagoya Institute of Technology, CC BY 3.0 | `public/audio/vo_*.mp3` | |
| 弾ける音「ばしゅーん」 | Kenney「Sci-Fi Sounds」の laserLarge_001 と lowFrequency_explosion_001 を ffmpeg で重ねたもの | https://kenney.nl/assets/sci-fi-sounds | CC0 | 不要(任意: Kenney) | 提灯が弾ける音(`public/audio/se_boom.mp3`) | |
| 押した時の「カシャッ」(カメラのシャッター風) | 手続き生成(Claude が Python で帯域を絞った雑音の当たりを 2 回重ねて作った wav を mp3 に) | `public/audio/se_shutter.mp3` | この repo のライセンス | 不要 | 提灯を投げた瞬間 | |
| ほかの効果音すべて(太鼓・鈴・拍子木・寺の鐘・逃げる人の叫び声など) | 手続き生成のコード(Claude が書いた WebAudio 合成。残響も合成) | `src/game/sound.ts` `src/core/audio.ts` | この repo のライセンス | 不要 | 全場面 | |
| 文字「Mochiy Pop One」(タイトル・見出し)「M PLUS Rounded 1c」(ほかの文字) | Google Fonts から読み込み | https://fonts.google.com/ | SIL Open Font License 1.1 | 不要 | 文字(読めない時は端末の丸ゴシック) | |

※ `public/art/manifest.json` で絵を画像に差し替えた時は、その画像の行をここに足す(作ったモデル名・ライセンス)。作り方は `tools/art/README.md`。
※ 魔王魂の表記はタイトル画面の左下にも出している。
