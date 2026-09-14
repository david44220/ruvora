/** Private development operator utility. Never prints tokens or mail contents. */
import "dotenv/config";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { db } from "../src/server/db";
import { assertDevelopment } from "../src/server/environment";
import { assert } from "../src/server/errors";
import { developmentMailbox } from "../src/server/security/email";
async function main() {
  assertDevelopment("Private development mail inspection");
  assert(
    process.env.ALLOW_DEV_MAIL_INSPECTION === "true",
    "DEV_MAIL_INSPECTION_DISABLED",
    "Explicit local operator mail inspection is required.",
    403,
  );
  const index = process.argv.indexOf("--email");
  const email = z
    .email()
    .parse(index >= 0 ? process.argv[index + 1] : undefined)
    .toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  assert(user, "MAIL_ACCOUNT_UNAVAILABLE", "No local account is available for inspection.", 404);
  const mailbox = await developmentMailbox(user);
  const directory = resolve(".local", "private-mail");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  for (const item of mailbox.messages) {
    const path = join(directory, item.id + ".json");
    await writeFile(path, JSON.stringify(item, null, 2), { mode: 0o600 });
    await chmod(path, 0o600);
    console.log("Private development mail saved: " + path);
  }
  console.log(
    "External delivery: false. Inspect these local files privately and delete them when finished.",
  );
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error && "code" in error ? String(error.code) : "DEV_MAIL_INSPECTION_FAILED",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
