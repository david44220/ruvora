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
