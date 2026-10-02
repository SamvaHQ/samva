/** @jsxImportSource @samva/markup/email */
import { defineTemplate } from "@samva/markup";
import { Button, Email, Section } from "@samva/markup/email/components";
import { fmt } from "@samva/markup/fmt";
import { jsonSchema } from "@samva/markup/input-schema";

import { LineItem } from "./components/line-item";

/**
 * A second entry in the same project. The body stays inside the static
 * profile: `.map`, `&&`, `?:`, template strings, and `fmt.*` formatters. Anything
 * else is computed by the caller and sent in the input.
 */
export default defineTemplate({
  id: "receipt",
  schema: jsonSchema<{
    name: string;
    currency: string;
    items: { name: string; quantity: number; price: number }[];
    total: number;
    receiptUrl?: string;
  }>({
    type: "object",
    properties: {
      name: { type: "string" },
      currency: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            quantity: { type: "number" },
            price: { type: "number" },
          },
          required: ["name", "quantity", "price"],
          additionalProperties: false,
        },
      },
      total: { type: "number" },
      receiptUrl: { type: "string" },
    },
    required: ["name", "currency", "items", "total"],
    additionalProperties: false,
  }),
  fixtures: {
    default: {
      name: "Maya",
      currency: "USD",
      items: [
        { name: "Tea", quantity: 2, price: 4.5 },
        { name: "Coffee", quantity: 1, price: 6 },
      ],
      total: 15,
      receiptUrl: "https://app.example.com/receipts/1042",
    },
    "no-link": {
      name: "Sam",
      currency: "USD",
      items: [{ name: "Tea", quantity: 1, price: 4.5 }],
      total: 4.5,
    },
    empty: { name: "Ada", currency: "USD", items: [], total: 0 },
  },
  email: {
    subject: (input) => `Your receipt: ${fmt.money(input.total, input.currency)}`,
    body: (input) => (
      <Email lang="en" className="font-body bg-background dark:bg-background-dark">
        <Section
          width={600}
          tableStyle={{ width: "100%", maxWidth: 600 }}
          className="rounded-card bg-surface dark:bg-surface-dark px-8 py-6"
        >
          <h1 className="font-heading text-foreground dark:text-foreground-dark text-2xl font-bold">
            Thanks, {input.name}
          </h1>
          {input.items.length > 0 ? (
            input.items.map((item) => (
              <LineItem
                name={item.name}
                quantity={item.quantity}
                price={item.price}
                currency={input.currency}
              />
            ))
          ) : (
            <p className="text-muted dark:text-muted-dark text-base">Nothing in this order.</p>
          )}
          <p className="text-foreground dark:text-foreground-dark text-base font-semibold">
            Total {fmt.money(input.total, input.currency)}
          </p>
          {input.receiptUrl && (
            <Button
              href={input.receiptUrl}
              width={200}
              height={48}
              backgroundColor="var(--color-brand)"
              color="var(--color-brand-foreground)"
              fontFamily="var(--font-body)"
              borderRadius={6}
              className="bg-brand text-brand-foreground dark:bg-brand-dark dark:text-brand-foreground-dark font-semibold"
            >
              View receipt
            </Button>
          )}
        </Section>
      </Email>
    ),
  },
});
