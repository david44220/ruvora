/** Local, non-destructive clean/upgrade migration proof. Creates fresh retained databases only.
 * Usage: node scripts/verify-migrations.mjs
 * Optional MIGRATION_VERIFY_URL supplies the local PostgreSQL credentials; no existing DB is modified.
 */
import "dotenv/config";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const quote = (value) => {
  assert(/^[A-Za-z_][A-Za-z0-9_]*$/.test(value), "Unsafe SQL identifier");
  return '"' + value + '"';
};
if (process.argv.includes("--help")) {
  console.log(
    "Create two unique loopback-only PostgreSQL audit databases; deploy all migrations cleanly and compare exact Pass 01 financial row digests across the forward upgrade. No drop/reset and no pre-existing database writes. Audit databases and .local report are retained.",
  );
  process.exit(0);
}
const source = new URL(
  process.env.MIGRATION_VERIFY_URL ?? process.env.DATABASE_URL ?? "postgresql://invalid",
);
assert(
  ["postgres:", "postgresql:"].includes(source.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(source.hostname) &&
    source.port === "54329",
  "Migration verification requires explicit loopback PostgreSQL credentials on the audit-only local port 54329.",
);
const suffix =
  new Date().toISOString().replace(/\D/g, "").slice(0, 14) + "_" + randomBytes(3).toString("hex");
const names = {
  clean: "ruvora_pass02_clean_" + suffix,
  upgrade: "ruvora_pass02_upgrade_" + suffix,
};
const stage = path.join(root, ".local", "migration-audit-" + suffix);
await mkdir(stage, { recursive: true });
const migrationRoot = path.join(root, "prisma", "migrations");
const migrations = (await readdir(migrationRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const baseline = ["202609130001_initial", "202609130002_integrity", "202609130003_activity_guard"];
assert(
  baseline.every((name, i) => migrations[i] === name),
  "The known Pass 01 migration prefix changed.",
);
const checksums = Object.fromEntries(
  await Promise.all(
    migrations.map(async (name) => [
      name,
      digest(await readFile(path.join(migrationRoot, name, "migration.sql"))),
    ]),
  ),
);
const connection = (name) => {
  const value = new URL(source);
  value.pathname = "/" + name;
  return value.toString();
};
const admin = new Client({ connectionString: connection("postgres") });
await admin.connect();
try {
  for (const name of Object.values(names)) {
    assert(
      /^ruvora_pass02_(clean|upgrade)_\d{14}_[a-f0-9]{6}$/.test(name),
      "Invalid audit database target",
    );
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [name]);
    assert(exists.rowCount === 0, "Refusing to reuse an existing audit database");
    await admin.query("CREATE DATABASE " + quote(name));
  }
} finally {
  await admin.end();
}
const deploy = async (name, config = path.join(root, "prisma.config.ts")) => {
  const result = await exec(
    process.execPath,
    [
      path.join(root, "node_modules/prisma/build/index.js"),
      "migrate",
      "deploy",
      "--config",
      config,
    ],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: connection(name) },
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    },
  );
  return {
    success: true,
    noPending: /No pending migrations/.test(result.stdout),
    outputDigest: digest(result.stdout),
  };
};
const open = async (name) => {
  const client = new Client({ connectionString: connection(name) });
  await client.connect();
  return client;
};
const migrationProof = async (client) => {
  const rows = (
    await client.query(
      'SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name',
    )
  ).rows;
  for (const row of rows)
    assert(
      row.finished_at && !row.rolled_back_at && row.checksum === checksums[row.migration_name],
      "Migration history/checksum mismatch: " + row.migration_name,
    );
  return rows.map((row) => ({ name: row.migration_name, checksum: row.checksum, finished: true }));
};
const historyTables = [
  "User",
  "EconomicRule",
  "Event",
  "EventMembership",
  "Campaign",
  "Activity",
  "RewardUnit",
  "XpEntry",
  "EventPoint",
  "LedgerAccount",
  "LedgerTransaction",
  "LedgerEntry",
  "Distribution",
  "Referral",
  "RiskEvent",
  "AuditLog",
];
const captureColumns = async (client) => {
  const rows = (
    await client.query(
      "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position",
      [historyTables],
    )
  ).rows;
  return Object.fromEntries(
    historyTables.map((table) => [
      table,
      rows.filter((row) => row.table_name === table).map((row) => row.column_name),
    ]),
  );
};
const captureHistory = async (client, columns) => {
  const tables = [];
  for (const table of historyTables) {
    const rows = (
      await client.query(
        `SELECT to_jsonb(history)::text AS row FROM (SELECT ${columns[table].map(quote).join(",")} FROM ${quote(table)} ORDER BY "id") history`,
      )
    ).rows.map((row) => row.row);
    tables.push({
      table,
      columns: columns[table],
      count: rows.length,
      digest: digest(rows.join("\n")),
    });
  }
  return { digest: digest(JSON.stringify(tables)), tables };
};
const positionProof = async (client) => ({
  balances: (
    await client.query(
      'SELECT a."id",coalesce(sum(e."amountMinor"),0)::text AS "amountMinor" FROM "LedgerAccount" a LEFT JOIN "LedgerEntry" e ON a."id"=e."accountId" GROUP BY a."id" ORDER BY a."id"',
    )
  ).rows,
  unbalancedJournals: Number(
    (
      await client.query(
        'SELECT count(*)::text AS count FROM (SELECT "transactionId" FROM "LedgerEntry" GROUP BY "transactionId" HAVING sum("amountMinor")<>0 OR count(*)<2) invalid',
      )
    ).rows[0].count,
  ),
  finalizedDistributions: Number(
    (
      await client.query(
        'SELECT count(*)::text AS count FROM "Distribution" WHERE "state"=\'FINALIZED\'',
      )
    ).rows[0].count,
  ),
});
const rule = {
  creatorFollowerThreshold: 10,
  allowedCountries: ["FR"],
  campaignReviewRequired: true,
  reward: {
    version: "migration-rewards-v1",
    rates: {
      QUALIFIED_VIEW: {
        userRuMicros: "250000",
        creatorRuMicros: "125000",
        advertiserRuMicrosPerMinor: "20000",
        xp: 40,
        eventPoints: 15,
      },
    },
  },
  distribution: {
    version: "migration-distribution-v1",
    poolBps: 3500,
    categoryWeightsBps: { USER: 4000, CREATOR: 3000, ADVERTISER: 2000, REFERRAL: 1000 },
  },
  margin: {
    version: "migration-margin-v1",
    minimumRetainedBps: 3000,
    operatingReserveMinor: "0",
    minimumOperatingProfitMinor: "0",
    targetOperatingProfitMinor: "0",
    mode: "REDUCE",
  },
  liabilities: {},
};
async function buildSnapshot() {
  const sourcePath = pathToFileURL(path.join(root, "src/domains/economy/distribution.ts")).href;
  const generator = `import { previewDistribution, finalizeDistribution } from ${JSON.stringify(sourcePath)};
const preview=previewDistribution({periodId:"migration-period",startAt:"2026-01-01T00:00:00.000Z",endAt:"2026-01-02T00:00:00.000Z",eligibleRevenueMinor:100n,rule:${JSON.stringify(rule.distribution)},participants:[{userId:"migration-user",category:"USER",amountMicros:250000n,eligible:true,unitIds:["ru-user"]},{userId:"migration-creator",category:"CREATOR",amountMicros:125000n,eligible:true,unitIds:["ru-creator"]},{userId:"migration-advertiser",category:"ADVERTISER",amountMicros:2000000n,eligible:true,unitIds:["ru-advertiser"]}],margin:{liabilities:{},rule:{...${JSON.stringify(rule.margin)},operatingReserveMinor:0n,minimumOperatingProfitMinor:0n,targetOperatingProfitMinor:0n}}});
const final=finalizeDistribution(preview,{id:"migration-final",finalizedAt:"2026-01-03T00:00:00.000Z",idempotencyKey:"migration-final-key",fundingAccountKey:"pool:global",availableFundingMinor:100n});process.stdout.write(JSON.stringify(final,(_,v)=>typeof v==="bigint"?v.toString():v));`;
  const file = path.join(stage, "snapshot-fixture.ts");
  await writeFile(file, generator);
  const output = await exec(
    process.execPath,
    [path.join(root, "node_modules/tsx/dist/cli.mjs"), file],
    { cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 },
  );
  const snapshot = JSON.parse(output.stdout);
  await writeFile(
    path.join(stage, "legacy-distribution-snapshot.json"),
    JSON.stringify(snapshot, null, 2),
  );
  return snapshot;
}
async function seedLegacy(client, snapshot) {
  const when = "2026-01-01T12:00:00.000Z";
  await client.query("BEGIN");
  try {
    for (const [id, roles] of [
      ["migration-user", ["USER"]],
      ["migration-creator", ["USER", "CREATOR"]],
      ["migration-advertiser", ["USER", "ADVERTISER"]],
      ["migration-admin", ["USER", "ADMIN"]],
    ]) {
      await client.query(
        'INSERT INTO "User" ("id","email","passwordHash","displayName","roles","country","onboarded","ageEligible","termsAcceptedAt","isDemo","updatedAt") VALUES ($1,$2,$3,$1,$4::"Role"[],\'FR\',true,true,$5,true,$5)',
        [id, id + "@migration-audit.test", "synthetic-fixture-not-a-login-hash", roles, when],
      );
    }
    await client.query(
      'INSERT INTO "EconomicRule" ("id","version","config") VALUES (\'migration-rule\',\'migration-policy-v1\',$1::jsonb)',
      [JSON.stringify(rule)],
    );
    await client.query(
      'INSERT INTO "Event" ("id","slug","title","description","startAt","endAt","rules","isDemo") VALUES (\'migration-event\',\'migration-event\',\'Legacy free event\',\'Synthetic Pass 01 history\',\'2026-01-01\',\'2026-01-02\',$1::jsonb,true)',
      [
        JSON.stringify({
          freeEntry: true,
          rules: { en: "Validated points only.", fr: "Points valides uniquement." },
        }),
      ],
    );
    await client.query(
      'INSERT INTO "EventMembership" ("id","userId","eventId","joinedAt") VALUES (\'migration-membership\',\'migration-user\',\'migration-event\',\'2026-01-01T11:00:00Z\')',
    );
    await client.query(
      'INSERT INTO "Campaign" ("id","advertiserId","name","objective","destinationUrl","budgetMinor","dailyBudgetMinor","unitCostMinor","state","startAt","endAt","eventId","isDemo","updatedAt") VALUES (\'migration-campaign\',\'migration-advertiser\',\'Legacy media\',\'QUALIFIED_VIEW\',\'https://example.com/legacy\',10000,10000,100,\'COMPLETED\',\'2026-01-01\',\'2026-01-02\',\'migration-event\',true,$1)',
      [when],
    );
    for (const [id, state] of [
      ["migration-active", "VALIDATED"],
      ["migration-reversed", "REVERSED"],
    ]) {
      await client.query(
        'INSERT INTO "Activity" ("id","idempotencyKey","userId","creatorId","campaignId","eventId","type","state","billableMinor","evidence","reviewReason","ruleVersion","validatedAt","createdAt","updatedAt") VALUES ($1,$1,\'migration-user\',\'migration-creator\',\'migration-campaign\',\'migration-event\',\'QUALIFIED_VIEW\',$2::"ActivityState",100,\'Synthetic independently reviewed evidence\',\'Synthetic fixture review\',\'migration-policy-v1\',$3,$3,$3)',
        [id, state, when],
      );
    }
    await client.query(
      'INSERT INTO "Distribution" ("id","startAt","endAt","ruleId","snapshot","fingerprint","state","finalizedAt","idempotencyKey") VALUES (\'migration-final\',\'2026-01-01\',\'2026-01-02\',\'migration-rule\',$1::jsonb,$2,\'FINALIZED\',\'2026-01-03\',\'migration-final-key\')',
      [JSON.stringify(snapshot), digest(snapshot.preview.payload)],
    );
    for (const [suffix, userId, category, micros] of [
      ["user", "migration-user", "USER", "250000"],
      ["creator", "migration-creator", "CREATOR", "125000"],
      ["advertiser", "migration-advertiser", "ADVERTISER", "2000000"],
    ]) {
      for (const reversed of [false, true])
        await client.query(
          'INSERT INTO "RewardUnit" ("id","userId","activityId","category","amountMicros","state","ruleVersion","distributionId","createdAt") VALUES ($1,$2,$3,$4::"ParticipantCategory",$5::bigint,$6::"RewardState",\'migration-policy-v1\',$7,$8)',
          [
            (reversed ? "reversed-ru-" : "ru-") + suffix,
            userId,
            reversed ? "migration-reversed" : "migration-active",
            category,
            micros,
            reversed ? "REVERSED" : "CONSUMED",
            reversed ? null : "migration-final",
            when,
          ],
        );
    }
    for (const [id, activity, reversal, xp, ep] of [
      ["active", "migration-active", false, 40, 15],
      ["reversed-origin", "migration-reversed", false, 40, 15],
      ["reversed-correction", "migration-reversed", true, -40, -15],
    ]) {
      await client.query(
        'INSERT INTO "XpEntry" ("id","userId","activityId","amount","reversal","createdAt") VALUES ($1,\'migration-user\',$2,$3,$4,$5)',
        ["xp-" + id, activity, xp, reversal, when],
      );
      await client.query(
        'INSERT INTO "EventPoint" ("id","userId","eventId","activityId","amount","reversal","createdAt") VALUES ($1,\'migration-user\',\'migration-event\',$2,$3,$4,$5)',
        ["ep-" + id, activity, ep, reversal, when],
      );
    }
    for (const [id, kind, userId, campaignId] of [
      ["migration:clearing", "CASH_CLEARING", null, null],
      ["campaign:migration-campaign", "CAMPAIGN_ESCROW", null, "migration-campaign"],
      ["platform:revenue", "PLATFORM_REVENUE", null, null],
      ["pool:global", "GLOBAL_DISTRIBUTION_POOL", null, null],
      ["user:migration-user", "USER_PAYABLE", "migration-user", null],
      ["user:migration-creator", "USER_PAYABLE", "migration-creator", null],
      ["user:migration-advertiser", "USER_PAYABLE", "migration-advertiser", null],
    ])
      await client.query(
        'INSERT INTO "LedgerAccount" ("id","kind","userId","campaignId") VALUES ($1,$2::"AccountKind",$3,$4)',
        [id, kind, userId, campaignId],
      );
    let entry = 0;
    const journal = async (id, kind, reference, entries, reversal = null) => {
      await client.query(
        'INSERT INTO "LedgerTransaction" ("id","idempotencyKey","kind","referenceId","description","reversesId","isDemo","createdAt") VALUES ($1,$1,$2,$3,\'Synthetic Pass 01 balanced history\',$4,true,$5)',
        [id, kind, reference, reversal, when],
      );
      for (const row of entries)
        await client.query(
          'INSERT INTO "LedgerEntry" ("id","transactionId","accountId","amountMinor","createdAt") VALUES ($1,$2,$3,$4::bigint,$5)',
          ["legacy-entry-" + ++entry, id, row.accountKey, row.amountMinor, when],
        );
    };
    await journal("legacy-deposit", "DEVELOPMENT_FUNDING", "migration-campaign", [
      { accountKey: "migration:clearing", amountMinor: "-10000" },
      { accountKey: "campaign:migration-campaign", amountMinor: "10000" },
    ]);
    for (const activity of ["migration-active", "migration-reversed"])
      await journal("bill-" + activity, "VALIDATED_ACTIVITY", activity, [
        { accountKey: "campaign:migration-campaign", amountMinor: "-100" },
        { accountKey: "platform:revenue", amountMinor: "100" },
      ]);
    await journal(
      "reverse-migration-reversed",
      "ACTIVITY_REVERSAL",
      "migration-reversed",
      [
        { accountKey: "campaign:migration-campaign", amountMinor: "100" },
        { accountKey: "platform:revenue", amountMinor: "-100" },
      ],
      "bill-migration-reversed",
    );
    await journal("legacy-pool", "GLOBAL_POOL_ALLOCATION", "migration-final", [
      { accountKey: "platform:revenue", amountMinor: "-" + snapshot.preview.distributedMinor },
      { accountKey: "pool:global", amountMinor: snapshot.preview.distributedMinor },
    ]);
    await journal(
      snapshot.transaction.id,
      "REVENUE_DISTRIBUTION",
      "migration-final",
      snapshot.transaction.entries,
    );
    await client.query(
      'INSERT INTO "Referral" ("id","inviterId","inviteeId") VALUES (\'legacy-referral\',\'migration-creator\',\'migration-user\')',
    );
    await client.query(
      'INSERT INTO "RiskEvent" ("id","userId","kind","detail") VALUES (\'legacy-risk\',\'migration-user\',\'REVIEWED_REVERSAL\',\'Synthetic historical reversal evidence\')',
    );
    await client.query(
      'INSERT INTO "AuditLog" ("id","actorId","action","targetId","details") VALUES (\'legacy-audit\',\'migration-admin\',\'DISTRIBUTION_FINALIZED\',\'migration-final\',$1::jsonb)',
      [
        JSON.stringify({
          snapshotFingerprint: digest(snapshot.preview.payload),
          reason: "Synthetic legacy fixture, not a production restore",
        }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
const report = {
  startedAt: new Date().toISOString(),
  scope:
    "Loopback-only newly-created retained audit databases; existing development/test databases untouched",
  databases: names,
  limitations:
    "Representative synthetic Pass 01 SQL records with a real deterministic domain-generated finalized distribution. This is not an actual production restore or exhaustive deployment rehearsal.",
};
try {
  report.cleanDeploy = await deploy(names.clean);
  const clean = await open(names.clean);
  try {
    report.cleanMigrations = await migrationProof(clean);
    assert(report.cleanMigrations.length === migrations.length, "Clean migration count mismatch");
    report.cleanTableCount = Number(
      (
        await clean.query(
          "SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
        )
      ).rows[0].count,
    );
  } finally {
    await clean.end();
  }
  const oldRoot = path.join(stage, "pass01-migrations");
  await mkdir(oldRoot);
  await copyFile(
    path.join(migrationRoot, "migration_lock.toml"),
    path.join(oldRoot, "migration_lock.toml"),
  );
  for (const name of baseline) {
    await mkdir(path.join(oldRoot, name));
    await copyFile(
      path.join(migrationRoot, name, "migration.sql"),
      path.join(oldRoot, name, "migration.sql"),
    );
  }
  const config = path.join(stage, "pass01.prisma.config.ts");
  await writeFile(
    config,
    `import { defineConfig } from "prisma/config"; export default defineConfig({schema:${JSON.stringify(path.join(root, "prisma/schema.prisma"))},migrations:{path:${JSON.stringify(oldRoot)}},datasource:{url:process.env.DATABASE_URL}});`,
  );
  report.baselineDeploy = await deploy(names.upgrade, config);
  const upgrade = await open(names.upgrade);
  try {
    report.baselineMigrations = await migrationProof(upgrade);
    assert(
      report.baselineMigrations.length === baseline.length,
      "Baseline migration count mismatch",
    );
    await seedLegacy(upgrade, await buildSnapshot());
    const columns = await captureColumns(upgrade);
    report.before = await captureHistory(upgrade, columns);
    report.positionsBefore = await positionProof(upgrade);
    assert(
      report.positionsBefore.unbalancedJournals === 0 &&
        report.positionsBefore.finalizedDistributions === 1,
      "Legacy fixture did not satisfy financial invariants",
    );
    report.forwardDeploy = await deploy(names.upgrade);
    report.upgradeMigrations = await migrationProof(upgrade);
    report.after = await captureHistory(upgrade, columns);
    report.positionsAfter = await positionProof(upgrade);
    assert(
      report.upgradeMigrations.length === migrations.length,
      "Forward upgrade migration count mismatch",
    );
    assert(
      report.before.digest === report.after.digest,
      "Economic history changed across forward migration",
    );
    assert(
      JSON.stringify(report.positionsBefore) === JSON.stringify(report.positionsAfter),
      "Balances or final records changed across migration",
    );
    report.noopDeploy = await deploy(names.upgrade);
    assert(report.noopDeploy.noPending, "Repeated migration deploy was not a no-op");
    report.exactEconomicHistoryPreserved = true;
    report.success = true;
  } finally {
    await upgrade.end();
  }
} catch (error) {
  report.success = false;
  report.error = String(error?.message ?? error)
    .replaceAll(source.toString(), "[redacted connection]")
    .replaceAll(source.password, source.password ? "[redacted]" : "");
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(stage, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        success: report.success,
        databases: names,
        cleanMigrations: report.cleanMigrations?.length,
        upgradeMigrations: report.upgradeMigrations?.length,
        historyDigest: report.after?.digest,
        exactEconomicHistoryPreserved: report.exactEconomicHistoryPreserved,
        reportPath: path.join(stage, "report.json"),
        retained: true,
      },
      null,
      2,
    ),
  );
}
