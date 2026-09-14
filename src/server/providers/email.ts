import { assertDevelopment } from "../environment";
import { AppError } from "../errors";
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
export function configuredEmailProvider(): EmailProvider {
  if (process.env.EMAIL_PROVIDER === "development") {
    assertDevelopment("Development email");
    return new DevelopmentEmailProvider();
  }
  throw new AppError(
    "EMAIL_PROVIDER_UNAVAILABLE",
    "No external email delivery adapter is configured.",
    503,
  );
}
