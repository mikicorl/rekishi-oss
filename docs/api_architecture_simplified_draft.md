# API Architecture (Simplified Draft)

> [!WARNING]
> この文書は **暫定方針（Draft）** です。  
> **最終決定ではありません。** 実装開始前に ADR で確定してください。

## 1. この案の位置づけ

- 目的: `apps/api` の構成を、まず運用しやすい最小形に揃える
- 方針: Clean Architecture の依存規則を守りつつ、過剰分割を避ける
- 前提: 後で分割・置換できるように、境界だけは先に固定する

> [!IMPORTANT]
> この構成は「採用候補」です。  
> 合意までは変更・破棄を前提に扱います。

## 2. 採用する形（暫定）

- 分類: **Clean Architecture 準拠の簡略版**
- 実態: **Feature Colocation + Vertical Slice + Ports/Adapters 的分離**
- ねらい:
  - ドメインルールは守る
  - API 層の変更速度は落とさない
  - ディレクトリを増やしすぎない

## 3. ディレクトリ構成（簡略版）

```txt
apps/api/src/
  app/
    server.ts
    container.ts
  features/
    events/
      domain/      # Durable Core
      usecase/     # Application
      infra/       # ports + adapters（当面同居）
      http/        # contract + route
      tests/
      index.ts
    exports/
      domain/
      usecase/
      infra/
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
    kernel/
```

## 4. `features/events` の責務（最小セット）

- `domain/`
  - 監査ログの不変条件
  - 例: `audit-event.ts`, `idempotency-policy.ts`
- `usecase/`
  - ユースケースの実行フロー
  - 例: `create-event.ts`, `search-events.ts`
- `infra/`
  - 永続化・外部サービス接続
  - 例: `event-repository.ts`, `idempotency-store.ts`
- `http/`
  - ルーティング・入出力変換・バリデーション
  - 例: `route.ts`, `dto.ts`
- `tests/`
  - domain/usecase/http のテスト
- `index.ts`
  - feature の公開境界

### 4.1 各責務の最小 example（仮）

> [!WARNING]
> ここに載せるコードはすべて **暫定のサンプル** です。  
> そのまま実装確定とはみなしません。

#### `domain/` example

```ts
// features/events/domain/audit-event.ts (draft)
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

#### `usecase/` example

```ts
// features/events/usecase/create-event.ts (draft)
import { createAuditEvent, type AuditEvent } from "../domain/audit-event";
import type { EventRepository } from "../infra/event-repository.port";

export const createEvent =
  (repo: EventRepository) =>
  async (input: AuditEvent): Promise<{ id: string }> => {
    const event = createAuditEvent(input);
    const id = await repo.insert(event);
    return { id };
  };
```

#### `infra/` example

```ts
// features/events/infra/event-repository.port.ts (draft)
import type { AuditEvent } from "../domain/audit-event";

export type EventRepository = {
  insert: (event: AuditEvent) => Promise<string>;
};
```

```ts
// features/events/infra/event-repository.d1.ts (draft)
import type { EventRepository } from "./event-repository.port";

export const createD1EventRepository = (): EventRepository => ({
  insert: async () => crypto.randomUUID(),
});
```

#### `http/` example

```ts
// features/events/http/route.ts (draft)
import { Hono } from "hono";
import { createEvent } from "../usecase/create-event";
import { createD1EventRepository } from "../infra/event-repository.d1";

const app = new Hono();

app.post("/events", async (c) => {
  const payload = await c.req.json();
  const usecase = createEvent(createD1EventRepository());
  const result = await usecase(payload);
  return c.json(result, 201);
});

export default app;
```

#### `tests/` example

```ts
// features/events/tests/domain.spec.ts (draft)
import { describe, expect, it } from "vitest";
import { createAuditEvent } from "../domain/audit-event";

describe("createAuditEvent", () => {
  it("action がドット区切りでない場合にエラー", () => {
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
import route from "./http/route";

export const buildEventsFeature = () => route;
```

## 5. 依存方向ルール（最重要）

- `http -> usecase -> domain`
- `usecase -> infra` の直接依存は禁止（interface 経由）
- `domain` は他層を参照しない

## 6. この案を確定する前に決めること（ADR）

- WorkOS 互換範囲（完全互換か選択互換か）
- エンドポイント正本（`/audit_logs/*` と `/events` の整理）
- Idempotency（キー設計・TTL・重複時レスポンス）
- `GET /events`（フィルタ・ページング・ソート契約）
- Export（CSV列契約・URL失効ポリシー）
- 共通エラー形式（`code/message/request_id`）

## 7. 最終注意

- この文書は **設計ドラフト** です
- 実装仕様書ではありません
- **ADR 合意前は実装しない** ことを前提にします
