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
    let subject: string;
    let text: string;
    if (message.template === "WEEKLY_DIGEST") {
      subject = isFr
        ? "Votre résumé hebdomadaire Ruvora (XP, série & activité)"
        : "Your weekly Ruvora recap (XP, streak & activity)";
      const name = message.variables.displayName ?? "";
      const level = message.variables.level ?? "1";
      const totalXp = message.variables.totalXp ?? "0";
      const streak = message.variables.streakWeeks ?? "0";
      const weeklyEvents = message.variables.weeklyEvents ?? "0";
      const publishedPlans = message.variables.publishedPlans ?? "0";
      const activeCampaigns = message.variables.activeCampaigns ?? "0";
      const studioUrl = message.variables.studioUrl ?? "";
      text = isFr
        ? `Bonjour ${name},\n\nVoici votre récapitulatif hebdomadaire Ruvora :\n- Niveau ${level} (${totalXp} XP)\n- Série hebdomadaire : ${streak} sem.\n- Interactions observées (7j) : ${weeklyEvents}\n- Posts planifiés publiés : ${publishedPlans}\n- Campagnes actives à découvrir : ${activeCampaigns}\n\nOuvrir votre studio : ${studioUrl}\n\nNote : Les XP et séries mesurent uniquement votre régularité et ne garantissent aucun revenu.`
        : `Hello ${name},\n\nHere is your weekly Ruvora recap:\n- Level ${level} (${totalXp} XP)\n- Weekly streak: ${streak} wk\n- Observed activity events (7d): ${weeklyEvents}\n- Published post plans: ${publishedPlans}\n- Active campaigns to explore: ${activeCampaigns}\n\nOpen your studio: ${studioUrl}\n\nNote: XP and streaks track consistency only and never guarantee income.`;
    } else if (message.template === "AUDIENCE_CONFIRM") {
      const creatorName = message.variables.creatorName ?? "Ruvora";
      const creatorHandle = message.variables.creatorHandle ?? "";
      const confirmUrl = message.variables.confirmUrl ?? "";
      const unsubscribeUrl = message.variables.unsubscribeUrl ?? "";
      subject = isFr
        ? `Confirmez votre inscription aux bons plans de ${creatorName} (@${creatorHandle})`
        : `Confirm your subscription to ${creatorName} (@${creatorHandle})`;
      text = isFr
        ? `Bonjour,\n\nConfirmez votre inscription en double opt-in pour recevoir les sélections partenaires de ${creatorName} (@${creatorHandle}) sur Ruvora :\n${confirmUrl}\n\nVous pourrez vous désinscrire en 1 clic à tout moment :\n${unsubscribeUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez simplement cet e-mail.`
        : `Hello,\n\nConfirm your double opt-in subscription to receive partner picks from ${creatorName} (@${creatorHandle}) on Ruvora:\n${confirmUrl}\n\nYou can unsubscribe in 1 click anytime:\n${unsubscribeUrl}\n\nIf you did not request this subscription, you can safely ignore this email.`;
    } else {
      subject =
        message.template === "password_reset" || message.template === "RESET_PASSWORD"
          ? isFr
            ? "Réinitialisation de votre mot de passe Ruvora"
            : "Reset your Ruvora password"
          : isFr
            ? "Vérifiez votre adresse e-mail Ruvora"
            : "Verify your Ruvora email address";
      const actionUrl = message.variables.url ?? "";
      text = isFr
        ? `Bonjour,\n\nUtilisez ce lien sécurisé à usage unique pour poursuivre :\n${actionUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`
        : `Hello,\n\nUse this single-use security link to continue:\n${actionUrl}\n\nIf you did not request this action, you can safely ignore this email.`;
    }
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
