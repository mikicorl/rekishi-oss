# ADR-002: 監査ログイベントの保存先選定

- **Status**: Proposed
- **Date**: 2026-02-19
- **Context**: rekishiにおける監査ログイベントの永続化先を決定する

## 要件整理

rekishiの監査ログストレージには以下の要件がある。

### 機能要件

| 要件 | 詳細 |
|------|------|
| **Append-only書き込み** | イベントは追記のみ。更新・削除なし（Immutability） |
| **マルチテナント分離** | テナント間のデータを安全に分離 |
| **検索・フィルタリング** | actor, action, target, 期間等での絞り込み |
| **保持期間管理** | テナントごとに30〜365日のRetention設定 |
| **CSVエクスポート** | 期間指定でのバッチエクスポート |
| **冪等性** | idempotency keyによる重複排除 |

### 非機能要件

| 要件 | 詳細 |
|------|------|
| **書き込みスループット** | SaaS利用企業の操作量に比例。中〜大規模テナントで数千〜数万 events/日 |
| **読み取りレイテンシ** | 検索UIのレスポンス（数百ms以内が望ましい） |
| **スケーラビリティ** | テナント数・イベント数の増加に対応 |
| **運用コスト** | OSS版はセルフホスト可能、Cloud版はマネージドコスト最適化 |
| **Cloudflare Workers互換** | ランタイム制約（TCP不可、fetch/HTTP API経由） |

## 候補一覧

### Cloudflareネイティブ

| 候補 | 概要 | 書き込み性能 | クエリ能力 | 整合性 |
|------|------|-------------|-----------|--------|
| **D1** | SQLiteベースのマネージドDB | 単一スレッド、DB単位でシャーディング可能 | フルSQL + FTS5 | Strong（単一DB内） |
| **Durable Objects (DO)** | オブジェクト単位のSQLiteストレージ | ~1,000 req/s/object、無制限にスケール | フルSQL（オブジェクト内） | Strong（オブジェクト内） |
| **KV** | グローバル分散KVストア | 高速（キー分散時） | キー検索・prefix listのみ | Eventually consistent（〜60秒） |
| **R2** | S3互換オブジェクトストレージ | 高い | なし（オブジェクトストア） | Strong（単一オブジェクト） |
| **Queues** | メッセージキュー | 5,000 msg/s/queue | N/A（トランジット層） | At-least-once delivery |
| **Analytics Engine** | ClickHouseベースの分析エンジン | 高い（ただしサンプリングあり） | SQL（集計中心、JOINなし） | Eventually consistent |

### 外部サービス

| 候補 | 概要 | 書き込み性能 | クエリ能力 | Workers連携 |
|------|------|-------------|-----------|-------------|
| **Neon** (Postgres) | サーバーレスPostgreSQL | Postgres相当 | フルSQL + JSONB + FTS | Hyperdrive経由で低レイテンシ |
| **Turso** (libSQL) | エッジ分散SQLite | 制限あり（単一Primary） | SQLite相当 | ネイティブ対応 |
| **PlanetScale** | Vitessベースのスケーラブル MySQL | 優秀（シャーディング） | MySQL相当 | Hyperdrive経由 |
| **ClickHouse Cloud** | 列指向分析DB | 優秀（バッチ挿入） | 優秀（分析クエリ） | HTTP API経由（手動） |
| **Tinybird** | ClickHouseベースの分析プラットフォーム | 優秀（Events API） | SQL API | HTTP POST（簡易） |

## 詳細評価

### 1. Cloudflare D1

**利点:**
- Cloudflareネイティブ（Workers Bindingで直接アクセス、レイテンシ最小）
- フルSQL（SQLite）+ FTS5による全文検索
- グローバル読み取りレプリケーション（無料、読み取りレイテンシ大幅改善）
- Scale-to-zero課金
- テナントごとのDB分割（database-per-tenant）が公式推奨パターン
- 50,000 DB/アカウント（拡張可能）

**懸念:**
- 単一DBあたり10GBの上限（大規模テナントでは時間分割が必要）
- 書き込みは単一スレッド（1DB内でのスループット上限あり）
- 書き込みコスト: $1.00/100万行（大量書き込みでコスト増）
- FTS5仮想テーブルのエクスポート非互換（バグ報告あり）

**テナントごとDBパターン:**
```
tenant_001 → D1 database "rekishi-tenant-001"
tenant_002 → D1 database "rekishi-tenant-002"
...
```
- テナント分離が完全（DBレベル）
- テナントごとに独立したスループット
- 10GB上限もテナント単位なので余裕が出る
- 管理の複雑性は増す（マイグレーション配布等）

### 2. Cloudflare Durable Objects

**利点:**
- 強い整合性保証（単一オブジェクト内で直列化）
- オブジェクト内SQLite（フルSQL）
- 無制限のオブジェクト数でスケール
- 30日間のPoint-in-Time Recovery
- WebSocketサポート（リアルタイム通知に使える可能性）

**懸念:**
- クロスオブジェクトクエリ不可（テナント横断検索が困難）
- 単一オブジェクト10GB上限
- D1と比較して直感的でないプログラミングモデル
- コスト構造が複雑（リクエスト + Duration + Row + Storage）

### 3. Neon (サーバーレスPostgreSQL)

**利点:**
- PostgreSQLのフル機能（JSONB、GINインデックス、全文検索、パーティショニング）
- テーブルパーティショニングによる大規模データ管理
- Hyperdrive経由で低レイテンシ（レイテンシ最大90%削減）
- Databricks買収後の大幅値下げ（ストレージ80%減）
- Scale-to-zero対応
- 豊富なエコシステム（ORM、マイグレーションツール等）

**懸念:**
- 外部サービス依存（Cloudflareネイティブではない）
- Hyperdrive経由でもD1比でレイテンシは大きい
- OSS版でのセルフホスト時は別途PostgreSQL環境が必要
- 常時起動（Scale-to-zero無効化）推奨で最低$51/月〜

### 4. ClickHouse Cloud / Tinybird

**利点:**
- 列指向ストレージで監査ログに最適（10〜30倍の圧縮率）
- 大量データに対する高速分析クエリ
- Tinybirdは Events API で簡易連携可能（$25/月〜）

**懸念:**
- バッチ挿入が前提（個別行挿入は非効率）
- Cloudflare Workersとのネイティブ連携なし
- 本番運用コストが高い（ClickHouse Cloud: $500/月〜）
- OLAPに特化しており、単一イベント取得などのOLTPパターンは不得意

### 5. Analytics Engine

**利点:**
- Cloudflareネイティブ、Workers Bindingで直接利用
- SQL APIでの集計クエリ
- 安価（$0.25/100万データポイント）

**致命的な問題:**
- **サンプリング**: 高スループット時にイベントが間引かれる → 監査ログでは許容不可
- **保持期間固定3ヶ月**: 監査ログの30〜365日要件を満たさない
- JOINなし、単一テーブルクエリのみ

**結論: 補助的な分析ダッシュボード用途には使えるが、イベントの正（Source of Truth）としては不適格。**

## 推奨アーキテクチャ

### 推奨案: D1（database-per-tenant） + R2 + KV + Queues

rekishiの要件とCloudflare Workers制約を総合的に評価した結果、**Cloudflare D1をテナントごとDBパターンで使用する構成**を推奨する。

```
[Client] → [Hono API on Workers]
                    │
                    ├──→ KV: 冪等性チェック（idempotency key）
                    │
                    ├──→ D1 (per-tenant): イベント書き込み・検索
                    │         tenant-001.db
                    │         tenant-002.db
                    │         ...
                    │
                    ├──→ Queues: エクスポートジョブ投入
                    │         │
                    │         └──→ Consumer: D1から読み取り → CSV生成 → R2に保存
                    │
                    └──→ R2: エクスポートCSVファイルの保存・署名付きURL配信
```

### 各コンポーネントの役割

| コンポーネント | 用途 | 理由 |
|---------------|------|------|
| **D1** (per-tenant) | イベントの永続化・検索 | ネイティブBinding、フルSQL、テナント分離、FTS5 |
| **KV** | 冪等性キー管理、設定キャッシュ | TTL付きの一時データに最適、高速読み取り |
| **Queues** | エクスポートジョブのバッファリング | 非同期処理の信頼性保証、リトライ機能 |
| **R2** | エクスポートファイルの保存 | S3互換、署名付きURL、egress無料 |

### D1スキーマ設計（テナントDBごと）

```sql
-- events テーブル
CREATE TABLE events (
  id TEXT PRIMARY KEY,           -- UUID v7
  action TEXT NOT NULL,          -- e.g., "user.signed_in"
  occurred_at TEXT NOT NULL,     -- ISO 8601
  ingested_at TEXT NOT NULL,     -- 取り込み日時
  actor_type TEXT,
  actor_id TEXT,
  actor_name TEXT,
  actor_metadata TEXT,           -- JSON
  targets TEXT,                  -- JSON array
  context TEXT,                  -- JSON (location, user_agent等)
  metadata TEXT,                 -- JSON
  version INTEGER DEFAULT 1
);

-- 検索用インデックス
CREATE INDEX idx_events_action ON events(action);
CREATE INDEX idx_events_occurred_at ON events(occurred_at);
CREATE INDEX idx_events_actor_id ON events(actor_id);
CREATE INDEX idx_events_actor_type_action ON events(actor_type, action);
```

### この構成を推奨する理由

1. **Cloudflareネイティブ完結** — 外部サービス依存なし。OSS版のセルフホスト時もCloudflareアカウントのみで完結
2. **テナント分離の完全性** — database-per-tenantでDBレベルの分離。情報漏洩リスクが構造的に排除される
3. **スループットのスケーラビリティ** — テナントごとに独立したD1 DBを持つため、全体のスループットはテナント数に比例してスケール
4. **コスト効率** — Scale-to-zero。アクティブでないテナントのDBは課金されない
5. **運用シンプルさ** — Cloudflareのマネージドサービスのみで構成。インフラ管理不要
6. **アーキテクチャとの整合** — 3層アーキテクチャのDisposable層でD1アダプタを実装するだけ。EventRepositoryインターフェースの背後に隠蔽される

### 将来の拡張パス

| シナリオ | 対応 |
|---------|------|
| テナント内データが10GBを超える | 時間ベースのDB分割（例: `tenant-001-2026-q1.db`） |
| 全文検索の高度化が必要 | FTS5仮想テーブルの追加、またはVectorize連携 |
| 分析ダッシュボード（Cloud版） | Analytics Engineへの二重書き込み（正はD1のまま） |
| 超大規模テナント対応 | Neon (PostgreSQL) + Hyperdriveへのアダプタ追加（EventRepositoryを差し替え） |

## 却下した代替案

### 代替案A: Neon (PostgreSQL) を主ストレージにする

PostgreSQLの機能は魅力的だが、以下の理由で主ストレージとしては採用しない:

- 外部サービス依存が増え、OSS版のセルフホストが複雑化する
- Cloudflareネイティブと比較してレイテンシが増加する
- 常時起動が推奨され、最低コストが高い
- rekishiの現段階の規模ではD1で十分対応可能

ただし、将来Cloud版で超大規模テナント対応が必要になった場合の**拡張パス**として有力。3層アーキテクチャのDisposable層でアダプタを追加すれば切り替え可能。

### 代替案B: Durable Objects を主ストレージにする

D1と同じくCloudflareネイティブで強い整合性を持つが:

- クロスオブジェクトクエリ不可で、テナント内の検索ですらオブジェクト分割時に困難
- D1のdatabase-per-tenantパターンの方がSQLの自由度が高い
- コスト構造が複雑で予測しにくい
- D1の方がSQLiteの機能をフルに活用しやすい

### 代替案C: ClickHouse Cloud / Tinybird を主ストレージにする

分析性能は最高だが:

- バッチ挿入前提で、リアルタイムの個別イベント記録には不向き
- 本番環境のコストが高い
- Cloudflare Workersとのネイティブ連携がない
- OLTP操作（単一イベント取得、冪等性チェック等）が不得意

### 代替案D: Analytics Engine を主ストレージにする

- サンプリングにより個別イベントの保証ができない → 監査ログとして致命的
- 保持期間3ヶ月固定 → 要件（30〜365日）を満たさない

## 決定

**D1（database-per-tenant） + KV + Queues + R2** の構成を採用する。

EventRepositoryインターフェースの背後にD1アダプタを実装し、将来的な保存先変更に対応可能な設計とする。
