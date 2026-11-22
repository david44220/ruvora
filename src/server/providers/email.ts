import { assertDevelopment } from "../environment";
import { AppError } from "../errors";
import { sendEmailViaResend } from "./adapters";

export interface EmailMessage {
  to: string;
  locale: string;
  template: string;
  variables: Record<string, string>;
}
export interface EmailProvider {
  name: string;
  environment: "development" | "production";
  deliver(
    message: EmailMessage,
    idempotencyKey: string,
  ): Promise<{ reference: string; simulated: boolean }>;
}
export class DevelopmentEmailProvider implements EmailProvider {
  readonly name = "development";
  readonly environment = "development";
  async deliver(_message: EmailMessage, idempotencyKey: string) {
    assertDevelopment("Development email");
    // Durable content stays encrypted in the outbox. Never send or log tokens.
    return { reference: "development:" + idempotencyKey, simulated: true };
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  readonly environment = "production";
  async deliver(message: EmailMessage, idempotencyKey: string) {
    const isFr = message.locale === "fr";
    const subject =
      message.template === "password_reset"
        ? isFr
          ? "Réinitialisation de votre mot de passe Ruvora"
          : "Reset your Ruvora password"
        : isFr
          ? "Vérifiez votre adresse e-mail Ruvora"
          : "Verify your Ruvora email address";
    const actionUrl = message.variables.url ?? "";
    const text = isFr
      ? `Bonjour,\n\nUtilisez ce lien sécurisé à usage unique pour poursuivre :\n${actionUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`
      : `Hello,\n\nUse this single-use security link to continue:\n${actionUrl}\n\nIf you did not request this action, you can safely ignore this email.`;
    const result = await sendEmailViaResend({
      to: message.to,
      subject,
      text,
      idempotencyKey,
    });
    return { reference: `resend:${result.providerReference}`, simulated: false };
  }
}

export function configuredEmailProvider(): EmailProvider {
  if (process.env.EMAIL_PROVIDER === "development") {
    assertDevelopment("Development email");
    return new DevelopmentEmailProvider();
  }
  if (process.env.EMAIL_PROVIDER === "resend") {
    return new ResendEmailProvider();
  }
  throw new AppError(
    "EMAIL_PROVIDER_UNAVAILABLE",
    "No external email delivery adapter is configured.",
    503,
  );
}
