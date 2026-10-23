<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageProps } from "./$types";

  let { form }: PageProps = $props();
  let pending = $state(false);
</script>

<svelte:head>
  <title>Contact form | SvelteKit + Samva</title>
</svelte:head>

<main class="shell">
  <section class="panel">
    <a class="back" href="/">Back</a>
    <p class="eyebrow">Form action</p>
    <h1>Contact form</h1>
    <p class="lede">
      Submit this form to run <code>src/routes/contact/+page.server.ts</code> and send
      through Samva with your server-only API key.
    </p>

    <form
      method="POST"
      use:enhance={() => {
        pending = true;
        return async ({ update }) => {
          await update();
          pending = false;
        };
      }}
    >
      <label>
        Name
        <input name="name" autocomplete="name" value={form?.values?.name ?? ""} />
      </label>

      <label>
        Email
        <input
          name="email"
          type="email"
          autocomplete="email"
          required
          value={form?.values?.email ?? ""}
        />
      </label>

      <label>
        Message
        <textarea name="message" required rows="5">{form?.values?.message ?? ""}</textarea>
      </label>

      <button type="submit" disabled={pending}>{pending ? "Sending..." : "Send"}</button>
    </form>

    {#if form?.error}
      <p class="status error" role="alert">{form.error}</p>
    {/if}

    {#if form?.success}
      <p class="status success">Message accepted by Samva.</p>
    {/if}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f6f6f3;
    color: #171717;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .shell {
    display: grid;
    min-height: 100vh;
    place-items: center;
    padding: 2rem;
  }

  .panel {
    width: min(100%, 42rem);
    border: 1px solid #dedbd2;
    border-radius: 8px;
    background: #fff;
    padding: 2rem;
    box-shadow: 0 10px 30px rgb(0 0 0 / 8%);
  }

  .back {
    color: #1155cc;
    font-weight: 700;
  }

  .eyebrow {
    margin: 1.25rem 0 0.75rem;
    color: #785f2f;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h1 {
    margin: 0 0 1rem;
    font-size: 2.1rem;
    line-height: 1.08;
  }

  .lede {
    line-height: 1.65;
  }

  form {
    display: grid;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  label {
    display: grid;
    gap: 0.4rem;
    font-weight: 700;
  }

  input,
  textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #cfcabd;
    border-radius: 6px;
    padding: 0.75rem 0.85rem;
    color: #171717;
    font: inherit;
  }

  textarea {
    resize: vertical;
  }

  button {
    width: fit-content;
    border: 0;
    border-radius: 6px;
    background: #171717;
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
    padding: 0.8rem 1.05rem;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  code {
    border-radius: 4px;
    background: #f0eee8;
    padding: 0.08rem 0.28rem;
  }

  .status {
    border-radius: 6px;
    margin: 1rem 0 0;
    padding: 0.85rem 1rem;
  }

  .error {
    background: #fff1f2;
    color: #9f1239;
  }

  .success {
    background: #ecfdf3;
    color: #166534;
  }
</style>
