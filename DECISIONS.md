# DECISIONS.md

Durable design decisions. Append briefly; do not rewrite history.

## 2026-08-29 — Vite, TypeScript and npm are the web baseline

The template uses a framework-free Vite + TypeScript starter and a committed npm
lockfile. Product repositories can add a UI framework when the product needs one.

## 2026-08-29 — CI is delegated to a pinned reusable workflow

`.github/workflows/ci.yml` calls
`mukkii-game/ai-dev-infra/.github/workflows/verify-web.yml@v1`. The central
workflow owns type checking, unit tests, the production build, Chromium E2E and
the `web-build` artifact. The protected `v1` tag prevents silent CI drift.

## 2026-08-29 — Repository administration is a human boundary

The Merge Guard enables native auto-merge for ordinary same-repository pull
requests only. It fails closed for forks, incomplete API results and any change
that touches or renames `.github/**`. It never checks out or executes pull
request code.

## 2026-08-29 — Pages publishes the artifact CI verified

The Pages workflow downloads only the triggering CI run's `web-build` artifact
and never checks out, installs, rebuilds or executes repository code. It handles
both bot auto-merges and human merges, proves the artifact matches the current
`main`, and rechecks `main` immediately before deployment.

## 2026-08-29 — Vite output is portable across project-site paths

Vite `base` is `./`, so the same CI artifact works under
`https://mukkii-game.github.io/REPOSITORY_NAME/` without rebuilding.

## 2026-08-30 — Infrastructure v2 centralizes Guard and Pages

CI, Merge Guard and Pages are small callers of the protected `ai-dev-infra@v2`
workflows. The template test suite verifies their exact references, permissions
and concurrency settings because those caller-owned settings cannot be enforced
inside a reusable workflow.

## 2026-09-14 — Rebuilt as the Phaser 4 game template

Replaced the framework-free starter and its PR / merge-guard / central-CI
plumbing with a Phaser 4 game template: direct push to main, one Pages
workflow with a Playwright smoke check, one manual itch.io workflow, and a
small `src/core` layer (save, i18n, audio, input, demo, meta). Rationale in
mukkii-game/Perfect_Dev_Environment decisions of 2026-09-13.
