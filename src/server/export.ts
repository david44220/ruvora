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

export async function exportAdvertiserAnalyticsCsv(
  user: User,
  workspaceId?: string,
): Promise<string> {
  const data = await getAdvertiserAnalytics(user, workspaceId);
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

const WALLET_CSV_HEADERS = [
  "entry_id",
  "date_utc",
  "transaction_id",
  "kind",
  "description",
  "amount_eur",
  "currency",
  "demo",
] as const;

/**
 * Cursor-batched streaming wallet CSV export — no 500-row cap, constant memory usage.
 */
export function streamWalletCsv(user: User, batchSize = 250): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const accountId = `user:${user.id}`;
  let cursor: string | undefined;
  let sentHeader = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!sentHeader) {
        sentHeader = true;
        controller.enqueue(encoder.encode(WALLET_CSV_HEADERS.map(csvCell).join(",") + "\r\n"));
      }
      const entries = await db.ledgerEntry.findMany({
        where: { accountId },
        include: { transaction: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (entries.length === 0) {
        controller.close();
        return;
      }
      const chunk =
        entries
          .map((entry) =>
            [
              entry.id,
              entry.createdAt.toISOString(),
              entry.transaction.id,
              entry.transaction.kind,
              entry.transaction.description,
              minorToDecimal(entry.amountMinor),
              "EUR",
              entry.transaction.isDemo ? "true" : "false",
            ]
              .map(csvCell)
              .join(","),
          )
          .join("\r\n") + "\r\n";
      controller.enqueue(encoder.encode(chunk));
      cursor = entries[entries.length - 1]!.id;
      if (entries.length < batchSize) {
        controller.close();
      }
    },
  });
}

export async function exportWalletCsv(user: User): Promise<string> {
  const stream = streamWalletCsv(user, 500);
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }
  output += decoder.decode();
  return output;
}
