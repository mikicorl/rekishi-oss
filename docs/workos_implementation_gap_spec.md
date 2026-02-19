# WorkOS要件の実装ギャップ仕様（背景付き）

## 1. 背景

`docs/workos_requirement.md` は WorkOS Audit Logs を参考に、rekishi で実装すべき API を優先度付きで整理した要件ドキュメントである。  
一方で、この要件は「エンドポイントと主要フィールド」の定義が中心で、実装・運用・互換性の観点で必要になる決定事項が一部省略されている。

rekishi は `PRODUCT.md` に記載のとおり、以下の性質を持つ。

- 監査ログ基盤としての **改ざん不可（Immutability）**
- **マルチテナント** 前提
- UI での **検索・閲覧・エクスポート** を提供
- OSS と将来の Cloud 展開を見据えた拡張性

このため、WorkOS 要件をなぞるだけでは足りず、実装時に必ず必要になる「暗黙仕様」を先に言語化しておく必要がある。

## 2. このドキュメントの目的

- `docs/workos_requirement.md` の不足仕様を可視化する
- 実装前に決めるべき論点を列挙し、後戻りコストを下げる
- API 互換性・運用性・将来拡張を両立する仕様決定の土台を作る

## 3. スコープ

対象:

- P0/P1/P2 で定義済み API の実装に必要な追加仕様
- API 契約、データモデル、非機能、運用ルール

対象外:

- 具体的なテーブル設計やインフラ実装手順
- 各クラウドプロバイダーの詳細実装（本書では要件レベルのみ）

## 4. 前提・設計原則

- 監査ログイベントは追記専用であり、更新・削除しない
- テナント境界を越えた参照・操作は不可
- 失敗時の挙動（エラー、再試行、冪等性）は API 契約として固定する
- UI が依存する検索 API は MVP でも安定契約にする

## 5. 未記載の隠れ仕様（実装必須）

### 5.1 API 契約と互換性

> **決定済み** → [ADR-001: API 契約と互換性](adr/adr-001-api-contract-and-compatibility.md)

1. 互換方針の明確化
- WorkOS 完全互換（パス、レスポンス、エラー）か、rekishi 独自仕様を許容するか
- 互換対象バージョンを固定するか（将来の追随ルール含む）

2. ルーティング方針
- `docs/workos_requirement.md` 内で `/audit_logs/*` と `/events` 系の表記揺れがあるため正本を定義する
- 互換エイリアスを提供する場合の非推奨化ポリシーを定義する

3. エラー契約
- 4xx/5xx の返却条件を endpoint ごとに定義する
- エラー形式（`code` / `message` / `request_id` など）を共通化する
- バリデーションエラーの詳細表現（フィールド単位）を固定する

### 5.2 認証・認可・テナント分離

1. API キーの権限モデル
- 読み取り専用/書き込み専用/管理操作可否（schema/retention/streams）
- 組織横断キーを許容するか

2. `organization_id` の扱い
- リクエスト body の `organization_id` を信頼するか、認証コンテキスト優先にするか
- 不一致時のエラー（403 or 404 or 422）を定義する

3. 監査対象アクセス制御
- `GET /events`, `GET /exports/:id` で他組織データにアクセスできない保証
- オブジェクト存在秘匿（not found を返すか）を定義する

### 5.3 イベント記録（POST /events）

1. バリデーション境界
- 文字列長、配列要素数、payload 最大サイズ
- `metadata` 50 キー制約の詳細（キー長、値型、ネスト可否）
- `action` フォーマット（許可文字、最大長）

2. 時刻意味論
- `occurred_at` の許容範囲（未来時刻、過去時刻の上限）
- 保存時刻（ingested_at）との使い分け

3. 冪等性
- `Idempotency-Key` の保存 TTL
- 比較単位（organization + endpoint + payload hash など）
- 重複時の返却（初回レスポンス再返却 or 競合エラー）

4. 不変性保証
- アプリケーションレベルで update/delete を禁止する方法
- 必要に応じた改ざん検知（例: ハッシュ列、署名、監査メタ）

### 5.4 イベント検索（GET /events）

1. フィルタ仕様
- `actions`, `actor_ids`, `actor_names`, `targets`, `occurred_at` 範囲
- AND/OR 条件の解釈

2. ソート・ページング
- デフォルト順序（`occurred_at desc` など）
- cursor ベースか offset ベースか
- `limit` 上限、`next_cursor` 仕様

3. 一貫性
- 新規イベント流入中のページング整合性（重複/欠落防止）
- retention 削除後の結果保証

### 5.5 エクスポート（POST/GET /exports）

1. ジョブ制約
- 同時実行数上限、期間上限、件数上限
- 大量データ時の分割戦略

2. CSV 契約
- 列定義と順序
- ネストデータの flatten ルール
- エスケープ、改行、文字コード（UTF-8/BOM）

3. 状態遷移・再試行
- `Pending -> Ready -> Error` の遷移条件
- 失敗時の再試行ポリシー
- URL 失効後の再生成条件と有効期限

### 5.6 スキーマ管理（Actions/Schemas）

1. バージョニング
- version の採番ルール（自動採番か指定か）
- アクティブ version の解決規則

2. 検証タイミング
- event 受信時にどの schema を適用するか（`event.version` 指定時/未指定時）
- schema 不一致時のエラー契約（422 推奨など）

3. JSON Schema 方言
- 対応 draft（例: draft-07 / 2020-12）
- `$ref` など高度機能を許可するか

### 5.7 Retention / Config / Log Streams

1. Retention
- デフォルト値（初期30日など）
- 変更反映タイミング
- 削除ジョブの実行頻度と遅延許容

2. Config
- `state`（`active/inactive/disabled`）の導出ロジック
- `retention`, `log_stream` のソース整合性

3. Log Streams
- 配信保証（at-least-once / exactly-once）
- リトライ戦略（指数バックオフ、最大回数）
- 配信失敗時の状態管理（paused/error）と運用通知

### 5.8 Admin Portal（POST /portal/generate_link）

1. セキュリティ境界
- ポータルリンク生成 API は必ずバックエンド限定で公開する（クライアントから直接呼ばせない）
- 生成 API を叩けるユーザー権限（テナント管理者のみ等）を定義する
- 生成される `link` はクエリに secret を含むため、アプリログ・監視ログ・分析基盤でマスクする

2. リンク有効期限と再発行
- API 生成リンクの有効期限を固定する（WorkOS 互換なら 5 分）
- 期限切れ時の UX（再生成導線、エラーメッセージ）を定義する
- 再発行時のレート制限・連続発行制御（乱発防止）を定義する

3. `organization` フィールドの取り扱い
- `organization`（`organization_id` ではない）を受ける契約を固定する
- 認証済みテナントと `organization` の対応検証を必須にする
- 不一致時のエラー方針（403/404）を定義する

4. `intent` の許可範囲
- MVP で許可する `intent` を固定する（`audit_logs` のみか、将来 intent も許可するか）
- 未対応 intent を受けた場合のエラーコードを定義する

5. リダイレクト仕様
- `return_url` を受け付けるか、未指定時の遷移先をどうするかを定義する
- `return_url` の検証ルール（HTTPS 必須、許可ドメイン/allowlist）を定義する
- オープンリダイレクト対策（相対URL禁止、完全一致/前方一致ルール）を明文化する

6. Portal 内機能との整合
- ポータル内で見えるデータ範囲（対象 organization のみ）を保証する
- ポータル側で利用する検索・エクスポート制約（期間上限、保持期間適用）と API 契約を一致させる
- ポータル起点の操作（CSV出力等）をプロダクト監査ログとして二次記録するか決める

7. 監査・運用
- 「誰がいつどの organization 向けに portal link を生成したか」を監査イベントとして記録する
- 異常検知（短時間での大量リンク生成、失敗率上昇）を監視対象に含める

### 5.9 非機能要件（共通）

1. レート制限
- API キー単位・組織単位の制限値
- 429 時の `Retry-After`

2. 観測性
- 監視メトリクス（取り込み成功率、遅延、エクスポート失敗率）
- 構造化ログとトレースID連携

3. セキュリティ
- export URL の署名方式
- 秘密情報のマスキング（metadata に含まれる可能性）

4. データ保護
- 暗号化（at-rest/in-transit）
- 個人情報を含む場合の削除/匿名化方針

## 6. 優先度つき決定チェックリスト

### P0（着手前に必須）

- API 互換方針（完全互換 / 独自拡張）
- 正式エンドポイントの確定（`/audit_logs/*` か `/events` 系か）
- `GET /events` のフィルタ・ソート・ページング契約
- Idempotency の TTL / 比較キー / 重複時レスポンス
- Export の期間上限・CSV列・URL有効期限
- 共通エラー形式とステータスコード表

### P1（MVP後すぐ）

- Schema version 解決規則と検証エラー契約
- Retention の削除実行モデル
- Config `state` の導出定義
- API キー権限モデル（read/write/admin）

### P2（拡張時）

- Admin Portal のアクセス制御、リンクTTL、`return_url` 検証ルール
- Admin Portal の `intent` 拡張方針（`audit_logs` 以外を開放する条件）
- Admin Portal リンク生成の監査証跡・不正利用検知
- Log Streams の配信保証・再試行・運用通知
- SIEM/ストレージ接続先ごとの差分吸収方針
- 高負荷時のスケール設計と SLO

## 7. 推奨する次アクション

1. 本ドキュメントの P0 項目を「決定済み/未決定」に分ける
2. 未決定項目を ADR（Architecture Decision Record）として1件ずつ確定する
3. `docs/workos_requirement.md` に「契約済み仕様へのリンク」を追記し、実装仕様の参照元を一本化する

## 8. 参照

- `docs/workos_requirement.md`
- `PRODUCT.md`
- https://workos.com/docs/admin-portal
- https://workos.com/docs/reference/admin-portal/generate-a-link
