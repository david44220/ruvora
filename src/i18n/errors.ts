import type { Locale } from "./messages";
const errors: Record<string, [string, string]> = {
  SHARE_LINK_INVALID: [
    "This share link is incomplete or invalid. Ask its owner for the original link.",
    "Ce lien de partage est incomplet ou invalide. Demandez le lien original à son propriétaire.",
  ],
  ATTRIBUTION_TOKEN_INVALID: [
    "This attribution link is invalid. Open the creator’s original link again.",
    "Ce lien d’attribution est invalide. Rouvrez le lien original du créateur.",
  ],
  ATTRIBUTION_ACCOUNT_MISMATCH: [
    "This attribution context belongs to another account. Sign in to that account to continue.",
    "Cette attribution appartient à un autre compte. Connectez-vous à ce compte pour continuer.",
  ],
  ATTRIBUTION_EXPIRED: [
    "This attribution has expired. Open the creator’s link again before participating.",
    "Cette attribution a expiré. Rouvrez le lien du créateur avant de participer.",
  ],
  ATTRIBUTION_INACTIVE: [
    "This attribution is no longer active. Open an eligible creator link before participating.",
    "Cette attribution n’est plus active. Ouvrez un lien de créateur admissible avant de participer.",
  ],
  ATTRIBUTION_CAMPAIGN_MISMATCH: [
    "This attribution link belongs to another campaign. Return to the campaign linked by the creator.",
    "Ce lien d’attribution appartient à une autre campagne. Revenez à la campagne partagée par le créateur.",
  ],
  ATTRIBUTION_EVENT_MISMATCH: [
    "This attribution link belongs to another event. Return to the linked event before participating.",
    "Ce lien d’attribution appartient à un autre événement. Revenez à l’événement associé avant de participer.",
  ],
  ATTRIBUTION_USAGE_LIMIT: [
    "This attribution context has reached its activity limit. Additional attributed submissions are unavailable.",
    "Cette attribution a atteint sa limite d’activités. Aucune activité attribuée supplémentaire ne peut être soumise.",
  ],
  ATTRIBUTION_SNAPSHOT_MISMATCH: [
    "This activity’s attribution needs an operator review before rewards can be validated.",
    "L’attribution de cette activité doit être examinée par un opérateur avant la validation des contributions.",
  ],
  SELF_ATTRIBUTION: [
    "Your own activity or advertising campaign cannot generate creator credit for you.",
    "Votre propre activité ou campagne publicitaire ne peut pas vous attribuer de contribution créateur.",
  ],
  SELF_REFERRAL: [
    "You cannot receive referral rewards for your own account or advertising campaigns.",
    "Vous ne pouvez pas recevoir de contributions de parrainage pour votre propre compte ou vos campagnes publicitaires.",
  ],
  CREATOR_INELIGIBLE: [
    "Creator attribution is unavailable for this profile. The creator must meet the current eligibility requirements.",
    "L’attribution créateur est indisponible pour ce profil. Le créateur doit respecter les conditions d’admissibilité en vigueur.",
  ],
  CREATOR_CAMPAIGN_INELIGIBLE: [
    "This profile does not meet the campaign’s country, category or audience criteria.",
    "Ce profil ne respecte pas les critères de pays, de catégorie ou d’audience de la campagne.",
  ],
  CAMPAIGN_REGION_INELIGIBLE: [
    "This campaign is unavailable in your declared country. Choose an eligible opportunity.",
    "Cette campagne est indisponible dans votre pays déclaré. Choisissez une opportunité admissible.",
  ],
  SHARE_LINK_INACTIVE: [
    "This share link is unavailable. Ask its owner for a current link.",
    "Ce lien de partage est indisponible. Demandez un lien actuel à son propriétaire.",
  ],
  REFERRAL_CONTEXT_REQUIRED: [
    "A valid explicit referral link is required before a new account can attach a referrer.",
    "Un lien de parrainage explicite et valide est requis pour rattacher un parrain à un nouveau compte.",
  ],
  REFERRAL_ACCOUNT_EXISTS: [
    "Referral links apply only before account creation. An existing account cannot attach a new referrer.",
    "Les liens de parrainage s’appliquent avant la création du compte. Un compte existant ne peut pas ajouter de nouveau parrain.",
  ],
  REFERRAL_ALREADY_BOUND: [
    "This account already has a direct referrer. Its originating referrer cannot be changed.",
    "Ce compte possède déjà un parrain direct. Son parrain d’origine ne peut pas être modifié.",
  ],
  REFERRAL_LOOP: [
    "This referral would create a cycle and cannot be accepted.",
    "Ce parrainage créerait une boucle et ne peut pas être accepté.",
  ],
  REFERRER_INELIGIBLE: [
    "This referrer is currently ineligible. No referral reward can be created.",
    "Ce parrain n’est actuellement pas admissible. Aucune contribution de parrainage ne peut être créée.",
  ],
  CONVERSION_PROVIDER_REJECTED: [
    "The provider rejected or reversed this conversion. It cannot be validated.",
    "Le prestataire a rejeté ou annulé cette conversion. Elle ne peut pas être validée.",
  ],
  UNTRUSTED_CREATOR_ATTRIBUTION: [
    "This older creator claim has no trusted origin. Request an operator review; it cannot create new creator rewards.",
    "Cette ancienne attribution créateur ne possède pas d’origine fiable. Demandez un examen opérateur ; elle ne peut pas créer de nouvelles contributions créateur.",
  ],
  MFA_REQUIRED: [
    "Enroll an authenticator before this action.",
    "Configurez une application d’authentification avant cette action.",
  ],
  FRESH_AUTH_REQUIRED: [
    "Confirm your password and a new authenticator code before continuing.",
    "Confirmez votre mot de passe et un nouveau code d’authentification pour continuer.",
  ],
  INVALID_MFA_CODE: [
    "This authenticator code is invalid, expired or already used. Wait for the next code.",
    "Ce code est incorrect, expiré ou déjà utilisé. Attendez le prochain code.",
  ],
  MFA_ALREADY_ENABLED: [
    "An authenticator is already enrolled for this account.",
    "Une application d’authentification est déjà configurée pour ce compte.",
  ],
  MFA_ENROLLMENT_EXPIRED: [
    "Start a new authenticator enrollment in this session.",
    "Recommencez la configuration de l’authentification dans cette session.",
  ],
  INVALID_RECOVERY_CODE: [
    "This recovery code is invalid or already used.",
    "Ce code de récupération est incorrect ou déjà utilisé.",
  ],
  INVALID_SECURITY_TOKEN: [
    "This link is invalid, expired or already used. Request a new link.",
    "Ce lien est incorrect, expiré ou déjà utilisé. Demandez un nouveau lien.",
  ],
  SECURITY_KEY_REQUIRED: [
    "Security services are unavailable. Contact the operator.",
    "Les services de sécurité sont indisponibles. Contactez l’opérateur.",
  ],
  INVALID_SECRET_BOX: [
    "Protected security data could not be read. Contact the operator.",
    "Les données de sécurité protégées sont illisibles. Contactez l’opérateur.",
  ],
  INVALID_TOTP_INPUT: [
    "Check the authenticator code and try again.",
    "Vérifiez le code d’authentification et réessayez.",
  ],
  INVALID_TOTP_SECRET: [
    "Authenticator setup is invalid. Start a new enrollment.",
    "La configuration est incorrecte. Recommencez l’inscription de l’authentificateur.",
  ],
  MFA_SEED_CONFLICT: [
    "The existing authenticator cannot be overwritten by development setup.",
    "La configuration de développement ne peut pas remplacer l’authentificateur existant.",
  ],
  DEV_SEED_DISABLED: [
    "Development account setup is disabled in this environment.",
    "La création de comptes de développement est désactivée dans cet environnement.",
  ],
  DEVELOPMENT_ONLY: [
    "This simulated feature is available only in development.",
    "Cette fonctionnalité simulée est disponible uniquement en développement.",
  ],
  INVALID_ENVIRONMENT: [
    "The application environment is not configured correctly.",
    "L’environnement de l’application est mal configuré.",
  ],
  UNSAFE_ENVIRONMENT: [
    "The environment configuration does not meet security requirements.",
    "La configuration de l’environnement ne respecte pas les exigences de sécurité.",
  ],
  EMAIL_PROVIDER_UNAVAILABLE: [
    "Email delivery is unavailable. Contact the operator.",
    "L’envoi d’e-mails est indisponible. Contactez l’opérateur.",
  ],
  APPROVAL_ACTOR_INELIGIBLE: [
    "An active independent administrator must authorize this action.",
    "Un administrateur actif et indépendant doit autoriser cette action.",
  ],
  SELF_APPROVAL: [
    "A requester or beneficiary cannot provide the independent approval.",
    "Le demandeur ou un bénéficiaire ne peut pas fournir l’approbation indépendante.",
  ],
  APPROVAL_EXPIRED: [
    "This approval request is expired or already reviewed. Create a new request.",
    "Cette demande est expirée ou déjà examinée. Créez une nouvelle demande.",
  ],
  APPROVAL_REQUIRED: [
    "A current independent approval is required before execution.",
    "Une approbation indépendante en cours de validité est requise avant l’exécution.",
  ],
  APPROVAL_PAYLOAD_MISMATCH: [
    "The operation changed after approval. Request a new approval.",
    "L’opération a changé depuis l’approbation. Demandez une nouvelle approbation.",
  ],
  PAYMENT_PROVIDER_UNAVAILABLE: [
    "Live payments are unavailable. No delivery adapter is connected.",
    "Les paiements réels sont indisponibles. Aucun prestataire n’est connecté.",
  ],
  PAYOUT_UNAVAILABLE: [
    "Payout delivery is not connected.",
    "Aucun prestataire de versement n’est connecté.",
  ],
  PAYMENT_AMOUNT_EXCEEDED: [
    "Refunds and chargebacks cannot exceed the original deposit.",
    "Les remboursements et contestations ne peuvent pas dépasser le dépôt initial.",
  ],
  PAYMENT_CORRELATION_FAILED: [
    "The provider record does not match the original payment.",
    "L’enregistrement du prestataire ne correspond pas au paiement initial.",
  ],
  DEMO_PROVENANCE_MISMATCH: [
    "Development evidence cannot be used for live activity.",
    "Une preuve de développement ne peut pas être utilisée pour une activité réelle.",
  ],
  CONVERSION_CORRELATION_FAILED: [
    "The conversion does not match this campaign and activity.",
    "La conversion ne correspond pas à cette campagne et à cette activité.",
  ],
  CONVERSION_TIME_INVALID: [
    "The conversion occurred outside the eligible time window.",
    "La conversion a eu lieu en dehors de la période admissible.",
  ],
  CONVERSION_IDEMPOTENCY_CONFLICT: [
    "This conversion identity was already used with different evidence.",
    "Cet identifiant de conversion a déjà été utilisé avec d’autres preuves.",
  ],
  CONVERSION_TERMINAL: [
    "A rejected or reversed conversion cannot become valid again.",
    "Une conversion rejetée ou annulée ne peut pas redevenir valide.",
  ],
  CONVERSION_NOT_FOUND: [
    "The original conversion must be received before its reversal.",
    "La conversion initiale doit être reçue avant son annulation.",
  ],
  WEBHOOK_PROVIDER_UNKNOWN: [
    "This callback provider is not configured.",
    "Ce prestataire de notification n’est pas configuré.",
  ],
  WEBHOOK_SECRET_REQUIRED: [
    "Callback authentication is not configured. Contact the operator.",
    "L’authentification des notifications n’est pas configurée. Contactez l’opérateur.",
  ],
  INVALID_WEBHOOK_SIGNATURE: [
    "The callback signature could not be authenticated.",
    "La signature de la notification n’a pas pu être authentifiée.",
  ],
  WEBHOOK_TIMESTAMP_EXPIRED: [
    "The callback signature timestamp is outside the permitted window.",
    "L’horodatage de la signature est en dehors du délai autorisé.",
  ],
  INVALID_WEBHOOK_BODY: [
    "The callback body is not valid JSON.",
    "Le contenu de la notification n’est pas un JSON valide.",
  ],
  WEBHOOK_TYPE_UNSUPPORTED: [
    "This provider cannot submit that callback type.",
    "Ce prestataire ne peut pas envoyer ce type de notification.",
  ],
  WEBHOOK_IDEMPOTENCY_CONFLICT: [
    "This callback identifier was already used with different content.",
    "Cet identifiant de notification a déjà été utilisé avec un contenu différent.",
  ],
  WEBHOOK_EVENT_EXPIRED: [
    "The callback event is outside the supported reconciliation window.",
    "La notification est en dehors de la période de rapprochement prise en charge.",
  ],
  WEBHOOK_LEASE_LOST: [
    "Another worker is processing this callback.",
    "Un autre processus traite cette notification.",
  ],
  WEBHOOK_NOT_RETRYABLE: [
    "Only failed callbacks can be retried.",
    "Seules les notifications en échec peuvent être relancées.",
  ],
  WEBHOOK_PROCESSING_FAILED: [
    "Callback processing failed. Review the operator queue.",
    "Le traitement de la notification a échoué. Consultez la file opérateur.",
  ],
  INVALID_WEBHOOK_PAYLOAD: [
    "The callback data does not match the required format.",
    "Les données de la notification ne respectent pas le format requis.",
  ],
  EMAIL_DELIVERY_FAILED: [
    "Email delivery failed and will follow the configured retry policy.",
    "L’envoi de l’e-mail a échoué et suivra la politique de relance configurée.",
  ],
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
