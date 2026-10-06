---
name: phaser4
description: Phaser 4 の API を調べる。Phaser のコードを書いていて仕様が分からない時に使う。
---

# Phaser 4 の調べ方

公式ドキュメント(MIT, phaserjs/phaser より)を `docs/phaser/reference/<題目>/SKILL.md` に置いてある。
**必要な題目だけ読む。** 一覧を読む必要はない。

まず `ls docs/phaser/reference/` で題目名を見て、当たりを付けて 1 枚だけ開く。
題目名で決まらない時は `grep -ril "<探している API 名>" docs/phaser/reference/` で当てる。

Phaser 3 から変わった点と 4 の新機能は `v3-to-v4-migration` と `v4-new-features` にある。
**4 は新しいので、記憶で書かずにここを見ること。**
