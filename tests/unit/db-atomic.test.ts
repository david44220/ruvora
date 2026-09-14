import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@prisma/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@prisma/client")>();
  return {
    ...original,
    PrismaClient: class {
      $transaction = mocks.transaction;
    },
  };
});
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
import { Prisma } from "@prisma/client";
import { atomic } from "../../src/server/db";
const require = createRequire(import.meta.url);
const commonRuntime =
  require("@prisma/client/runtime/client") as typeof import("@prisma/client/runtime/client");
const esmPath = require.resolve("@prisma/client/runtime/client").replace(/\.js$/, ".mjs");
const esmRuntime = (await import(
  pathToFileURL(esmPath).href
)) as typeof import("@prisma/client/runtime/client");
const runtimes = [
  { label: "generated/CommonJS", ErrorClass: Prisma.PrismaClientKnownRequestError },
  { label: "ESM", ErrorClass: esmRuntime.PrismaClientKnownRequestError },
];
const errorOptions = { clientVersion: Prisma.prismaVersion.client };
beforeEach(() => vi.resetAllMocks());
describe("Serializable retry error identity", () => {
  it("exercises distinct actual Prisma runtimes without opening a database connection", () => {
    expect(Prisma.PrismaClientKnownRequestError).toBe(commonRuntime.PrismaClientKnownRequestError);
    const error = new esmRuntime.PrismaClientKnownRequestError("Foreign runtime conflict", {
      ...errorOptions,
      code: "P2034",
    });
    expect(error).not.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(error.name).toBe("PrismaClientKnownRequestError");
  });
  for (const { label, ErrorClass } of runtimes) {
    it(`${label} P2034 retries the whole transaction with unchanged isolation and limits`, async () => {
      const error = new ErrorClass("Serialization conflict", { ...errorOptions, code: "P2034" });
      mocks.transaction.mockRejectedValueOnce(error).mockResolvedValueOnce("committed");
      const work = vi.fn();
      expect(await atomic(work)).toBe("committed");
      expect(mocks.transaction).toHaveBeenCalledTimes(2);
      for (const call of mocks.transaction.mock.calls)
        expect(call).toEqual([
          work,
          { isolationLevel: "Serializable", maxWait: 10_000, timeout: 20_000 },
        ]);
    });
    it.each([
      { label: "direct serialization", meta: { code: "40001" } },
      { label: "direct deadlock", meta: { code: "40P01" } },
      {
        label: "adapter serialization",
        meta: { driverAdapterError: { cause: { originalCode: "40001" } } },
      },
      {
        label: "adapter deadlock",
        meta: { driverAdapterError: { cause: { originalCode: "40P01" } } },
      },
    ])(`${label} retries P2010 $label only`, async ({ meta }) => {
      const error = new ErrorClass("Raw query conflict", { ...errorOptions, code: "P2010", meta });
      mocks.transaction.mockRejectedValueOnce(error).mockResolvedValueOnce("committed");
      expect(await atomic(vi.fn())).toBe("committed");
      expect(mocks.transaction).toHaveBeenCalledTimes(2);
    });
  }
  it.each([
    new esmRuntime.PrismaClientKnownRequestError("Unique constraint", {
      ...errorOptions,
      code: "P2002",
    }),
    new esmRuntime.PrismaClientKnownRequestError("Other SQL error", {
      ...errorOptions,
      code: "P2010",
      meta: { code: "23505" },
    }),
    new esmRuntime.PrismaClientKnownRequestError("Missing SQLSTATE", {
      ...errorOptions,
      code: "P2010",
    }),
    Object.assign(new Error("Application conflict"), { code: "P2034", clientVersion: "7.10.0" }),
    { name: "PrismaClientKnownRequestError", code: "P2034", message: "Incomplete envelope" },
    { code: "P2034" },
    null,
  ])("propagates nonretryable errors by identity without another attempt (%#)", async (error) => {
    mocks.transaction.mockRejectedValue(error);
    await expect(atomic(vi.fn())).rejects.toBe(error);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it("stops after five failed attempts and propagates the last original error", async () => {
    const failures = Array.from(
      { length: 5 },
      (_, attempt) =>
        new esmRuntime.PrismaClientKnownRequestError(`Conflict ${attempt}`, {
          ...errorOptions,
          code: "P2034",
        }),
    );
    for (const error of failures) mocks.transaction.mockRejectedValueOnce(error);
    await expect(atomic(vi.fn())).rejects.toBe(failures[4]);
    expect(mocks.transaction).toHaveBeenCalledTimes(5);
  });
});
