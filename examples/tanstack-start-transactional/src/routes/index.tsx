import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { sendEmail } from "~/functions/send-email";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const send = useServerFn(sendEmail);
  const [status, setStatus] = useState<"idle" | "sending" | "accepted">("idle");
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="page">
      <section className="intro">
        <p className="eyebrow">TanStack Start + Samva</p>
        <h1>Send transactional email from a server function</h1>
        <p>
          This form validates input in a TanStack Start `createServerFn`, builds a server-only Samva
          client per request, and sends through `samva.messages.send`.
        </p>
      </section>

      <form
        className="contact-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);

          setStatus("sending");
          setError(null);

          try {
            await send({
              data: {
                to: String(form.get("to") ?? ""),
                subject: String(form.get("subject") ?? ""),
                message: String(form.get("message") ?? ""),
              },
            });
            setStatus("accepted");
            formElement.reset();
          } catch (err) {
            setStatus("idle");
            setError(err instanceof Error ? err.message : "Unable to send email");
          }
        }}
      >
        <label>
          Recipient email
          <input name="to" type="email" placeholder="ada@example.com" required />
        </label>

        <label>
          Subject
          <input name="subject" placeholder="Welcome to Samva" required />
        </label>

        <label>
          Message
          <textarea
            name="message"
            placeholder="Thanks for trying the TanStack Start example."
            required
            rows={6}
          />
        </label>

        <button type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending..." : "Send email"}
        </button>

        {error ? (
          <p className="form-message error" role="alert">
            {error}
          </p>
        ) : null}
        {status === "accepted" ? (
          <p className="form-message success">Message accepted by Samva.</p>
        ) : null}
      </form>
    </main>
  );
}
