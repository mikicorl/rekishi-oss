# API Architecture (Three Layers Draft)

> [!WARNING]
> この文書は **暫定方針（Draft）** です。  
> **最終決定ではありません。** 実装開始前に ADR で確定してください。

## 1. 目的（暫定）

- 元記事の3層モデルを、rekishi の `apps/api` にそのまま適用する
- 設計を複雑化せず、責務の境界だけを明確にする
- 将来の差し替えをしやすくする

## 2. 採用する3層（暫定）

1. **The Core (Durable)**
- 監査ログの不変条件を保持する層
- 例: 改ざん不可、tenant境界、状態遷移、ドメインバリデーション
- 外部依存（Hono / D1 / Cloudflare API）を持たない

2. **The Connectors (APIs)**
- Core と外部の間に置く契約層
- 例: DTO、schema、port(interface)、usecase interface
- Core の意図を API 契約として固定する

3. **The Disposable Layer**
- 実際の接続実装を置く層
- 例: Hono route/handler、D1/KV/R2 adapter、Queue adapter
- 交換可能・再生成可能であることを前提にする

> [!IMPORTANT]
> この3層は **提案段階** です。  
> 実装は ADR 合意後に開始します。

## 3. ディレクトリ構成案（feature colocation / 暫定）

```txt
apps/api/src/
  app/
    disposable/
      server.ts
      container.ts
  features/
    events/
      core/
      connectors/
      disposable/
      tests/
      index.ts
    exports/
      core/
      connectors/
      disposable/
      tests/
      index.ts
    schemas/
      core/
      connectors/
      disposable/
      tests/
      index.ts
    retention/
      core/
      connectors/
      disposable/
      tests/
      index.ts
    portal/
      core/
      connectors/
      disposable/
      tests/
      index.ts
  shared/
    core/
    connectors/
```

## 4. `features/events` の責務（最小）

- `core/`
  - `AuditEvent` などのドメインモデル
  - 不変条件・業務ルール
- `connectors/`
  - `CreateEventInput/Output` などの契約
  - `EventRepository` などの port(interface)
- `disposable/`
  - Hono route、D1 実装、Cloudflare 向け実装
- `tests/`
  - core の単体テスト
  - connectors 契約テスト
  - disposable の統合寄りテスト
- `index.ts`
  - feature の公開境界

### 4.1 各責務の最小 example（仮）

> [!WARNING]
> 以下はすべて **暫定のサンプルコード** です。  
> 最終実装は ADR 合意後に見直します。

#### `core/` example

```ts
// features/events/core/audit-event.ts (draft)
export type AuditEvent = Readonly<{
  tenantId: string;
  action: string;
  occurredAt: string;
}>;

export const createAuditEvent = (input: AuditEvent): AuditEvent => {
  if (!input.tenantId) throw new Error("tenantId is required");
  if (!input.action.includes(".")) throw new Error("invalid action");
  return Object.freeze(input);
};
```

#### `connectors/` example

```ts
// features/events/connectors/create-event.ts (draft)
import type { AuditEvent } from "../core/audit-event";

export type CreateEventInput = AuditEvent;
export type CreateEventOutput = Readonly<{ id: string }>;

export interface EventRepository {
  save: (event: AuditEvent) => Promise<string>;
}

export type CreateEvent = (
  input: CreateEventInput,
) => Promise<CreateEventOutput>;
```

#### `disposable/` example

```ts
// features/events/disposable/create-event.impl.ts (draft)
import { createAuditEvent } from "../core/audit-event";
import type {
  CreateEvent,
  CreateEventInput,
  CreateEventOutput,
  EventRepository,
} from "../connectors/create-event";

export const createEventImpl =
  (repo: EventRepository): CreateEvent =>
  async (input: CreateEventInput): Promise<CreateEventOutput> => {
    const event = createAuditEvent(input);
    const id = await repo.save(event);
    return { id };
  };
```

```ts
// features/events/disposable/route.ts (draft)
import { Hono } from "hono";
import { createEventImpl } from "./create-event.impl";

export const buildEventRoute = (createEvent: ReturnType<typeof createEventImpl>) => {
  const app = new Hono();
  app.post("/events", async (c) => c.json(await createEvent(await c.req.json()), 201));
  return app;
};
```

#### `tests/` example

```ts
// features/events/tests/core.spec.ts (draft)
import { describe, expect, it } from "vitest";
import { createAuditEvent } from "../core/audit-event";

describe("createAuditEvent", () => {
  it("action が不正な場合はエラー", () => {
    expect(() =>
      createAuditEvent({
        tenantId: "org_1",
        action: "invalid",
        occurredAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrowError("invalid action");
  });
});
```

#### `index.ts` example

```ts
// features/events/index.ts (draft)
import { buildEventRoute } from "./disposable/route";
import { createEventImpl } from "./disposable/create-event.impl";

const mockRepo = { save: async () => crypto.randomUUID() };

export const eventsFeature = buildEventRoute(createEventImpl(mockRepo));
```

## 5. 依存方向ルール（最重要）

- `disposable -> connectors -> core`
- `core` は他層を参照しない
- `disposable` から `core` へ直接依存しない（`connectors` 経由）

## 6. 確定前に必要な ADR（抜粋）

- WorkOS 互換範囲（完全互換 / 選択互換）
- 正式エンドポイント（`/audit_logs/*` と `/events` の扱い）
- Idempotency（キー、TTL、重複時のレスポンス）
- `GET /events` のフィルタ/ページング/ソート契約
- Export の CSV 契約と URL 失効ポリシー
- 共通エラー形式（`code/message/request_id`）

## 7. 最終注意

- この文書は **設計ドラフト** です
- 実装仕様書ではありません
- **ADR 合意前は実装しない** 前提で運用します
