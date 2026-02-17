# AGENTS.md

## Overview

rekishi — SaaS向け監査ログ基盤（OSS/Cloud）

プロダクトの詳細は [PRODUCT.md](PRODUCT.md) を参照。

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**:
  - API: Hono
  - Web: React + TanStack Start (Router + Query)
- **Build**: Vite + @cloudflare/vite-plugin
- **Language**: TypeScript (strict)
- **Package Manager**: Bun (workspaces)
- **UI Development**: Storybook

## Project Structure

```
apps/           # アプリケーション
  api/          # 監査ログAPI（Hono + Cloudflare Workers + Vite）
  web/          # Webフロントエンド（React + TanStack Start + Vite）
packages/       # 共有パッケージ（今後追加）
docs/           # ドキュメント
```

## Development

```bash
bun dev          # 全ワークスペースの dev server 起動
bun run build    # 全ワークスペースのビルド
bun run deploy   # 全ワークスペースのデプロイ
```
