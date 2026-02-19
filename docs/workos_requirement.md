# WorkOS Audit Logs API リクワイアメント

> WorkOS の Audit Logs ドキュメントを基に、rekishi が参考とすべき API 仕様を整理したもの。

## 1. Events API（イベント記録）

### POST /audit_logs/events — イベント作成

監査ログイベントを1件作成する。

**ヘッダー:**

| ヘッダー | 必須 | 説明 |
|---------|------|------|
| `Authorization` | Yes | `Bearer {API_KEY}` |
| `Idempotency-Key` | No | 冪等性を保証するための一意なキー |

**リクエストボディ:**

```json
{
  "organization_id": "org_01EHWNCE74X7JSDV0X3SZ3KJNY",
  "event": {
    "action": "user.signed_in",
    "occurred_at": "2022-08-29T19:47:52.336Z",
    "version": 1,
    "actor": {
      "type": "user",
      "id": "user_01GBNJC3MX9ZZJW1FSTF4C5938",
      "name": "Jon Smith",
      "metadata": {
        "role": "admin"
      }
    },
    "targets": [
      {
        "type": "team",
        "id": "team_01GBNJD4MKHVKJGEWK42JNMBGS",
        "name": "Team Alpha",
        "metadata": {
          "extra": "data"
        }
      }
    ],
    "context": {
      "location": "123.123.123.123",
      "user_agent": "Chrome/104.0.0.0"
    },
    "metadata": {
      "extra": "data"
    }
  }
}
```

**イベントオブジェクト フィールド定義:**

| フィールド | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `action` | string | Yes | ドット区切りのアクション名（例: `user.signed_in`） |
| `occurred_at` | string (ISO 8601) | Yes | イベント発生日時 |
| `version` | integer | No | スキーマバージョン |
| `actor` | object | Yes | 操作を行ったエンティティ |
| `actor.id` | string | Yes | アクターの一意ID |
| `actor.type` | string | Yes | アクターの種別（例: `user`） |
| `actor.name` | string | No | アクターの表示名 |
| `actor.metadata` | object | No | 任意の追加データ（最大50キー） |
| `targets` | array | Yes | 操作対象のリソース一覧 |
| `targets[].id` | string | Yes | ターゲットの一意ID |
| `targets[].type` | string | Yes | ターゲットの種別（例: `team`） |
| `targets[].name` | string | No | ターゲットの表示名 |
| `targets[].metadata` | object | No | 任意の追加データ（最大50キー） |
| `context` | object | Yes | イベントのコンテキスト情報 |
| `context.location` | string | No | IPアドレス |
| `context.user_agent` | string | No | ユーザーエージェント文字列 |
| `metadata` | object | No | イベントレベルの任意追加データ（最大50キー） |

**冪等性の挙動:**

- `Idempotency-Key` ヘッダーを指定した場合: キーとイベントデータのハッシュで重複を判定
- `Idempotency-Key` ヘッダーを未指定の場合: イベント内容から自動生成して基本的な重複防止を提供

---

## 2. Exports API（エクスポート）

### POST /audit_logs/exports — エクスポート作成

指定した条件で監査ログイベントのCSVエクスポートを非同期で作成する。

**リクエストボディ:**

| フィールド | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `organization_id` | string | Yes | 対象Organization ID |
| `range_start` | string (ISO 8601) | Yes | エクスポート期間の開始日時 |
| `range_end` | string (ISO 8601) | Yes | エクスポート期間の終了日時 |
| `actions` | string[] | No | アクション名でフィルタ |
| `actor_names` | string[] | No | アクター名でフィルタ |
| `actor_ids` | string[] | No | アクターIDでフィルタ |
| `targets` | string[] | No | ターゲットでフィルタ |

**レスポンス:**

```json
{
  "object": "audit_log_export",
  "id": "audit_log_export_01GBNJD4MKHVKJGEWK42JNMBGS",
  "state": "Pending",
  "url": null,
  "created_at": "2022-08-29T19:47:52.336Z",
  "updated_at": "2022-08-29T19:47:52.336Z"
}
```

### GET /audit_logs/exports/:id — エクスポート取得

エクスポートの状態を取得し、完了時はダウンロードURLを返す。

**パスパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `id` | string | Yes | エクスポートID |

**レスポンス:**

```json
{
  "object": "audit_log_export",
  "id": "audit_log_export_01GBNJD4MKHVKJGEWK42JNMBGS",
  "state": "Ready",
  "url": "https://example.com/download/export.csv",
  "created_at": "2022-08-29T19:47:52.336Z",
  "updated_at": "2022-08-29T19:48:10.000Z"
}
```

**エクスポートの状態遷移:**

| 状態 | 説明 |
|------|------|
| `Pending` | エクスポート処理中 |
| `Ready` | 完了。URLからダウンロード可能（URLは10分で失効。再取得で再生成される） |
| `Error` | エクスポート失敗 |

---

## 3. Schema / Actions API（スキーマ管理）

### GET /audit_logs/actions — アクション一覧

現在の環境で定義されている全てのAudit Logアクションを一覧取得する。

### GET /audit_logs/actions/:name/schemas — スキーマ一覧

指定したアクションに定義されている全スキーマバージョンを取得する。

**パスパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `name` | string | Yes | アクション名（例: `user.signed_in`） |

### POST /audit_logs/actions/:name/schemas — スキーマ作成

新しいメタデータバリデーション用JSON Schemaを作成する。アクションが存在しない場合は同時に作成される。

**スキーマの機能:**

- `event.metadata`, `actor.metadata`, `targets[].metadata` それぞれに個別のJSON Schemaを定義可能
- スキーマに合致しないイベントが送信された場合、エラーを返却
- バージョニングにより、スキーマを安全に進化させることが可能

---

## 4. Retention API（保持期間）

### GET /audit_logs/retention — 保持期間取得

Organizationの現在の監査ログ保持期間を取得する。

### PUT /audit_logs/retention — 保持期間設定

Organizationの監査ログ保持期間を設定する。

**設定可能な範囲:** 30日 〜 365日

---

## 5. Log Streams（ストリーミング配信）

監査ログイベントをリアルタイムで外部サービスに配信する機能。

**対応先:**

| プロバイダー | 配信方式 |
|-------------|---------|
| Datadog | HTTP Log Intake API |
| Splunk | HTTP Event Collector |
| AWS S3 | オブジェクトストレージ |
| Google Cloud Storage | オブジェクトストレージ |
| Microsoft Sentinel | Azure Monitor Logs Ingestion API |
| カスタムHTTP | Generic HTTP POST |

---

## 6. Audit Log Configuration（設定取得）

Organizationの監査ログ設定を一括で取得する。

**レスポンスに含まれる情報:**

- `retention` — 保持期間設定
- `state` — 監査ログの状態（`active` / `inactive` / `disabled`）
- `log_stream` — ストリーミング設定（設定されている場合のみ）

---

## 7. Admin Portal（管理ポータル）

### POST /portal/generate_link — 管理ポータルリンク生成

Organizationの監査ログイベントを閲覧・エクスポートできるAdmin Portalセッション用のリンクを生成する。生成したリンクを顧客に提供することで、顧客自身がイベントを確認できる。

**リクエストボディ:**

| フィールド | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `organization` | string | Yes | 対象Organization ID |
| `intent` | string | Yes | ポータルの用途（監査ログの場合は `audit_logs`） |

**レスポンス:**

```json
{
  "link": "https://id.workos.com/portal/launch?secret=..."
}
```

**機能:**

- 生成されたリンクにアクセスすると、対象OrganizationのAudit Logイベントを閲覧・エクスポートできるポータル画面が表示される
- WorkOS Dashboardと同等のイベント閲覧・エクスポート機能を顧客に提供可能

---

## rekishi で実装すべき API の優先度

| 優先度 | カテゴリ | API | 説明 |
|--------|---------|-----|------|
| **P0 (MVP)** | イベント記録 | `POST /events` | イベント作成（冪等性対応） |
| **P0 (MVP)** | イベント検索 | `GET /events` | イベント一覧・検索・フィルタ（※WorkOS未公開だがUI必須） |
| **P0 (MVP)** | エクスポート | `POST /exports` | エクスポート作成 |
| **P0 (MVP)** | エクスポート | `GET /exports/:id` | エクスポート取得・ダウンロード |
| **P1** | スキーマ管理 | `POST /actions/:name/schemas` | スキーマ作成 |
| **P1** | スキーマ管理 | `GET /actions` | アクション一覧 |
| **P1** | スキーマ管理 | `GET /actions/:name/schemas` | スキーマ一覧 |
| **P1** | 保持期間 | `GET /retention` | 保持期間取得 |
| **P1** | 保持期間 | `PUT /retention` | 保持期間設定 |
| **P2** | 管理ポータル | `POST /portal/generate_link` | 顧客向けAdmin Portalリンク生成 |
| **P2** | ストリーミング | Log Streams 設定・配信 | 外部SIEM/ストレージへのリアルタイム配信 |
| **P2** | 設定 | `GET /config` | Organization設定の一括取得 |

---

## 参考リンク

- [WorkOS Audit Logs ドキュメント](https://workos.com/docs/audit-logs)
- [WorkOS API Reference](https://workos.com/docs/reference/audit-logs)
- [WorkOS Go SDK - auditlogs パッケージ](https://pkg.go.dev/github.com/workos/workos-go/v3/pkg/auditlogs)
- [WorkOS Retention API Changelog](https://workos.com/changelog/new-audit-logs-retention-period-api)
- [WorkOS Log Streams](https://workos.com/docs/audit-logs/log-streams)
- [WorkOS Admin Portal](https://workos.com/docs/admin-portal)
