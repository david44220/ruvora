import type { User } from "@prisma/client";
import { db } from "./db";
import { getAdvertiserAnalytics } from "./analytics";

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Neutralizes spreadsheet formula injection (CSV / Excel DDE) and encodes per RFC 4180. */
export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}

export function buildCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

function minorToDecimal(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const whole = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${whole.toString()}.${cents}`;
}

export async function exportAdvertiserAnalyticsCsv(user: User): Promise<string> {
  const data = await getAdvertiserAnalytics(user);
  const headers = [
    "campaign_id",
    "campaign_name",
    "validated_actions",
    "rejected_actions",
    "spend_eur",
    "unique_creators",
    "ecpc_eur",
    "demo",
  ];
  const rows = data.campaigns.map((c) => {
    const ecpcMinor = c.validatedActions > 0 ? c.spendMinor / BigInt(c.validatedActions) : 0n;
    return [
      c.id,
      c.name,
      c.validatedActions,
      c.rejectedActions,
      minorToDecimal(c.spendMinor),
      c.creatorCount,
      minorToDecimal(ecpcMinor),
      data.isDemo ? "true" : "false",
    ];
  });
  return buildCsv(headers, rows);
}

export async function exportWalletCsv(user: User): Promise<string> {
  const entries = await db.ledgerEntry.findMany({
    where: { accountId: `user:${user.id}` },
    include: { transaction: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const headers = [
    "entry_id",
    "date_utc",
    "transaction_id",
    "kind",
    "description",
    "amount_eur",
    "currency",
    "demo",
  ];
  const rows = entries.map((entry) => [
    entry.id,
    entry.createdAt.toISOString(),
    entry.transaction.id,
    entry.transaction.kind,
    entry.transaction.description,
    minorToDecimal(entry.amountMinor),
    "EUR",
    entry.transaction.isDemo ? "true" : "false",
  ]);
  return buildCsv(headers, rows);
}
