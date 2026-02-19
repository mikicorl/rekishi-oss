# API Architecture Draft (暫定)

> [!WARNING]
> このドキュメントは**暫定方針（Draft）**です。  
> **最終決定ではありません。** 実装開始前に ADR で確定してください。

## 1. 目的（暫定）

- `apps/api` のアーキテクチャ方針を、議論可能な形で明文化する
- 記事「Architecture for Disposable Systems」の考え方を rekishi の監査ログ要件へ適用する
- 実装に先行して「壊れにくい部分」と「交換可能な部分」の境界を定める

> [!IMPORTANT]
> ここで定義する構成は**提案段階**です。  
> 合意前は「参考案」として扱ってください。

## 2. 前提

- プロダクト要件: 改ざん不可、マルチテナント、検索・エクスポート、将来の Cloud 展開
- 現時点の `apps/api` は最小テンプレート構成であり、今が境界設計の最適タイミング
- 設計ゴールは「Durable Core を守り、Disposable Layer を速く回す」こと

## 3. アーキテクチャ方針（暫定）

### 3.1 Durable Core（長寿命）

- 監査ログの不変条件を定義する層
- 例: `AuditEvent` の整合性、`Idempotency`、`Tenant` 境界、`Retention` ルール
- HTTP や DB 実装への依存を禁止する

### 3.2 Immutable Contracts（固定契約）

- 外部 API と内部イベントの契約を versioned で固定する層
- 例: request/response DTO、共通エラー形式、ページング契約
- 破壊的変更は `v2` 追加で扱い、`v1` は維持する

### 3.3 Disposable Layer（交換可能）

- Hono route/handler、Cloudflare 依存アダプタを置く層
- 変化頻度が高い前提で、差し替えしやすく保つ
- Durable Core へは Port 経由のみで接続する

## 4. ディレクトリ構成案（feature colocation / 暫定）

```txt
apps/
  api/
    src/
      app/
        bootstrap/
        middleware/
        composition/
      features/
        events/
          contract/v1/
          core/
          application/
          ports/
          adapters/
          http/
          tests/
          index.ts
        exports/
          contract/v1/
          core/
          application/
          ports/
          adapters/
          http/
          tests/
          index.ts
        schemas/
          ...
        retention/
          ...
        portal/
          ...
      shared/
        domain/
        infra/
        test/
      index.tsx
```

> [!WARNING]
> 上記構成は**仮置き**です。  
> feature 粒度や `shared` の責務は、実装前レビューで再評価します。

## 5. `features/events` の責務分割（暫定）

### `contract/v1`

- API 契約定義（DTO・schema・error envelope）
- 「外部と約束する形」を固定する

### `core`

- ドメインモデルと不変条件
- 純粋関数中心で副作用を持たない

### `application`

- ユースケース実行フロー（例: CreateEvent / SearchEvents）
- `core` と `ports` を組み合わせ、処理順序を管理する

### `ports`

- 外部依存の抽象 interface（Repository, Clock, Queue など）
- 依存逆転の支点

### `adapters`

- `ports` の実装（D1/KV/R2/Queue など）
- 永続化モデルとドメインの変換を担う

### `http`

- Hono route/handler
- 入出力変換、バリデーション、ステータスコード変換を担う

### `tests`

- `core` 単体、`application` ユースケース、`http` 契約テストを配置

### `index.ts`

- feature の公開境界
- Composition Root からの利用入口を一本化する

## 6. 依存方向ルール（暫定）

- `http -> application -> core`
- `application -> ports <- adapters`
- `contract` は `http` と `application` から参照可能
- `core` は上位層を参照しない

## 7. 確定前に決めること（ADR）

- WorkOS 互換の範囲（完全互換 or 選択互換）
- 正式エンドポイント（`/audit_logs/*` と `/events` 系の扱い）
- Idempotency の比較キー・TTL・重複時レスポンス
- `GET /events` のページング・ソート・整合性契約
- Export CSV の列契約と URL 失効ポリシー
- 共通エラー形式とステータスコード表

## 8. 最終注意

- この文書は**実装仕様書ではなく、設計ドラフト**です
- 実装は ADR 合意後に開始する
- 破棄・大幅変更を前提とした「議論用ドキュメント」として運用する
