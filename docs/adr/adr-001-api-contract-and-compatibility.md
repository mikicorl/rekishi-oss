# ADR-001: API 契約と互換性

| 項目 | 内容 |
|------|------|
| ステータス | Accepted |
| 決定日 | 2026-02-19 |
| 対象 | `workos_implementation_gap_spec.md` セクション 5.1 |
| 関連 | [workos_requirement.md](../workos_requirement.md), [workos_implementation_gap_spec.md](../workos_implementation_gap_spec.md), [PRODUCT.md](../../PRODUCT.md) |

---

## 1. 互換方針

### 決定

rekishi は **「WorkOS 互換ベース + rekishi 拡張」のハイブリッド方針** を採用する。

### 互換レベルの分類

| レベル | 定義 | 対象エンドポイント |
|--------|------|-------------------|
| **Full** | リクエスト/レスポンスが WorkOS と構造互換 | `POST /audit_logs/events`, `POST /audit_logs/exports`, `GET /audit_logs/exports/:id` |
| **Extended** | WorkOS にない rekishi 独自 API | `GET /audit_logs/events`（イベント検索） |
| **Adapted** | WorkOS ベースだが rekishi 独自の調整あり | エラー形式（`request_id` 追加等） |

### 互換対象

- 2025 年時点の WorkOS Audit Logs API をスナップショットとして固定する
- 将来 WorkOS が API を変更しても自動追随しない
- 追随する場合は新たな ADR を起票して判断する

### 根拠

- WorkOS 完全互換は不可能: WorkOS は `GET /events`（イベント検索）を公開 API として提供していないが、rekishi は UI での検索・閲覧のために必須
- WorkOS SDK エコシステムからの移行容易性は重要な差別化要素であるため、基本構造は互換を維持する
- `request_id` のような運用・デバッグに必須の情報は WorkOS にない場合でも追加する（Adapted レベル）

---

## 2. エンドポイント正本

### 決定

rekishi の正式パスは `/audit_logs/*` プレフィックス付きとする。

> **補足:** `docs/workos_requirement.md` の優先度表に記載された短縮パス（`/events`, `/exports/:id` 等）は同ドキュメント内の簡略表記であり、正式パスは本 ADR に従う。

### 全エンドポイント一覧

| 優先度 | メソッド | パス | 互換レベル | 説明 |
|--------|----------|------|------------|------|
| P0 | `POST` | `/audit_logs/events` | Full | イベント作成 |
| P0 | `GET` | `/audit_logs/events` | Extended | イベント検索（rekishi 独自） |
| P0 | `POST` | `/audit_logs/exports` | Full | エクスポート作成 |
| P0 | `GET` | `/audit_logs/exports/:id` | Full | エクスポート取得 |
| P1 | `GET` | `/audit_logs/actions` | Full | アクション一覧 |
| P1 | `GET` | `/audit_logs/actions/:name/schemas` | Full | スキーマ一覧 |
| P1 | `POST` | `/audit_logs/actions/:name/schemas` | Full | スキーマ作成 |
| P1 | `GET` | `/audit_logs/retention` | Full | 保持期間取得 |
| P1 | `PUT` | `/audit_logs/retention` | Full | 保持期間設定 |
| P2 | `POST` | `/portal/generate_link` | Full | Admin Portal リンク生成 |
| P2 | `GET` | `/audit_logs/config` | Full | 設定一括取得 |

### セルフホスト時のパスカスタマイズ

OSS としてセルフホストされる場合、ユーザーは Hono の `app.route()` を使用して任意の prefix を付与できる。

```typescript
// デフォルト
app.route('/audit_logs', auditLogRoutes)

// カスタム prefix の例
app.route('/api/v1/audit_logs', auditLogRoutes)
```

### 互換エイリアス方針

- v1.0 時点ではエイリアスを提供しない（正式パスのみ）
- 将来パスを変更する場合は、旧パスを 1 メジャーバージョン間 `301 Moved Permanently` でリダイレクトする
- 非推奨パスは `Deprecation` レスポンスヘッダーで通知する

---

## 3. API バージョニング戦略

### 決定

v1.0 時点ではバージョニングを導入しない。

### ルール

| 変更の種類 | バージョニング | 対応方法 |
|-----------|---------------|---------|
| 追加的変更（新フィールド、新エンドポイント） | 不要 | そのまま追加 |
| 破壊的変更（フィールド削除、型変更等） | 必要 | ADR を起票し手法を決定 |

### 将来の破壊的変更時の優先検討手法

ヘッダーベースのバージョニングを優先検討する。

```
X-Rekishi-API-Version: 2026-01-01
```

**理由:**
- パスベース（`/v1/audit_logs/...`）は WorkOS 互換性を損なう
- ヘッダーベースはパスを汚さず後方互換を維持しやすい
- 日付ベースのバージョン（Stripe 方式）は変更タイミングが明確

### 根拠

- WorkOS 自体がバージョニングを採用していない
- rekishi は初期プロダクトであり、破壊的変更の頻度が予測困難
- 過度な設計を避け、必要になった時点で判断する

---

## 4. 共通エラー形式

### 決定

全エンドポイント共通のエラーレスポンス構造を以下に固定する。

### エラーレスポンス構造

```typescript
type ErrorResponse = {
  code: string           // マシンリーダブルなエラーコード
  message: string        // 人間向けのエラー説明
  request_id: string     // リクエスト追跡用 ID（UUID v7）
  errors?: FieldError[]  // バリデーションエラー時のみ
}

type FieldError = {
  field: string          // エラーのあるフィールドパス（例: "event.actor.id"）
  code: string           // フィールドレベルのエラーコード（例: "required"）
  message: string        // フィールドレベルのエラー説明
}
```

### エラーコード一覧

| code | HTTP ステータス | 意味 |
|------|---------------|------|
| `invalid_request` | 400 | リクエストの形式が不正（JSON パースエラー、必須パラメータ欠落） |
| `authentication_required` | 401 | `Authorization` ヘッダーが未指定 |
| `invalid_api_key` | 401 | API キーが無効または期限切れ |
| `forbidden` | 403 | 認証済みだがリソースへのアクセス権がない |
| `not_found` | 404 | リソースが存在しない |
| `conflict` | 409 | 冪等性キーの競合（同一キー・異なるペイロード） |
| `unprocessable_entity` | 422 | バリデーションエラー（型は正しいが値が不正） |
| `rate_limit_exceeded` | 429 | レート制限超過 |
| `internal_error` | 500 | 予期しないサーバーエラー |
| `service_unavailable` | 503 | メンテナンスまたは一時的なサービス停止 |

### レスポンス例

**認証エラー（401）:**

```json
{
  "code": "authentication_required",
  "message": "Authorization header is missing",
  "request_id": "01945a3b-7c00-7000-8000-000000000001"
}
```

**バリデーションエラー（422）:**

```json
{
  "code": "unprocessable_entity",
  "message": "Request validation failed",
  "request_id": "01945a3b-7c00-7000-8000-000000000002",
  "errors": [
    {
      "field": "event.action",
      "code": "required",
      "message": "action is required"
    },
    {
      "field": "event.occurred_at",
      "code": "invalid_format",
      "message": "occurred_at must be in ISO 8601 format"
    }
  ]
}
```

**冪等性キー競合（409）:**

```json
{
  "code": "conflict",
  "message": "Idempotency key has already been used with a different request payload",
  "request_id": "01945a3b-7c00-7000-8000-000000000003"
}
```

### 根拠

- WorkOS は `{ code, message }` 形式を使用しており、本形式はその上位互換
- `request_id` は運用・デバッグの観点から全レスポンスに必須（WorkOS SDK も内部的に使用）
- `errors` 配列はバリデーションエラー時にフィールド単位の情報を返すための rekishi 独自の改善

---

## 5. HTTP ステータスコード表

### ステータスコードの使用条件

| ステータス | 使用条件 |
|-----------|---------|
| `200 OK` | 正常取得・更新 |
| `201 Created` | リソース作成成功（`POST /audit_logs/events`, `POST /audit_logs/exports`） |
| `400 Bad Request` | JSON パースエラー、必須パラメータ欠落など構造的問題 |
| `401 Unauthorized` | `Authorization` ヘッダー未指定または API キーが無効 |
| `403 Forbidden` | 認証済みだがリソースへのアクセス権なし |
| `404 Not Found` | リソースが存在しない |
| `409 Conflict` | 冪等性キーの競合（同一キー・異なるペイロード） |
| `422 Unprocessable Entity` | バリデーションエラー（型は正しいが値が不正） |
| `429 Too Many Requests` | レート制限超過 |
| `500 Internal Server Error` | 予期しないサーバーエラー |
| `503 Service Unavailable` | メンテナンスまたは一時的なサービス停止 |

### 400 と 422 の使い分け

| 状況 | ステータス | 例 |
|------|-----------|-----|
| JSON パースエラー | 400 | 不正な JSON 文字列 |
| 必須パラメータ欠落 | 400 | Content-Type 未指定 |
| フィールドの型不正 | 422 | `version` に文字列を指定 |
| フィールドの値不正 | 422 | `occurred_at` が ISO 8601 でない |
| ビジネスルール違反 | 422 | `retention` が 30-365 の範囲外 |

### エンドポイント別ステータスコードマッピング

| エンドポイント | 200 | 201 | 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 |
|---------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `POST /audit_logs/events` | - | o | o | o | o | - | o | o | o | o |
| `GET /audit_logs/events` | o | - | o | o | o | - | - | o | o | o |
| `POST /audit_logs/exports` | - | o | o | o | o | - | - | o | o | o |
| `GET /audit_logs/exports/:id` | o | - | - | o | o | o | - | - | o | o |
| `GET /audit_logs/actions` | o | - | - | o | o | - | - | - | o | o |
| `GET /audit_logs/actions/:name/schemas` | o | - | - | o | o | o | - | - | o | o |
| `POST /audit_logs/actions/:name/schemas` | - | o | o | o | o | - | - | o | o | o |
| `GET /audit_logs/retention` | o | - | - | o | o | - | - | - | o | o |
| `PUT /audit_logs/retention` | o | - | o | o | o | - | - | o | o | o |
| `POST /portal/generate_link` | o | - | o | o | o | - | - | o | o | o |
| `GET /audit_logs/config` | o | - | - | o | o | - | - | - | o | o |

### テナント分離とステータスコード

- 他テナントのリソースにアクセスした場合は **`404 Not Found`** を返す（`403` ではない）
- これにより、リソースの存在自体を秘匿する（セキュリティのベストプラクティス）
- エラーメッセージは `"Resource not found"` とし、テナント不一致であることを示唆しない

### 成功レスポンス

| エンドポイント | ステータス | レスポンスボディ |
|---------------|-----------|----------------|
| `POST /audit_logs/events` | `201 Created` | なし |
| `GET /audit_logs/events` | `200 OK` | イベント一覧 + ページネーション |
| `POST /audit_logs/exports` | `201 Created` | エクスポートオブジェクト |
| `GET /audit_logs/exports/:id` | `200 OK` | エクスポートオブジェクト |
| `GET /audit_logs/actions` | `200 OK` | アクション一覧 |
| `GET /audit_logs/actions/:name/schemas` | `200 OK` | スキーマ一覧 |
| `POST /audit_logs/actions/:name/schemas` | `201 Created` | スキーマオブジェクト |
| `GET /audit_logs/retention` | `200 OK` | 保持期間オブジェクト |
| `PUT /audit_logs/retention` | `200 OK` | 保持期間オブジェクト |
| `POST /portal/generate_link` | `200 OK` | `{ "link": "..." }` |
| `GET /audit_logs/config` | `200 OK` | 設定オブジェクト |

---

## 6. バリデーションエラー詳細

### フィールドパスの表記規則

- ドット区切りで JSON パスを表現する
- 配列要素はブラケット表記で指定する

```
event.action              # トップレベルフィールド
event.actor.id            # ネストされたフィールド
event.targets[0].type     # 配列内オブジェクトのフィールド
event.targets[2].metadata # 特定の配列要素のメタデータ
```

### フィールドエラーコード

| code | 意味 | 例 |
|------|------|-----|
| `required` | 必須フィールドが未指定 | `event.action is required` |
| `invalid_format` | フォーマット不正 | `occurred_at must be in ISO 8601 format` |
| `invalid_type` | 型が不正 | `version must be an integer` |
| `too_long` | 文字列長超過 | `action must be 255 characters or fewer` |
| `too_many_items` | 配列要素数超過 | `targets must have 50 items or fewer` |
| `too_many_keys` | オブジェクトキー数超過 | `metadata must have 50 keys or fewer` |
| `out_of_range` | 値の範囲外 | `retention must be between 30 and 365` |

### 未知フィールドの扱い

- リクエストに仕様にないフィールドが含まれる場合は **無視する**（エラーにしない）
- 前方互換性を優先する設計: クライアントが新しいフィールドを先行送信しても API は壊れない

---

## 7. 共通レスポンスヘッダー

### 全レスポンスに含めるヘッダー

| ヘッダー | 値 | 条件 |
|---------|-----|------|
| `X-Request-Id` | UUID v7 | 全レスポンス |
| `Content-Type` | `application/json` | ボディありの全レスポンス |

### レート制限ヘッダー

| ヘッダー | 値 | 条件 |
|---------|-----|------|
| `RateLimit-Limit` | 数値 | 全レスポンス |
| `RateLimit-Remaining` | 数値 | 全レスポンス |
| `RateLimit-Reset` | Unix timestamp | 全レスポンス |
| `Retry-After` | 秒数 | 429 レスポンスのみ |

### 非推奨通知ヘッダー（将来使用）

| ヘッダー | 値 | 条件 |
|---------|-----|------|
| `Deprecation` | ISO 8601 日時 | 非推奨エンドポイントへのリクエスト時 |
| `Link` | 代替エンドポイントの URL | 非推奨エンドポイントへのリクエスト時 |
