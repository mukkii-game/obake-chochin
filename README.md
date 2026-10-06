# game-template-web

Phaser 4 + Vite + TypeScript のブラウザゲーム雛形。push するだけで GitHub Pages に公開、手動ボタンで itch.io に公開。

## 新作の作り方
1. GitHub で「Use this template」→ repo 名は `game-<slug>`。
2. Settings → Pages → Source を「GitHub Actions」にする(1 回だけ)。
3. `SPEC.md` に企画を数行書いて push。AI が作り始める。
4. main に push されるたびに Pages が更新される。
5. itch.io に出す時: itch.io で作品ページ(Kind: HTML)を作り、Actions の「Publish to itch.io」を実行(secret `BUTLER_API_KEY` が必要)。

## 公開先の選び方
- **GitHub Pages**(既定、設定ゼロ)。repo が public の時だけ。
- **Cloudflare Pages**(任意)。repo が private でも公開できる。転送量が実質無制限、ブランチごとのプレビュー URL、Workers でサーバー処理(ランキング、セーブ同期、API 中継)。
  使うには secret `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を入れるだけ。無ければワークフローは自動で飛ばされる。
- **itch.io**。手動ボタンで push。

## 中身
- `src/core/` save / i18n / audio / input / demo / meta。毎回要るものだけ。
- `src/scenes/` Boot / Title / Play / Result。Play を作品に置き換える。
- `tools/check.mjs` 起動確認とスクショ(CI で走る)。`tools/record.mjs` 録画。`tools/promo.sh` 宣伝動画。
- `docs/phaser/reference/` Phaser 4 公式ドキュメント(書庫)。入口は `.claude/skills/phaser4/`。

## ローカル
```
npm ci && npm run dev
npm run build && npm run check
```

## URL パラメータ
- `?auto=1` 自動プレイ  `?lang=en` 英語
