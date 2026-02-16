# AGENTS.md

## Overview

rekishi — SaaS向け監査ログ基盤（OSS/Cloud）

プロダクトの詳細は [PRODUCT.md](PRODUCT.md) を参照。

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Language**: TypeScript (strict)
- **Package Manager**: Bun (workspaces)

## Project Structure

```
apps/           # アプリケーション
  api/          # 監査ログAPI（Hono + Cloudflare Workers）
packages/       # 共有パッケージ（今後追加）
docs/           # ドキュメント
```
