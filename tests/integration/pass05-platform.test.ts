import "dotenv/config";
import { createHash, generateKeyPairSync, randomBytes, sign as cryptoSign } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { atomic, db, jsonValue } from "../../src/server/db";
import { DEVELOPMENT_RULES } from "../../src/server/rules";
import { account, balance, postLedger } from "../../src/server/ledger";
import { register } from "../../src/server/auth";
import { saveProfile } from "../../src/server/profiles";
import {
  createCampaign,
  duplicateCampaign,
  fundCampaign,
  listCampaigns,
  reviewCampaign,
  submitCampaign,
} from "../../src/server/campaigns";
import { reviewActivity, submitActivity } from "../../src/server/activities";
import { requestPayout, reviewPayout } from "../../src/server/payouts";
import { fileActivityDispute, resolveActivityDispute } from "../../src/server/disputes";
import { readEvidenceAttachment, uploadEvidenceAttachment } from "../../src/server/evidence";
import {
  applyUgcBrief,
  respondCampaignInvitation,
  reviewUgcDeliverable,
  searchCreatorDirectory,
  sendCampaignInvitation,
  submitUgcDraft,
} from "../../src/server/directory-ugc";
import { addWorkspaceMember, rotateAdvertiserIntegrationKey } from "../../src/server/integrations";
import { getAdvertiserAnalytics } from "../../src/server/analytics";
import { receiveWebhook, signWebhook } from "../../src/server/webhooks";
import { generateAdvertiserInvoicePdf, generateCreatorStatementPdf } from "../../src/server/pdf";
import {
  beginPasskeyAuthentication,
  beginPasskeyRegistration,
  confirmPasskeyRegistration,
  resolveWebAuthnRp,
  verifyPasskeyAssertion,
} from "../../src/server/security/passkeys";
import { beginMfaEnrollment, confirmMfaEnrollment } from "../../src/server/security/mfa";
import { totpCode } from "../../src/server/security/totp";
import { anonymizeUserAccount, exportUserGdprData } from "../../src/server/gdpr";

const testUrl = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/unsafe");
if (!testUrl.pathname.endsWith("_test"))
  throw new Error("Integration tests require DATABASE_URL to name an isolated *_test database.");

const PASS = "Pass05Integration!2026#Secure";
const VALID_PNG_BASE64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]).toString("base64");
let ipSeq = 10;

async function makeUser(
  prefix: string,
  role: "USER" | "CREATOR" | "ADVERTISER",
  extra: Partial<{
    city: string;
    followers: number;
    verified: boolean;
    admin: boolean;
    category: string;
  }> = {},
) {
  const tag = randomBytes(4).toString("hex");
  const email = `${prefix}_${tag}@pass05.test`;
  const reg = await register(
    { email, password: PASS, displayName: `${prefix} ${tag}`, role, locale: "fr" },
    `198.51.100.${(ipSeq++ % 240) + 10}`,
  );
  let user = await db.user.findUniqueOrThrow({ where: { id: reg.user.id } });
  await saveProfile(user, {
    handle: `${prefix}_${tag}`.slice(0, 24).toLowerCase(),
    displayName: `${prefix} ${tag}`,
    bio: "Pass 05 test profile",
    category: extra.category ?? "Lifestyle",
    locale: "fr",
    country: "FR",
    city: extra.city ?? "Paris",
    preferredLanguages: ["fr", "en"],
    autoMonetize: true,
    directoryOptIn: true,
    billingEntityName: `${prefix} SAS`,
    vatNumber: "FR12345678901",
    ageEligible: true,
    termsAccepted: true,
    roles: role === "ADVERTISER" ? ["ADVERTISER"] : ["CREATOR"],
    socials: [
      {
        platform: "Instagram",
        url: `https://instagram.com/${prefix}_${tag}`,
        followers: extra.followers ?? 450,
      },
    ],
    links: [],
  });
  user = await db.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      ...(extra.verified
        ? {
            audienceStatus: "VERIFIED",
            audienceVerifiedAt: new Date(),
            audienceVerifiedPlatform: "Instagram",
          }
        : {}),
      ...(extra.admin ? { roles: ["USER", "ADMIN"] } : {}),
    },
  });
  if (extra.admin) {
    const enrolled = await beginMfaEnrollment(user, reg.session.token, { password: PASS });
    await confirmMfaEnrollment(user, reg.session.token, {
      enrollmentId: enrolled.enrollmentId,
      code: totpCode(enrolled.secret),
    });
    user = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  }
  return { user, token: reg.session.token };
}

beforeAll(async () => {
  process.env.ALLOW_DEMO_FUNDING = "true";
  await atomic(async (tx) => {
    if (!(await tx.economicRule.findFirst({ where: { active: true } }))) {
      await tx.economicRule.create({
        data: {
          version: DEVELOPMENT_RULES.distribution.version,
          active: true,
          config: jsonValue(DEVELOPMENT_RULES),
        },
      });
    }
  });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("Pass 05 PostgreSQL integration suite", () => {
  it("settles and refunds creator payouts exclusively via balanced 2-phase ledger transfers", async () => {
    const { user: creator } = await makeUser("p5pay", "CREATOR", { verified: true });
    const { user: admin, token: adminToken } = await makeUser("p5adm1", "USER", { admin: true });

    // Credit €12.00 to USER_PAYABLE via balanced clearing entry
    await atomic(async (tx) => {
      await account(tx, "platform:cash-clearing", "CASH_CLEARING");
      await account(tx, `user:${creator.id}`, "USER_PAYABLE", { userId: creator.id });
      await postLedger(tx, {
        key: `p5-seed-payable:${creator.id}`,
        kind: "REVENUE_DISTRIBUTION",
        referenceId: creator.id,
        description: "Test payable credit",
        isDemo: true,
        entries: [
          { accountId: "platform:cash-clearing", amountMinor: -1200n },
          { accountId: `user:${creator.id}`, amountMinor: 1200n },
        ],
      });
    });

    // Request €6.00 -> moves to PAYOUT_PENDING
    const req1 = await requestPayout(creator, {
      amountMinor: 600,
      destinationLabel: "SEPA Personal",
      destinationAccount: "FR7630006000011234567890189",
    });
    expect(req1.state).toBe("REQUESTED");
    expect(await atomic((tx) => balance(tx, `user:${creator.id}`))).toBe(600n);
    expect(await atomic((tx) => balance(tx, `payout:${req1.id}:pending`))).toBe(600n);

    // Reject -> full €6.00 refunded atomically to USER_PAYABLE
    const rejected = await reviewPayout(admin, adminToken, req1.id, {
      decision: "REJECT",
      reason: "Test rejection restoring available ledger balance",
    });
    expect(rejected.state).toBe("REJECTED");
    expect(await atomic((tx) => balance(tx, `user:${creator.id}`))).toBe(1200n);
    expect(await atomic((tx) => balance(tx, `payout:${req1.id}:pending`))).toBe(0n);

    // Request €5.00 -> settle -> moves from PAYOUT_PENDING to PAYOUT_SETTLED
    const req2 = await requestPayout(creator, {
      amountMinor: 500,
      destinationLabel: "SEPA Personal",
      destinationAccount: "FR7630006000011234567890189",
    });
    const settledBefore = await atomic((tx) => balance(tx, "payout:settled"));
    const paid = await reviewPayout(admin, adminToken, req2.id, {
      decision: "SETTLE",
      reason: "Settled test payout transfer",
    });
    expect(paid.state).toBe("PAID");
    expect(await atomic((tx) => balance(tx, `user:${creator.id}`))).toBe(700n);
    expect(await atomic((tx) => balance(tx, `payout:${req2.id}:pending`))).toBe(0n);
    expect(await atomic((tx) => balance(tx, "payout:settled"))).toBe(settledBefore + 500n);

    // Creator PDF statement renders valid PDF 1.4
    const period = new Date().toISOString().slice(0, 7);
    const statement = await generateCreatorStatementPdf(creator, period);
    expect(statement.buffer.toString("utf8").startsWith("%PDF-1.4")).toBe(true);
  });

  it("enforces Four-Eyes independent appeal review and verified visual evidence upload", async () => {
    const { user: adv } = await makeUser("p5advd", "ADVERTISER");
    const { user: creator } = await makeUser("p5cred", "CREATOR");
    const { user: admin1, token: token1 } = await makeUser("p5a1", "USER", { admin: true });
    const { user: admin2, token: token2 } = await makeUser("p5a2", "USER", { admin: true });

    const { campaign } = await createCampaign(adv, {
      name: "Pass05 Dispute Test Campaign",
      objective: "CLICK",
      destinationUrl: "https://example.com/p5-dispute",
      budgetMinor: "5000",
      dailyBudgetMinor: "2000",
      unitCostMinor: "100",
      startAt: new Date(Date.now() - 60_000).toISOString(),
      endAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
      maxActivitiesPerCreator: 2,
    });
    await fundCampaign(adv, campaign.id, {
      amountMinor: "5000",
      idempotencyKey: `fund-p5-${campaign.id}`,
      source: "DEVELOPMENT",
    });
    await submitCampaign(adv, campaign.id);
    await reviewCampaign(admin1, campaign.id, {
      decision: "APPROVE",
      reason: "Approved for dispute test",
    });

    const { activity } = await submitActivity(creator, {
      campaignId: campaign.id,
      type: "CLICK",
      idempotencyKey: `act-p5-${randomBytes(4).toString("hex")}`,
      evidence: "Initial proof note",
    });

    await reviewActivity(admin1, activity.id, {
      decision: "REJECT",
      reason: "Insufficient context in initial pass",
    });

    const attachment = await uploadEvidenceAttachment(creator, {
      filename: "proof.png",
      mimeType: "image/png",
      dataBase64: VALID_PNG_BASE64,
      activityId: activity.id,
    });
    const loaded = await readEvidenceAttachment(admin2, attachment.id);
    expect(loaded.record.mimeType).toBe("image/png");

    const dispute = await fileActivityDispute(creator, activity.id, {
      reason: "Attached full timestamped screenshot showing verified delivery",
      attachmentId: attachment.id,
    });

    // Same admin who rejected CANNOT resolve the appeal
    await expect(
      resolveActivityDispute(admin1, token1, dispute.id, {
        decision: "OVERTURN_AND_REOPEN",
        resolutionNote: "Self review attempt",
      }),
    ).rejects.toMatchObject({ code: "FOUR_EYES_REQUIRED" });

    // Independent second admin overturns -> creates linked compensating PENDING_VALIDATION activity
    const resolved = await resolveActivityDispute(admin2, token2, dispute.id, {
      decision: "OVERTURN_AND_REOPEN",
      resolutionNote: "Second independent admin reviewed attachment and reopened",
    });
    expect(resolved.state).toBe("OVERTURNED");
    expect(resolved.reopenedActivityId).toBeTruthy();

    const originalAfter = await db.activity.findUniqueOrThrow({ where: { id: activity.id } });
    const reopenedAfter = await db.activity.findUniqueOrThrow({
      where: { id: resolved.reopenedActivityId! },
    });
    expect(originalAfter.state).toBe("REJECTED");
    expect(reopenedAfter.state).toBe("PENDING_VALIDATION");
    expect(reopenedAfter.disputeOriginActivityId).toBe(activity.id);
  });

  it("enforces agency WorkspaceMember RBAC, campaign duplication, and per-advertiser webhook key rotation grace window", async () => {
    const { user: brand } = await makeUser("p5brnd", "ADVERTISER");
    const { user: manager } = await makeUser("p5mgr", "CREATOR");
    const { user: viewer } = await makeUser("p5view", "CREATOR");

    await addWorkspaceMember(brand, { email: manager.email, role: "CAMPAIGN_MANAGER" });
    await addWorkspaceMember(brand, { email: viewer.email, role: "VIEWER" });

    // VIEWER can read analytics & campaigns, but is denied creating campaigns
    const viewerAnalytics = await getAdvertiserAnalytics(viewer, brand.id);
    expect(viewerAnalytics.campaigns).toEqual([]);
    await expect(
      createCampaign(
        viewer,
        {
          name: "Unauthorized Viewer Camp",
          objective: "CLICK",
          destinationUrl: "https://example.com/deny",
          budgetMinor: "1000",
          dailyBudgetMinor: "1000",
          unitCostMinor: "100",
          startAt: new Date(Date.now() - 60_000).toISOString(),
          endAt: new Date(Date.now() + 86400_000).toISOString(),
        },
        brand.id,
      ),
    ).rejects.toMatchObject({ code: "WORKSPACE_PERMISSION_DENIED" });

    // CAMPAIGN_MANAGER can create & duplicate on behalf of brand
    const { campaign } = await createCampaign(
      manager,
      {
        name: "Agency Managed Campaign",
        objective: "CONVERSION",
        destinationUrl: "https://example.com/agency",
        budgetMinor: "2000",
        dailyBudgetMinor: "1000",
        unitCostMinor: "100",
        startAt: new Date(Date.now() - 60_000).toISOString(),
        endAt: new Date(Date.now() + 5 * 86400_000).toISOString(),
      },
      brand.id,
    );
    expect(campaign.advertiserId).toBe(brand.id);

    const { campaign: duplicated } = await duplicateCampaign(manager, campaign.id, brand.id);
    expect(duplicated.advertiserId).toBe(brand.id);
    expect(duplicated.state).toBe("DRAFT");
    expect(duplicated.name).toContain("(Copy)");

    const listed = await listCampaigns(viewer, { workspaceId: brand.id, limit: 10 });
    expect(listed.campaigns.length).toBeGreaterThanOrEqual(2);

    // Per-advertiser webhook key rotation + 24h grace window verification
    const rot1 = await rotateAdvertiserIntegrationKey(brand);
    const rot2 = await rotateAdvertiserIntegrationKey(brand);
    expect(rot2.graceWindowUntil).toBeTruthy();

    const makeBody = (id: string) =>
      Buffer.from(
        JSON.stringify({
          id,
          type: "conversion.verified",
          occurredAt: new Date().toISOString(),
          data: {
            campaignId: campaign.id,
            activityId: "act-placeholder",
            externalConversionId: id,
          },
        }),
        "utf8",
      );

    // Both NEW key (rot2) and PREVIOUS grace key (rot1) authenticate conversion webhook for brand!
    const bodyNew = makeBody(`evt-new-${randomBytes(4).toString("hex")}`);
    const sigNew = signWebhook("development-conversion", bodyNew, rot2.signingKey);
    const recNew = await receiveWebhook("development-conversion", bodyNew, sigNew, brand.id);
    expect(recNew.eventId).toBeTruthy();

    const bodyGrace = makeBody(`evt-grace-${randomBytes(4).toString("hex")}`);
    const sigGrace = signWebhook("development-conversion", bodyGrace, rot1.signingKey);
    const recGrace = await receiveWebhook("development-conversion", bodyGrace, sigGrace, brand.id);
    expect(recGrace.eventId).toBeTruthy();

    // Invoice PDF
    const invoice = await generateAdvertiserInvoicePdf(brand, new Date().toISOString().slice(0, 7));
    expect(invoice.buffer.toString("utf8").startsWith("%PDF-1.4")).toBe(true);
  });

  it("runs opt-in directory, direct invitations, UGC workflow, WebAuthn ES256 passkey replay guard, and GDPR export/anonymization", async () => {
    const { user: brand } = await makeUser("p5dirb", "ADVERTISER");
    const { user: creator } = await makeUser("p5dirc", "CREATOR", {
      city: "Lyon",
      followers: 320,
      verified: true,
    });
    const { user: admin } = await makeUser("p5dira", "USER", { admin: true });

    const { campaign } = await createCampaign(brand, {
      name: "Lyon Micro-Creators UGC",
      objective: "QUALIFIED_VIEW",
      deliveryMode: "UGC_BRIEF",
      destinationUrl: "https://example.com/lyon",
      budgetMinor: "3000",
      dailyBudgetMinor: "1500",
      unitCostMinor: "100",
      startAt: new Date(Date.now() - 60_000).toISOString(),
      endAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    });
    await fundCampaign(brand, campaign.id, {
      amountMinor: "3000",
      idempotencyKey: `fund-ugc-${campaign.id}`,
      source: "DEVELOPMENT",
    });
    await submitCampaign(brand, campaign.id);
    await reviewCampaign(admin, campaign.id, { decision: "APPROVE", reason: "Approved UGC brief" });

    // Opt-in directory search finds creator in Lyon
    const dir = await searchCreatorDirectory(brand, {
      city: "Lyon",
      maxFollowers: 1000,
      verifiedOnly: true,
    });
    expect(dir.items.some((c) => c.id === creator.id)).toBe(true);

    // Direct invitation + acceptance
    const inv = await sendCampaignInvitation(brand, campaign.id, {
      creatorId: creator.id,
      message: "Loved your Lyon Reels!",
    });
    const acceptedInv = await respondCampaignInvitation(creator, inv.id, { decision: "ACCEPTED" });
    expect(acceptedInv.state).toBe("ACCEPTED");

    // Structured UGC workflow: apply -> approve -> submit draft -> accept
    const deliv = await applyUgcBrief(creator, campaign.id, {
      pitch: "20s vertical Reel in downtown Lyon",
    });
    expect(deliv.state).toBe("APPLIED");
    const approved = await reviewUgcDeliverable(brand, deliv.id, { action: "APPROVE_TO_CREATE" });
    expect(approved.state).toBe("APPROVED_TO_CREATE");
    const drafted = await submitUgcDraft(creator, deliv.id, {
      draftUrl: "https://example.com/draft-reel",
    });
    expect(drafted.state).toBe("DRAFT_SUBMITTED");
    const accepted = await reviewUgcDeliverable(brand, deliv.id, {
      action: "ACCEPT",
      feedback: "Great cut!",
    });
    expect(accepted.state).toBe("ACCEPTED");

    // Cryptographic WebAuthn ES256 Passkey Registration + Assertion + Replay Protection
    const rp = resolveWebAuthnRp();
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const spkiDer = publicKey.export({ format: "der", type: "spki" }) as Buffer;
    const regOpts = await beginPasskeyRegistration(creator);
    const credId = randomBytes(16).toString("base64url");
    const regClientData = Buffer.from(
      JSON.stringify({ type: "webauthn.create", challenge: regOpts.challenge, origin: rp.origin }),
      "utf8",
    ).toString("base64url");
    const regResult = await confirmPasskeyRegistration(creator, {
      challenge: regOpts.challenge,
      credentialId: credId,
      publicKeySpki: spkiDer.toString("base64url"),
      algorithm: -7,
      label: "Test YubiKey",
      clientDataJSON: regClientData,
    });
    expect(regResult.label).toBe("Test YubiKey");

    const buildSignedAssertion = (challenge: string, signCount: number) => {
      const clientDataRaw = Buffer.from(
        JSON.stringify({ type: "webauthn.get", challenge, origin: rp.origin }),
        "utf8",
      );
      const rpIdHash = createHash("sha256").update(rp.rpId).digest();
      const flags = Buffer.from([0x05]); // UP + UV
      const counter = Buffer.alloc(4);
      counter.writeUInt32BE(signCount, 0);
      const authData = Buffer.concat([rpIdHash, flags, counter]);
      const payload = Buffer.concat([
        authData,
        createHash("sha256").update(clientDataRaw).digest(),
      ]);
      const sig = cryptoSign("sha256", payload, privateKey);
      return {
        challenge,
        credentialId: credId,
        clientDataJSON: clientDataRaw.toString("base64url"),
        authenticatorData: authData.toString("base64url"),
        signature: sig.toString("base64url"),
      };
    };

    const auth1 = await beginPasskeyAuthentication(creator);
    const verified1 = await verifyPasskeyAssertion(buildSignedAssertion(auth1.challenge, 1), {
      expectedUserId: creator.id,
    });
    expect(verified1.user.id).toBe(creator.id);

    // Replay with non-advancing signCount=1 MUST be rejected
    const auth2 = await beginPasskeyAuthentication(creator);
    await expect(
      verifyPasskeyAssertion(buildSignedAssertion(auth2.challenge, 1), {
        expectedUserId: creator.id,
      }),
    ).rejects.toMatchObject({ code: "PASSKEY_REPLAY_DETECTED" });

    // GDPR Export & Ledger-Preserving Anonymization
    const exported = (await exportUserGdprData(creator)) as Record<string, unknown>;
    expect(exported.schemaVersion).toBe("ruvora-gdpr-v1");
    expect(JSON.stringify(exported)).not.toContain("passwordHash");

    const anon = await anonymizeUserAccount(creator, undefined, {
      password: PASS,
      confirmation: "ANONYMIZE_MY_ACCOUNT",
    });
    expect(anon.anonymized).toBe(true);
    const wiped = await db.user.findUniqueOrThrow({ where: { id: creator.id } });
    expect(wiped.displayName).toBe("Deleted User");
    expect(wiped.handle).toBeNull();
    expect(wiped.anonymizedAt).not.toBeNull();
    expect(wiped.suspended).toBe(true);
  });
});
