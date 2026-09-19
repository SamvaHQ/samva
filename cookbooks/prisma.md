# Prisma with Samva

Send transactional email from your Prisma app with Samva.
The usual seam is plain control flow.
Write the database row with Prisma. Then send the email with the persisted data.

This guide uses order events because the database write is the trigger.
For signup, password reset, magic link, or OTP mail, put the send in your auth
library's callback instead. See the [Better Auth cookbook](./better-auth.md).

## Setup

```sh
bun add samva @prisma/client
```

Keep `SAMVA_API_KEY` server-side only. In a Next.js app, `server-only` makes the
boundary explicit.

```ts
// lib/samva.ts
import "server-only";
import { createClient } from "samva";

const apiKey = process.env.SAMVA_API_KEY;
if (!apiKey) {
  throw new Error("SAMVA_API_KEY is required to send order email");
}

export const samva = createClient({ apiKey });
```

Use one Prisma client instance and reuse it across the app.
For the Prisma 6 default `prisma-client-js` generator, import from
`@prisma/client`.

```ts
// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

Samva sends from the verified sender on your account.
The `from` field is optional and defaults to that sender.

## Query, then send

Create or update the row first. Then send from the committed data.

```ts
import { prisma } from "./lib/prisma";
import { samva } from "./lib/samva";

const order = await prisma.order.create({
  data: {
    email: "ada@example.com",
    total: 4900,
    status: "confirmed",
  },
});

await samva.messages.send({
  to: [{ email: order.email }],
  channel: "email",
  email: {
    subject: `Order #${order.id} confirmed`,
    html: `<p>Thanks. Your order total is ${order.total}.</p>`,
  },
});
```

That is the integration. Prisma owns persistence. Samva owns delivery.
If the send throws, let the request fail.
Or catch the error at your application boundary and record it for retry.

## Next.js Server Action

Server Actions are a natural place to keep the mutation and send together.

```ts
"use server";

import { prisma } from "@/lib/prisma";
import { samva } from "@/lib/samva";

export async function createOrder(input: { email: string; total: number }) {
  if (!input.email || input.total <= 0) {
    throw new Error("A valid email and positive total are required");
  }

  const order = await prisma.order.create({
    data: {
      email: input.email,
      total: input.total,
      status: "confirmed",
    },
  });

  await samva.messages.send({
    to: [{ email: order.email }],
    channel: "email",
    email: {
      subject: `Order #${order.id} confirmed`,
      html: `<p>Thanks. Your order total is ${order.total}.</p>`,
    },
  });

  return order;
}
```

For framework-specific routing details, keep this Prisma seam.
Follow the route and action structure in the [Next.js cookbook](./nextjs.md).

## Route Handler

The same shape works in an HTTP endpoint or webhook receiver.

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { samva } from "@/lib/samva";

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; total?: number };

  if (!body.email || typeof body.total !== "number" || body.total <= 0) {
    return NextResponse.json({ error: "Invalid order payload" }, { status: 400 });
  }

  const order = await prisma.order.create({
    data: {
      email: body.email,
      total: body.total,
      status: "confirmed",
    },
  });

  await samva.messages.send({
    to: [{ email: order.email }],
    channel: "email",
    email: {
      subject: `Order #${order.id} confirmed`,
      html: `<p>Thanks. Your order total is ${order.total}.</p>`,
    },
  });

  return NextResponse.json({ orderId: order.id });
}
```

For provider webhooks, verify the upstream webhook signature before this handler
writes the order. Samva delivery-event verification belongs to the
`samva/webhooks` SDK subpath.

## React Email template

Render a React Email component to `html`. Derive a text fallback.
Pass both strings to Samva.

```tsx
import { render, toPlainText } from "react-email";
import { samva } from "@/lib/samva";
import OrderConfirmation from "@/emails/order-confirmation";

const html = await render(<OrderConfirmation order={order} />);
const text = toPlainText(html);

await samva.messages.send({
  to: [{ email: order.email }],
  channel: "email",
  email: {
    subject: `Order #${order.id} confirmed`,
    html,
    text,
  },
});
```

See the [React Email cookbook](./react-email.md) for template structure,
previewing, Tailwind, and edge rendering.

## Prisma Client Extension

Prefer explicit query-then-send in application code.
If you want the data layer to centralize the side effect for a specific write,
use a Prisma Client Extension query component.

```ts
// lib/prisma.ts
import { PrismaClient } from "@prisma/client";
import { samva } from "./samva";

const base = new PrismaClient();

export const prisma = base.$extends({
  name: "samva-order-emails",
  query: {
    order: {
      async create({ args, query }) {
        const order = await query(args);

        try {
          await samva.messages.send({
            to: [{ email: order.email }],
            channel: "email",
            email: {
              subject: `Order #${order.id} confirmed`,
              html: `<p>Thanks. Your order total is ${order.total}.</p>`,
            },
          });
        } catch (error) {
          console.error("order email failed", error);
        }

        return order;
      },
    },
  },
});
```

Use the extended `prisma` instance everywhere. `$extends` returns a new client.
Extensions are not global.

Caveats:

- The example catches send failures so `prisma.order.create()` can still return
  the committed row. Remove that catch if delivery failure should fail the write
  path.
- Query extensions wrap the individual operation. They are not commit-aware for
  an interactive `$transaction`. When correctness matters, send after the
  transaction resolves in app code.
- The `result` extension component is for computed fields on query results.
  It is not for delivery side effects.
- Scope broad extensions with `$allModels` or `$allOperations` only when every
  matching operation can safely trigger that behavior.

Do not use Prisma Client middleware `prisma.$use` for this.
The middleware API was removed in Prisma 7. Use Client Extensions instead.

## Edge and Workers

The Samva send runs anywhere `fetch` is available.
To run the Prisma query at the edge too, pair Prisma with an edge-compatible
driver adapter and the Rust-free client.

Prisma version split:

- Prisma 6 default uses the `prisma-client-js` generator.
  Import `PrismaClient` from `@prisma/client` and instantiate `new PrismaClient()`.
- Prisma 6.16.0 and Prisma 7 use the Rust-free `prisma-client` generator.
  Import the client from your generated output path and pass a driver adapter.
  Prisma 7 requires a driver adapter for all databases.

Example shape:

```ts
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool } from "@neondatabase/serverless";
import { PrismaClient } from "@/app/generated/prisma/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaNeon(pool);

export const prisma = new PrismaClient({ adapter });
```

Choose an adapter that works in your runtime.
Neon Serverless, PlanetScale Serverless, Turso via `@libsql/client`, Cloudflare
D1, and Prisma Postgres have edge-compatible paths.
`pg` uses Cloudflare's TCP `connect()` and is Workers-only, not Vercel Edge.

Keep the main examples on Node unless your database adapter is already
edge-ready. Samva is not the runtime constraint. The database connection is.

## FAQ

**Where do I set the sender?** Configure the verified sender or domain in Samva, or pass an
explicit `from` per send. When omitted, Samva uses the verified sender.

**Should I send inside `$transaction`?** No. Email cannot be rolled back.
Write the rows in a transaction. Let the transaction resolve. Then send.
If you need durable retries, write an outbox row in the same transaction.
Have a worker send from that outbox.

**How do I make retries idempotent?** Store your own event key, such as
`order.id` plus `emailType`, before sending.
Retry the same logical event rather than creating a second order event.

**What about bulk sends?** Queue them.
Prisma can batch database writes.
Delivery should be retried and rate-limited outside the request path.

**What about user signup emails?** Put those in your auth layer's email callback.
If you use Better Auth with Prisma as the store, use the
[Better Auth cookbook](./better-auth.md).

**How do I update my database from Samva delivery events?** Use the
`samva/webhooks` SDK subpath to verify Samva webhook signatures.
Then update rows from the verified event.
Do not hand-roll signature verification in each integration.
