import { fail } from "@sveltejs/kit";

import { buildContactEmail } from "#lib/contact-email";
import { getSamva } from "#lib/server/samva";

import type { Actions } from "./$types";

const getField = (formData: FormData, field: string): string =>
  String(formData.get(field) ?? "").trim();

const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const name = getField(formData, "name");
    const email = getField(formData, "email");
    const message = getField(formData, "message");

    if (!isEmail(email) || !message) {
      return fail(400, {
        error: "A valid email and message are required.",
        values: { name, email, message },
      });
    }

    const contact = {
      email,
      message,
      ...(name ? { name } : {}),
    };

    await getSamva().messages.send({
      to: [{ email }],
      channel: "email",
      email: buildContactEmail(contact),
    });

    return { success: true };
  },
} satisfies Actions;
