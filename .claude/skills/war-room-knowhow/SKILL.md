---
name: war-room-knowhow
description: 新作の作り始め(元ネタ・参考コード探し)、素材・道具・AI モデル選び、ジャンルの定石、公開手続き(Steam/BOOTH/itch 等)、PC の道具(VOICEVOX・ComfyUI 等)の場所、ゲームに AI(会話・判定・NPC の思考・bot テスト)を入れる時、他の AI(GPT/Codex)に意見を聞く方法、既知の地雷で迷った時に、作戦会議室の最新の資料を引く。自分の記憶で答える前に使う。
---

# 作戦会議室の資料を引く

正本は公開 repo `mukkii-game/Perfect_Dev_Environment`。記憶より新しいので、関係する1つだけ読む。

読み方: `curl -sL https://raw.githubusercontent.com/mukkii-game/Perfect_Dev_Environment/main/<パス>`

| 迷っていること | 読むもの |
|---|---|
| どの AI・モデルを使うか | `knowledge/tables/ai.csv`, `knowledge/ai-models.md` |
| 素材・道具・ライブラリの出どころ | `knowledge/tables/assets.csv` |
| ジャンルの定石 | `knowledge/tables/genres.csv` |
| 「◯◯みたいなの」を作り始める(元ネタ・公開コードの探し方、ライセンス) | `knowledge/start-from-reference.md` |
| 公開・販売の手続き | `knowledge/tables/procedures.csv`, `knowledge/platforms.md` |
| エンジン選び | `knowledge/engines.md` |
| ローカル AI(ComfyUI・LLM) | `knowledge/local-ai.md` |
| PC の道具の場所(`G:\マイドライブ\ai\tools\` 等) | `global/pc-setup.md` |
| GPT/Codex に意見を聞く・画像を頼む | `topics/14-other-ai-routes.md` |
| ゲームに AI を入れる(会話 LLM・判定 Clef・ルールの選び方) | `knowledge/ai-in-games.md` |
| 環境の地雷 | `knowledge/env-gotchas.md` |
| 一覧 | `knowledge/README.md` |

- 使ったら HANDOFF の「全体に共有したい気づき」に1行: `会議室: <読んだファイル> / 役立った・古かった・無かった`(夜に回収され、使われ方の記録になる)。
- 他の作品でも踏みそうな気づきも同じ欄に書く。HANDOFF が無い repo なら、終わりにユーザーへ「会議室に伝えたい気づき」として短く示す。
- 会議室へ直接書き込まない。
