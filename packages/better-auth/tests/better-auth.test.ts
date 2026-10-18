import { createServer } from "node:http";

import type { BetterAuthOptions } from "better-auth";
import type {
  EmailOTPOptions,
  MagicLinkOptions,
  OrganizationOptions,
  TwoFactorOptions,
} from "better-auth/plugins";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  renderAndSend,
  renderTemplate,
  samvaEmail,
  type SamvaClient,
  type SamvaEmailDataByTrigger,
  withSamva,
} from "../src/index";

const date = new Date("2026-01-01T00:00:00.000Z");
const user = {
  id: "user_123",
  email: "ada@example.com",
  emailVerified: true,
  name: "Ada",
  createdAt: date,
  updatedAt: date,
} satisfies SamvaEmailDataByTrigger["verification"]["user"];
const twoFactorUser = {
  ...user,
  twoFactorEnabled: true,
} satisfies SamvaEmailDataByTrigger["twoFactorOtp"]["user"];

const organizationInvitation = {
  id: "inv_123",
  role: "member",
  email: "invite@example.com",
  organization: {
    id: "org_123",
    name: "Acme",
    slug: "acme",
    createdAt: date,
  },
  invitation: {
    id: "inv_123",
    organizationId: "org_123",
    email: "invite@example.com",
    role: "member",
    status: "pending",
    inviterId: user.id,
    expiresAt: date,
    createdAt: date,
  },
  inviter: {
    id: "member_123",
    organizationId: "org_123",
    userId: user.id,
    role: "owner",
    createdAt: date,
    user,
  },
} satisfies SamvaEmailDataByTrigger["organizationInvitation"];

function fakeClient() {
  const calls: Array<Parameters<SamvaClient["messages"]["send"]>[0]> = [];
  const client = {
    messages: {
      send: async (input: Parameters<SamvaClient["messages"]["send"]>[0]) => {
        calls.push(input);
        return { id: "msg_123" };
      },
    },
  } satisfies SamvaClient;

  return { client, calls };
}

describe("@samva/better-auth", () => {
  it("sends through the published SDK over HTTP", async () => {
    const requests: Array<{
      method: string | undefined;
      path: string | undefined;
      key: string | string[] | undefined;
      body: string;
    }> = [];
    const server = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      requests.push({
        method: request.method,
        path: request.url,
        key: request.headers["x-api-key"],
        body,
      });
      response.writeHead(201, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: "msg_http",
          status: "queued",
          waitReason: null,
          reviewExpectedAt: null,
          skippedRecipients: [],
          createdAt: date.toISOString(),
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("Expected HTTP port");
      await renderAndSend(
        "verification",
        { user, url: "https://app.example.com/verify", token: "abc" },
        { apiKey: "samva_sk_test_adapter", baseUrl: `http://127.0.0.1:${address.port}` },
      );
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        method: "POST",
        path: "/v1/messages",
        key: "samva_sk_test_adapter",
      });
      expect(JSON.parse(requests[0]!.body)).toMatchObject({
        to: [{ email: user.email }],
        channel: "email",
        email: { subject: "Verify your email" },
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("renders default templates and sends through the Samva messages API", async () => {
    const { client, calls } = fakeClient();

    await renderAndSend(
      "verification",
      { user, url: "https://app.example.com/verify?token=abc", token: "abc" },
      { client },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      to: [{ email: "ada@example.com" }],
      channel: "email",
      email: {
        subject: "Verify your email",
      },
    });
    expect(calls[0]?.email.html).toContain("https://app.example.com/verify?token=abc");
  });

  it("uses trigger templates and sends change-email confirmations to the new address", async () => {
    const { client, calls } = fakeClient();

    await renderAndSend(
      "changeEmail",
      {
        user,
        newEmail: "new@example.com",
        url: "https://app.example.com/change?token=abc",
        token: "abc",
      },
      {
        client,
        templates: {
          changeEmail: ({ newEmail }) => ({
            subject: "Confirm address",
            html: `<p>${newEmail}</p>`,
            text: newEmail,
          }),
        },
      },
    );

    expect(calls[0]?.to).toEqual([{ email: "new@example.com" }]);
    expect(calls[0]?.email).toEqual({
      subject: "Confirm address",
      html: "<p>new@example.com</p>",
      text: "new@example.com",
    });
  });

  it("exposes callback fragments for every Better Auth email trigger", async () => {
    const { client, calls } = fakeClient();
    const fragments = samvaEmail({ client, appUrl: "https://app.example.com" });

    await fragments.emailVerification.sendVerificationEmail({
      user,
      url: "https://app.example.com/verify",
      token: "v",
    });
    await fragments.emailAndPassword.sendResetPassword({
      user,
      url: "https://app.example.com/reset",
      token: "r",
    });
    await fragments.user.changeEmail.sendChangeEmailConfirmation({
      user,
      newEmail: "new@example.com",
      url: "https://app.example.com/change",
      token: "c",
    });
    await fragments.user.deleteUser.sendDeleteAccountVerification({
      user,
      url: "https://app.example.com/delete",
      token: "d",
    });
    await fragments.plugins.emailOTP.sendVerificationOTP({
      email: "otp@example.com",
      otp: "123456",
      type: "sign-in",
    });
    await fragments.plugins.twoFactor.otpOptions.sendOTP({ user: twoFactorUser, otp: "654321" });
    await fragments.plugins.magicLink.sendMagicLink({
      email: "magic@example.com",
      url: "https://app.example.com/magic",
      token: "m",
    });
    await fragments.plugins.organization.sendInvitationEmail(organizationInvitation);

    expect(calls.map((call) => call.to[0]?.email)).toEqual([
      "ada@example.com",
      "ada@example.com",
      "new@example.com",
      "ada@example.com",
      "otp@example.com",
      "ada@example.com",
      "magic@example.com",
      "invite@example.com",
    ]);
    expect(calls.at(-1)?.email.html).toContain(
      "https://app.example.com/organization/accept-invitation?id=inv_123",
    );
  });

  it("adds enabled Better Auth plugins without clobbering existing callbacks", () => {
    const existingVerification = async () => {};
    const options = withSamva(
      {
        emailVerification: {
          sendVerificationEmail: existingVerification,
        },
        user: {
          changeEmail: { enabled: true },
          deleteUser: { enabled: true },
        },
        plugins: [{ id: "existing" }],
      },
      {
        client: fakeClient().client,
        plugins: {
          emailOTP: true,
          magicLink: { disableSignUp: true },
          organization: true,
          twoFactor: true,
        },
      },
    );

    expect(options.emailVerification?.sendVerificationEmail).toBe(existingVerification);
    expect(options.emailAndPassword?.sendResetPassword).toBeTypeOf("function");
    expect(options.user?.changeEmail?.sendChangeEmailConfirmation).toBeTypeOf("function");
    expect(options.user?.deleteUser?.sendDeleteAccountVerification).toBeTypeOf("function");
    expect(options.plugins).toHaveLength(5);
  });

  it("supports plain string template output", async () => {
    const rendered = await renderTemplate(
      "emailOtp",
      { email: "ada@example.com", otp: "123456", type: "sign-in" },
      {
        emailOtp: ({ otp }) => `<p>${otp}</p>`,
      },
    );

    expect(rendered).toEqual({
      subject: "Your verification code",
      html: "<p>123456</p>",
    });
  });

  it("requires appUrl for the default organization invitation template", async () => {
    await expect(
      renderTemplate("organizationInvitation", organizationInvitation, undefined),
    ).rejects.toThrow("Set appUrl");
  });

  it("keeps the transformer return type assignable to the input config", () => {
    const config = {
      emailAndPassword: { enabled: true },
    };
    const transformed = withSamva(config, { client: fakeClient().client });

    expectTypeOf(transformed).toMatchTypeOf(config);
  });

  it("keeps template payload types aligned with Better Auth callbacks", () => {
    expectTypeOf<SamvaEmailDataByTrigger["verification"]>().toEqualTypeOf<
      Parameters<
        NonNullable<NonNullable<BetterAuthOptions["emailVerification"]>["sendVerificationEmail"]>
      >[0]
    >();
    expectTypeOf<SamvaEmailDataByTrigger["resetPassword"]>().toEqualTypeOf<
      Parameters<
        NonNullable<NonNullable<BetterAuthOptions["emailAndPassword"]>["sendResetPassword"]>
      >[0]
    >();
    expectTypeOf<SamvaEmailDataByTrigger["changeEmail"]>().toEqualTypeOf<
      Parameters<
        NonNullable<
          NonNullable<
            NonNullable<BetterAuthOptions["user"]>["changeEmail"]
          >["sendChangeEmailConfirmation"]
        >
      >[0]
    >();
    expectTypeOf<SamvaEmailDataByTrigger["deleteAccount"]>().toEqualTypeOf<
      Parameters<
        NonNullable<
          NonNullable<
            NonNullable<BetterAuthOptions["user"]>["deleteUser"]
          >["sendDeleteAccountVerification"]
        >
      >[0]
    >();
    expectTypeOf<SamvaEmailDataByTrigger["emailOtp"]>().toEqualTypeOf<
      Parameters<EmailOTPOptions["sendVerificationOTP"]>[0]
    >();
    expectTypeOf<SamvaEmailDataByTrigger["twoFactorOtp"]>().toEqualTypeOf<
      Parameters<NonNullable<NonNullable<TwoFactorOptions["otpOptions"]>["sendOTP"]>>[0]
    >();
    expectTypeOf<SamvaEmailDataByTrigger["magicLink"]>().toEqualTypeOf<
      Parameters<MagicLinkOptions["sendMagicLink"]>[0]
    >();
    expectTypeOf<SamvaEmailDataByTrigger["organizationInvitation"]>().toEqualTypeOf<
      Parameters<NonNullable<OrganizationOptions["sendInvitationEmail"]>>[0]
    >();
  });

  it("fails loudly when the recipient email is empty", async () => {
    await expect(
      renderAndSend(
        "magicLink",
        { email: " ", url: "https://app.example.com/magic", token: "m" },
        { client: fakeClient().client },
      ),
    ).rejects.toThrow("recipient email");
  });
});
