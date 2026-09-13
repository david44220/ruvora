import type { Locale } from "./messages";
const errors: Record<string, [string, string]> = {
  INVALID_CREDENTIALS: [
    "The email address or password is incorrect.",
    "L’adresse e-mail ou le mot de passe est incorrect.",
  ],
  EMAIL_EXISTS: [
    "An account already uses this email address. Log in instead.",
    "Un compte utilise déjà cette adresse e-mail. Connectez-vous.",
  ],
  HANDLE_UNAVAILABLE: [
    "This handle is already taken. Choose another.",
    "Cet identifiant est déjà utilisé. Choisissez-en un autre.",
  ],
  VALIDATION_ERROR: [
    "Check the form fields. Use complete HTTPS links and the required limits.",
    "Vérifiez les champs. Utilisez des liens HTTPS complets et respectez les limites.",
  ],
  RATE_LIMITED: [
    "Too many attempts. Please try again later.",
    "Trop de tentatives. Réessayez plus tard.",
  ],
  FREQUENCY_CAP: [
    "You have reached this campaign’s daily participation limit.",
    "Vous avez atteint la limite quotidienne de cette campagne.",
  ],
  FORBIDDEN: [
    "Your account does not have access to this action.",
    "Votre compte ne permet pas cette action.",
  ],
  UNAUTHENTICATED: ["Log in to continue.", "Connectez-vous pour continuer."],
  ECONOMIC_HOLD: [
    "Your account is on an economic hold and needs operator review.",
    "Votre compte fait l’objet d’un gel économique et doit être examiné.",
  ],
  POLICY_INELIGIBLE: [
    "Complete onboarding and check regional eligibility before participating.",
    "Terminez votre profil et vérifiez votre éligibilité régionale avant de participer.",
  ],
  POLICY_NOT_CONFIGURED: [
    "Participation is not open yet. The operator must configure eligibility.",
    "La participation n’est pas encore ouverte. L’opérateur doit configurer l’éligibilité.",
  ],
  INVALID_BUDGET: [
    "Unit cost must fit the daily budget, and the daily budget must fit the total.",
    "Le coût unitaire doit respecter le budget quotidien, lui-même inférieur au budget total.",
  ],
  INVALID_WINDOW: [
    "The end must be after the start and in the future.",
    "La fin doit suivre le début et se situer dans le futur.",
  ],
  INVALID_PERIOD: [
    "Choose a finished period: its end must be before now and after its start.",
    "Choisissez une période terminée : la fin doit être passée et postérieure au début.",
  ],
  INSUFFICIENT_FUNDS: [
    "There is not enough funded campaign budget for this activity.",
    "Le budget financé de la campagne est insuffisant pour cette activité.",
  ],
  BUDGET_EXCEEDED: [
    "This funding would exceed the campaign’s total budget.",
    "Ce financement dépasserait le budget total de la campagne.",
  ],
  CAMPAIGN_INACTIVE: [
    "This campaign is no longer accepting participation.",
    "Cette campagne n’accepte plus de participation.",
  ],
  REVIEW_CONFLICT: [
    "An independent administrator must review activity that benefits your account.",
    "Un autre administrateur doit examiner une activité dont votre compte bénéficie.",
  ],
  EVENT_NOT_JOINED: [
    "Join the linked event before submitting this activity.",
    "Rejoignez l’événement associé avant de soumettre cette activité.",
  ],
  STALE_PREVIEW: [
    "The underlying records changed. Create a new distribution preview.",
    "Les données ont changé. Créez un nouvel aperçu de distribution.",
  ],
  STALE_RULES: [
    "The active policy changed. Create a new distribution preview.",
    "La politique active a changé. Créez un nouvel aperçu de distribution.",
  ],
  PERIOD_OVERLAP: [
    "This period overlaps a distribution already finalized.",
    "Cette période chevauche une distribution déjà finalisée.",
  ],
  PAYMENTS_UNAVAILABLE: [
    "Campaign funding is unavailable. No live payment provider is connected.",
    "Le financement est indisponible. Aucun prestataire de paiement réel n’est connecté.",
  ],
  ACTIVITY_INELIGIBLE: [
    "The activity does not meet the validation requirements. Review its evidence and budget.",
    "L’activité ne remplit pas les critères de validation. Vérifiez les preuves et le budget.",
  ],
  IDEMPOTENCY_CONFLICT: [
    "This operation key was already used with different details. Reload before continuing.",
    "Cette clé d’opération a déjà servi avec d’autres données. Rechargez la page.",
  ],
  SELF_PARTICIPATION: [
    "You cannot participate in your own advertising campaign.",
    "Vous ne pouvez pas participer à votre propre campagne publicitaire.",
  ],
};
export function errorMessage(code: string, locale: Locale) {
  return (
    errors[code]?.[locale === "fr" ? 1 : 0] ||
    (locale === "fr"
      ? "Impossible de terminer cette demande. Vérifiez les données et réessayez."
      : "We could not complete this request. Check the details and try again.")
  );
}
