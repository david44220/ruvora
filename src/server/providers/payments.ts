import { randomInt, randomUUID } from "node:crypto";
import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { atomic, db, jsonValue, type Tx } from "../db";
import { AppError, assert } from "../errors";
import { assertDevelopment, isDevelopment } from "../environment";
import { requireRole } from "../auth";
import { account, balance, postLedger } from "../ledger";
import { canonicalPayload } from "../../domains/economy/shared";
import { secretDigest } from "../security/crypto";
export type PaymentKind = "DEPOSIT" | "REFUND" | "CHARGEBACK" | "PAYOUT";
export interface PaymentRequest {
  idempotencyKey: string;
  userId: string;
  amountMinor: bigint;
  currency: "EUR";
  parentReference?: string;
}
export interface PaymentReceipt {
  provider: string;
  externalId: string;
  state: "CONFIRMED";
  simulated: boolean;
}
export interface PaymentProvider {
  name: string;
  environment: "development" | "production";
  deposit(request: PaymentRequest): Promise<PaymentReceipt>;
  refund(request: PaymentRequest): Promise<PaymentReceipt>;
  chargeback(request: PaymentRequest): Promise<PaymentReceipt>;
  payout(request: PaymentRequest): Promise<PaymentReceipt>;
}
export class DevelopmentPaymentProvider implements PaymentProvider {
  readonly name = "development";
  readonly environment = "development";
  private receipt(kind: string, request: PaymentRequest): PaymentReceipt {
    assertDevelopment("Development payments");
    assert(
      process.env.ALLOW_DEMO_FUNDING === "true",
      "DEMO_FUNDING_DISABLED",
      "Development funding is not enabled.",
      403,
    );
    return {
      provider: this.name,
      externalId:
        "dev_" +
        secretDigest(
          kind +
            ":" +
            request.userId +
            ":" +
            (request.parentReference ?? "") +
            ":" +
            request.idempotencyKey,
        ),
      state: "CONFIRMED",
      simulated: true,
    };
  }
  async deposit(request: PaymentRequest) {
    return this.receipt("deposit", request);
  }
  async refund(request: PaymentRequest) {
    return this.receipt("refund", request);
  }
  async chargeback(request: PaymentRequest) {
    return this.receipt("chargeback", request);
  }
  async payout(_request: PaymentRequest): Promise<PaymentReceipt> {
    void _request;
    throw new AppError("PAYOUT_UNAVAILABLE", "No payout delivery adapter is configured.", 503);
  }
}
export function configuredPaymentProvider(): PaymentProvider {
  if (process.env.PAYMENT_PROVIDER === "development") {
    assertDevelopment("Development payments");
    return new DevelopmentPaymentProvider();
  }
  throw new AppError("PAYMENT_PROVIDER_UNAVAILABLE", "No live payment adapter is configured.", 503);
}
const amount = z
  .union([z.string().regex(/^[1-9]\d{0,11}$/), z.number().int().min(1).max(999999999999)])
  .transform(BigInt);
const key = z
  .string()
  .min(8)
  .max(100)
  .regex(/^[a-zA-Z0-9:_-]+$/);
const depositInput = z
  .object({ amountMinor: amount, currency: z.literal("EUR").default("EUR"), idempotencyKey: key })
  .strict();
async function paymentAtomic<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await atomic(work);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && attempt < 3) {
        const meta = error.meta as
          { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } } | undefined;
        const sqlState = meta?.code ?? meta?.driverAdapterError?.cause?.originalCode;
        if (
          ["P2002", "P2034"].includes(error.code) ||
          (error.code === "P2010" && ["40001", "40P01"].includes(sqlState ?? ""))
        ) {
          // Separate simultaneous retries after the inner serializable retry budget.
          await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt + randomInt(0, 50)));
          continue;
        }
      }
      throw error;
    }
  }
}
async function paymentActor(tx: Tx, userId: string) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  requireRole(user, "ADVERTISER");
  assert(
    !user.suspended && !user.economicHold && user.onboarded,
    "ECONOMIC_HOLD",
    "Complete account eligibility before funding.",
    403,
  );
  return user;
}
export async function depositAdvertiserBalance(user: User, input: unknown) {
  assertDevelopment("Development deposits");
  requireRole(user, "ADVERTISER");
  const value = depositInput.parse(input);
  const provider = configuredPaymentProvider();
  const receipt = await provider.deposit({ ...value, userId: user.id });
  assert(
    receipt.simulated && provider.environment === "development",
    "PAYMENT_PROVIDER_UNAVAILABLE",
    "This endpoint only supports explicit development deposits.",
    503,
  );
  const idempotencyKey = "deposit:" + user.id + ":" + value.idempotencyKey;
  const hash = secretDigest(
    canonicalPayload(
      jsonValue({
        userId: user.id,
        kind: "DEPOSIT",
        amountMinor: value.amountMinor,
        currency: value.currency,
      }),
    ),
  );
  return paymentAtomic(async (tx) => {
    await paymentActor(tx, user.id);
    const existing = await tx.paymentOperation.findUnique({ where: { idempotencyKey } });
    if (existing) {
      assert(
        existing.payloadHash === hash,
        "IDEMPOTENCY_CONFLICT",
        "Payment key was used with different inputs.",
        409,
      );
      return {
        payment: existing,
        availableMinor: await balance(tx, "advertiser:" + user.id),
        development: true,
      };
    }
    const operation = await tx.paymentOperation.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        provider: receipt.provider,
        externalId: receipt.externalId,
        kind: "DEPOSIT",
        idempotencyKey,
        payloadHash: hash,
        amountMinor: value.amountMinor,
        currency: "EUR",
        isDemo: true,
      },
    });
    await account(tx, "platform:cash-clearing", "CASH_CLEARING");
    await account(tx, "advertiser:" + user.id, "ADVERTISER_AVAILABLE", { userId: user.id });
    const ledger = await postLedger(tx, {
      key: "payment:" + operation.id,
      kind: "DEVELOPMENT_DEPOSIT",
      referenceId: operation.id,
      description: "Simulated development deposit; no external funds received",
      isDemo: true,
      entries: [
        { accountId: "platform:cash-clearing", amountMinor: -value.amountMinor },
        { accountId: "advertiser:" + user.id, amountMinor: value.amountMinor },
      ],
    });
    const payment = await tx.paymentOperation.update({
      where: { id: operation.id },
      data: { state: "CONFIRMED", ledgerTransactionId: ledger.id },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "DEVELOPMENT_DEPOSIT_RECORDED",
        targetId: operation.id,
        details: { isDemo: true, ledgerTransactionId: ledger.id },
      },
    });
    return {
      payment,
      availableMinor: await balance(tx, "advertiser:" + user.id),
      development: true,
    };
  });
}
const correctionInput = depositInput
  .extend({ depositId: z.string().min(1).max(128), reason: z.string().trim().min(10).max(500) })
  .strict();
export async function correctDepositInTransaction(
  tx: Tx,
  input: {
    userId: string;
    depositId: string;
    amountMinor: bigint;
    currency: "EUR";
    idempotencyKey: string;
    kind: "REFUND" | "CHARGEBACK";
    reason: string;
    externalId: string;
    actorId: string | null;
  },
) {
  assertDevelopment("Development payment corrections");
  const parent = await tx.paymentOperation.findUnique({ where: { id: input.depositId } });
  assert(
    parent &&
      parent.userId === input.userId &&
      parent.kind === "DEPOSIT" &&
      parent.state === "CONFIRMED" &&
      parent.isDemo &&
      parent.currency === input.currency,
    "PAYMENT_CORRELATION_FAILED",
    "The payment does not match a confirmed development deposit.",
    409,
  );
  const idempotencyKey = input.kind.toLowerCase() + ":" + parent.id + ":" + input.idempotencyKey;
  const hash = secretDigest(
    canonicalPayload(
      jsonValue({
        depositId: parent.id,
        kind: input.kind,
        amountMinor: input.amountMinor,
        currency: input.currency,
        reason: input.reason,
      }),
    ),
  );
  const existing = await tx.paymentOperation.findUnique({ where: { idempotencyKey } });
  if (existing) {
    assert(
      existing.payloadHash === hash,
      "IDEMPOTENCY_CONFLICT",
      "Payment key was used with different inputs.",
      409,
    );
    return existing;
  }
  const corrected =
    (
      await tx.paymentOperation.aggregate({
        where: { parentId: parent.id, state: "CONFIRMED" },
        _sum: { amountMinor: true },
      })
    )._sum.amountMinor ?? 0n;
  assert(
    corrected + input.amountMinor <= parent.amountMinor,
    "PAYMENT_AMOUNT_EXCEEDED",
    "Corrections exceed the original deposit.",
    409,
  );
  assert(
    input.amountMinor > 0n &&
      (await balance(tx, "advertiser:" + parent.userId)) >= input.amountMinor,
    "INSUFFICIENT_FUNDS",
    "Spent funds require reviewed recovery; available funds are insufficient.",
    409,
  );
  const operation = await tx.paymentOperation.create({
    data: {
      id: randomUUID(),
      userId: parent.userId,
      provider: parent.provider,
      externalId: input.externalId,
      kind: input.kind,
      idempotencyKey,
      payloadHash: hash,
      amountMinor: input.amountMinor,
      currency: input.currency,
      parentId: parent.id,
      isDemo: true,
    },
  });
  const ledger = await postLedger(tx, {
    key: "payment:" + operation.id,
    kind: "DEVELOPMENT_" + input.kind,
    referenceId: parent.id,
    description: "Simulated development " + input.kind.toLowerCase() + "; " + input.reason,
    isDemo: true,
    entries: [
      { accountId: "advertiser:" + parent.userId, amountMinor: -input.amountMinor },
      { accountId: "platform:cash-clearing", amountMinor: input.amountMinor },
    ],
  });
  const payment = await tx.paymentOperation.update({
    where: { id: operation.id },
    data: { state: "CONFIRMED", ledgerTransactionId: ledger.id },
  });
  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      action: "DEVELOPMENT_" + input.kind + "_RECORDED",
      targetId: payment.id,
      details: { parentId: parent.id, ledgerTransactionId: ledger.id, isDemo: true },
    },
  });
  return payment;
}
export async function refundAdvertiserDeposit(user: User, input: unknown) {
  assertDevelopment("Development refunds");
  requireRole(user, "ADVERTISER");
  const value = correctionInput.parse(input);
  const receipt = await configuredPaymentProvider().refund({
    ...value,
    userId: user.id,
    parentReference: value.depositId,
  });
  return paymentAtomic(async (tx) => {
    await paymentActor(tx, user.id);
    const payment = await correctDepositInTransaction(tx, {
      ...value,
      userId: user.id,
      actorId: user.id,
      kind: "REFUND",
      externalId: receipt.externalId,
    });
    return {
      payment,
      availableMinor: await balance(tx, "advertiser:" + user.id),
      development: true,
    };
  });
}
export async function paymentSummary(user: User) {
  requireRole(user, "ADVERTISER");
  return {
    availableMinor: await balance(db, "advertiser:" + user.id),
    developmentFundingAvailable:
      isDevelopment() &&
      process.env.ALLOW_DEMO_FUNDING === "true" &&
      process.env.PAYMENT_PROVIDER === "development",
    payments: await db.paymentOperation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  };
}
