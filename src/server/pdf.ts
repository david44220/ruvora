import type { User } from "@prisma/client";
import { db } from "./db";
import { assert } from "./errors";
import { isDevelopment } from "./environment";
import { resolveAdvertiserWorkspace } from "./workspaces";

/**
 * Pure zero-dependency PDF 1.4 document generator (Type1 Helvetica / Helvetica-Bold).
 * Produces compact, spec-compliant, printable invoices and creator statements
 * without adding external PDF/browser supply-chain dependencies.
 */
function pdfEscape(text: string): string {
  // Normalize accented Latin characters cleanly to WinAnsi-safe ASCII/Latin-1 bytes
  const clean = text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/€/g, "EUR")
    .replace(/—|–/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
  return clean.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export type PdfLine = {
  text: string;
  size?: number;
  bold?: boolean;
  gapBefore?: number;
};

export function buildPdfDocument(title: string, lines: PdfLine[]): Buffer {
  const ops: string[] = [];
  let y = 790;
  const pageWidth = 595;
  const left = 48;

  // Header band
  ops.push("0.043 0.039 0.035 rg");
  ops.push(`0 755 ${pageWidth} 87 re f`);
  ops.push("0.929 0.741 0.537 rg");
  ops.push(`BT /F2 20 Tf ${left} 800 Td (${pdfEscape("RUVORA")}) Tj ET`);
  ops.push("0.957 0.941 0.910 rg");
  ops.push(`BT /F1 11 Tf ${left} 778 Td (${pdfEscape(title)}) Tj ET`);

  y = 725;
  ops.push("0.10 0.10 0.10 rg");

  for (const line of lines) {
    const size = line.size ?? 10;
    y -= line.gapBefore ?? 0;
    if (y < 60) break;
    const font = line.bold ? "/F2" : "/F1";
    ops.push(`BT ${font} ${size} Tf ${left} ${y} Td (${pdfEscape(line.text)}) Tj ET`);
    y -= size + 6;
  }

  // Footer divider
  ops.push("0.82 0.78 0.72 RG 0.5 w 48 48 m 547 48 l S");
  ops.push("0.42 0.40 0.38 rg");
  ops.push(
    `BT /F1 8 Tf ${left} 34 Td (${pdfEscape("Ruvora Platform - Append-only EUR subledger statement - Generated " + new Date().toISOString())}) Tj ET`,
  );

  const streamContent = ops.join("\n");
  const objects: string[] = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj",
    `6 0 obj << /Length ${Buffer.byteLength(streamContent, "utf8")} >> stream\n${streamContent}\nendstream endobj`,
  ];

  const chunks: string[] = ["%PDF-1.4\n"];
  const offsets: number[] = [0];
  let byteLen = Buffer.byteLength(chunks[0]!, "utf8");
  for (const obj of objects) {
    offsets.push(byteLen);
    const entry = `${obj}\n`;
    chunks.push(entry);
    byteLen += Buffer.byteLength(entry, "utf8");
  }
  const xrefStart = byteLen;
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i < offsets.length; i++) {
    chunks.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(
    `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`,
  );

  return Buffer.from(chunks.join(""), "utf8");
}

function parsePeriodRange(period: string): { start: Date; end: Date; label: string } {
  assert(
    /^\d{4}-(0[1-9]|1[0-2])$/.test(period),
    "INVALID_PERIOD",
    "Period must follow YYYY-MM format.",
    400,
  );
  const [y, m] = period.split("-").map(Number) as [number, number];
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  return { start, end, label: period };
}

function formatMinorEur(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const euros = abs / 100n;
  const cents = String(abs % 100n).padStart(2, "0");
  return `${neg ? "-" : ""}${euros}.${cents} EUR`;
}

export async function generateAdvertiserInvoicePdf(
  user: User,
  period: string,
  workspaceId?: string,
) {
  const ctx = await resolveAdvertiserWorkspace(user, workspaceId, "BILLING");
  const { start, end, label } = parsePeriodRange(period);
  const owner = await db.user.findUniqueOrThrow({
    where: { id: ctx.ownerId },
    select: {
      id: true,
      displayName: true,
      email: true,
      billingEntityName: true,
      vatNumber: true,
      country: true,
    },
  });

  const campaigns = await db.campaign.findMany({
    where: { advertiserId: owner.id },
    select: { id: true, name: true },
  });
  const campaignIds = campaigns.map((c) => c.id);

  const [deposits, validatedActivities] = await Promise.all([
    db.paymentOperation.findMany({
      where: {
        userId: owner.id,
        kind: "ADVERTISER_DEPOSIT",
        state: "SETTLED",
        createdAt: { gte: start, lt: end },
      },
      orderBy: { createdAt: "asc" },
    }),
    campaignIds.length
      ? db.activity.findMany({
          where: {
            campaignId: { in: campaignIds },
            state: "VALIDATED",
            validatedAt: { gte: start, lt: end },
          },
          include: { campaign: { select: { name: true } } },
          orderBy: { validatedAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const totalDeposits = deposits.reduce((sum, d) => sum + d.amountMinor, 0n);
  const totalValidatedSpend = validatedActivities.reduce((sum, a) => sum + a.billableMinor, 0n);
  const invoiceNumber = `RUV-ADV-${label.replace("-", "")}-${owner.id.slice(-6).toUpperCase()}`;

  const lines: PdfLine[] = [];
  if (isDevelopment()) {
    lines.push({
      text: "DEVELOPMENT SIMULATION - NOT A STATUTORY TAX INVOICE",
      size: 11,
      bold: true,
    });
  }
  lines.push(
    { text: `Statement / Invoice Number: ${invoiceNumber}`, size: 12, bold: true, gapBefore: 8 },
    {
      text: `Billing Period: ${label} (${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)})`,
    },
    { text: `Advertiser Entity: ${owner.billingEntityName || owner.displayName}` },
    { text: `Contact Email: ${owner.email}${owner.country ? ` | Country: ${owner.country}` : ""}` },
    { text: `VAT / SIRET: ${owner.vatNumber || "Not provided"}` },
    { text: "Summary (Exact EUR Subledger)", size: 12, bold: true, gapBefore: 12 },
    {
      text: `Settled Deposits in Period: ${formatMinorEur(totalDeposits)} (${deposits.length} operation(s))`,
    },
    {
      text: `Validated Campaign Spend:   ${formatMinorEur(totalValidatedSpend)} (${validatedActivities.length} action(s))`,
    },
    { text: "Campaign Spend Breakdown", size: 11, bold: true, gapBefore: 10 },
  );

  const byCampaign = new Map<string, { name: string; count: number; minor: bigint }>();
  for (const act of validatedActivities) {
    const row = byCampaign.get(act.campaignId) ?? { name: act.campaign.name, count: 0, minor: 0n };
    row.count += 1;
    row.minor += act.billableMinor;
    byCampaign.set(act.campaignId, row);
  }
  if (byCampaign.size === 0) {
    lines.push({ text: "No validated billable deliveries recorded during this period." });
  } else {
    for (const row of byCampaign.values()) {
      lines.push({
        text: `- ${row.name.slice(0, 48)}: ${row.count} validated action(s) = ${formatMinorEur(row.minor)}`,
      });
    }
  }

  return {
    filename: `${invoiceNumber}.pdf`,
    buffer: buildPdfDocument(`Advertiser Billing Statement ${label}`, lines),
  };
}

export async function generateCreatorStatementPdf(user: User, period: string) {
  const { start, end, label } = parsePeriodRange(period);
  const accountId = `user:${user.id}`;
  const entries = await db.ledgerEntry.findMany({
    where: {
      accountId,
      transaction: { createdAt: { gte: start, lt: end } },
    },
    include: { transaction: true },
    orderBy: { transaction: { createdAt: "asc" } },
    take: 40,
  });

  const credits = entries.filter((e) => e.amountMinor > 0n).reduce((s, e) => s + e.amountMinor, 0n);
  const debits = entries.filter((e) => e.amountMinor < 0n).reduce((s, e) => s + -e.amountMinor, 0n);
  const net = credits - debits;
  const statementId = `RUV-CRE-${label.replace("-", "")}-${user.id.slice(-6).toUpperCase()}`;

  const lines: PdfLine[] = [];
  if (isDevelopment()) {
    lines.push({
      text: "DEVELOPMENT SIMULATION - NOT AN OFFICIAL TAX CERTIFICATE",
      size: 11,
      bold: true,
    });
  }
  lines.push(
    { text: `Creator Earnings Statement: ${statementId}`, size: 12, bold: true, gapBefore: 8 },
    {
      text: `Period: ${label} (${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)})`,
    },
    {
      text: `Account Holder: ${user.billingEntityName || user.displayName}${user.handle ? ` (@${user.handle})` : ""}`,
    },
    { text: `Tax / VAT ID: ${user.vatNumber || "Not provided"}` },
    { text: "Ledger Totals (Exact EUR Minor Units)", size: 12, bold: true, gapBefore: 12 },
    { text: `Distributions & Prize Credits: +${formatMinorEur(credits)}` },
    { text: `Payout Reservations / Debits:  -${formatMinorEur(debits)}` },
    { text: `Net Movement in Period:        ${formatMinorEur(net)}`, bold: true },
    { text: "Ledger Journal Entries", size: 11, bold: true, gapBefore: 10 },
  );

  if (entries.length === 0) {
    lines.push({ text: "No monetary ledger entries posted during this period." });
  } else {
    for (const entry of entries.slice(0, 28)) {
      lines.push({
        text: `${entry.transaction.createdAt.toISOString().slice(0, 10)} | ${entry.transaction.kind} | ${formatMinorEur(entry.amountMinor)}`,
        size: 9,
      });
    }
  }

  return {
    filename: `${statementId}.pdf`,
    buffer: buildPdfDocument(`Creator Earnings Statement ${label}`, lines),
  };
}

export async function generateCreatorMediaKitPdf(handle: string) {
  const normalized = handle.trim().toLowerCase().replace(/^@/, "");
  assert(
    /^[a-z0-9_]{3,24}$/.test(normalized),
    "PROFILE_NOT_FOUND",
    "This creator profile is not available.",
    404,
  );
  const user = await db.user.findUnique({
    where: { handle: normalized },
    select: {
      id: true,
      displayName: true,
      handle: true,
      bio: true,
      category: true,
      city: true,
      country: true,
      followers: true,
      audienceStatus: true,
      audienceVerifiedPlatform: true,
      audienceVerifiedAt: true,
      socialLinks: true,
      isDemo: true,
      suspended: true,
      economicHold: true,
      createdAt: true,
    },
  });
  assert(
    user && !user.suspended && !user.economicHold && (isDevelopment() || !user.isDemo),
    "PROFILE_NOT_FOUND",
    "This creator profile is not available.",
    404,
  );

  const [validatedActions, attributedSessions, showcaseItems, activityXp, questXp] =
    await Promise.all([
      db.activity.count({ where: { creatorId: user.id, state: "VALIDATED" } }),
      db.growthEvent.count({ where: { creatorId: user.id, type: "ATTRIBUTED_SESSION" } }),
      db.creatorShowcaseItem.findMany({
        where: {
          creatorId: user.id,
          pinned: true,
          campaign: { state: "ACTIVE", ...(isDevelopment() ? {} : { isDemo: false }) },
        },
        include: { campaign: { select: { name: true, objective: true } } },
        orderBy: [{ sortOrder: "asc" }],
        take: 6,
      }),
      db.xpEntry.aggregate({ where: { userId: user.id }, _sum: { amount: true } }),
      db.questClaim.aggregate({ where: { userId: user.id }, _sum: { xpAwarded: true } }),
    ]);

  const rejectedActions = await db.activity.count({
    where: { creatorId: user.id, state: "REJECTED" },
  });
  const totalReviewed = validatedActions + rejectedActions;
  const reliabilityScore =
    totalReviewed === 0
      ? 75
      : Math.max(0, Math.min(100, Math.round((validatedActions / totalReviewed) * 100)));
  const trustTier =
    validatedActions >= 20 && reliabilityScore >= 90
      ? "AMBASSADOR"
      : validatedActions >= 3 && reliabilityScore >= 75
        ? "TRUSTED"
        : "EXPLORER";

  const totalXp = (activityXp._sum.amount ?? 0) + (questXp._sum.xpAwarded ?? 0);
  const level = Math.floor(Math.sqrt(Math.max(0, totalXp) / 100)) + 1;
  const siteBase = (
    process.env.PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    "https://ruvora.com"
  ).replace(/\/+$/, "");
  const profileUrl = `${siteBase}/@${user.handle}`;

  const socials = Array.isArray(user.socialLinks)
    ? (user.socialLinks as { platform?: string; followers?: number; url?: string }[]).filter(
        (s) => s && typeof s.platform === "string",
      )
    : [];

  const lines: PdfLine[] = [];
  if (isDevelopment() || user.isDemo) {
    lines.push({
      text: "DEVELOPMENT PROFILE - DEMONSTRATION MEDIA KIT",
      size: 11,
      bold: true,
    });
  }
  lines.push(
    { text: `${user.displayName} (@${user.handle})`, size: 15, bold: true, gapBefore: 6 },
    {
      text: `Category: ${user.category} | Location: ${[user.city, user.country].filter(Boolean).join(", ") || "Global"}`,
      size: 10,
    },
    { text: `Public Ruvora Link: ${profileUrl}`, size: 10, bold: true },
  );
  if (user.bio) {
    lines.push({ text: `Bio: ${user.bio.slice(0, 140)}`, size: 9, gapBefore: 4 });
  }

  lines.push(
    { text: "Audience & Trust Credentials", size: 12, bold: true, gapBefore: 12 },
    {
      text: `Declared / Verified Reach: ${user.followers.toLocaleString("en-US")} followers (${user.audienceStatus === "VERIFIED" ? `VERIFIED via ${user.audienceVerifiedPlatform || "bio challenge"}` : "SELF-DECLARED"})`,
    },
    {
      text: `Ruvora Trust Tier: ${trustTier} | Reliability Score: ${reliabilityScore}/100 | Level ${level} (${totalXp} XP)`,
    },
    {
      text: `Verified Platform Activity: ${attributedSessions} attributed session(s) | ${validatedActions} independently validated action(s)`,
    },
    { text: "Connected Social Channels", size: 12, bold: true, gapBefore: 12 },
  );

  if (socials.length === 0) {
    lines.push({ text: "No public social links listed yet." });
  } else {
    for (const s of socials.slice(0, 8)) {
      lines.push({
        text: `- ${s.platform}: ${(s.followers ?? 0).toLocaleString("en-US")} followers (${(s.url ?? "").slice(0, 62)})`,
        size: 9,
      });
    }
  }

  lines.push({ text: "Active Curated Showcase Collections", size: 12, bold: true, gapBefore: 12 });
  if (showcaseItems.length === 0) {
    lines.push({ text: "No active campaigns currently pinned on public showcase." });
  } else {
    for (const item of showcaseItems) {
      lines.push({
        text: `- [${item.collectionName}] ${item.campaign.name.slice(0, 46)} (${item.campaign.objective})`,
        size: 9,
      });
    }
  }

  lines.push(
    { text: "Partnership & Compliance Note", size: 11, bold: true, gapBefore: 14 },
    {
      text: "All Ruvora creator collaborations use transparent partner disclosures (#ad / #collaboration),",
      size: 9,
    },
    {
      text: "server-issued attribution links (/go/[slug]), and independent validation. No guaranteed ROI or earnings.",
      size: 9,
    },
  );

  return {
    filename: `ruvora-mediakit-${user.handle}.pdf`,
    buffer: buildPdfDocument(`Creator Media Kit - @${user.handle}`, lines),
  };
}
