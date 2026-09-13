/**
 * Real PostgreSQL 18 for local development; never used by production.
 * Data survives every shutdown. No reset/delete behavior is provided.
 */
import "dotenv/config";
import { access, mkdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";

if (process.env.NODE_ENV === "production") {
  throw new Error("The embedded PostgreSQL helper is restricted to local development.");
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseDir = join(root, ".local", "postgres");
const port = Number(process.env.LOCAL_POSTGRES_PORT || 54329);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("LOCAL_POSTGRES_PORT must be an integer between 1024 and 65535.");
}

const platform = process.platform === "win32" ? "windows" : process.platform;
const packageName = `@embedded-postgres/${platform}-${process.arch}`;
const embeddedRequire = createRequire(import.meta.resolve("embedded-postgres"));
const binaries = await import(pathToFileURL(embeddedRequire.resolve(packageName)).href);
const runFile = promisify(execFile);

// The library force-kills PostgreSQL on Windows. Override its exit-hook stop
// method with pg_ctl fast shutdown, which checkpoints and disconnects clients.
class LocalPostgres extends EmbeddedPostgres {
  #stopping;
  stop() {
    if (!this.process || this.process.exitCode !== null) return Promise.resolve();
    if (!this.#stopping) {
      this.#stopping = runFile(
        binaries.pg_ctl,
        ["-D", databaseDir, "-m", "fast", "-w", "-t", "30", "stop"],
        { windowsHide: true },
      )
        .then(() => {
          this.process = undefined;
        })
        .catch((error) => {
          console.error(
            "PostgreSQL did not stop cleanly. Data was preserved; inspect .local/postgres.",
          );
          throw error;
        });
    }
    return this.#stopping;
  }
}

if (process.argv.includes("--stop")) {
  // Fixed workspace-local directory; no arbitrary deletion or process target.
  await runFile(binaries.pg_ctl, ["-D", databaseDir, "-m", "fast", "-w", "-t", "30", "stop"], {
    windowsHide: true,
  });
  console.log("Local PostgreSQL stopped. All data was preserved.");
} else {
  await mkdir(join(root, ".local"), { recursive: true });
  const database = new LocalPostgres({
    databaseDir,
    port,
    user: "ruvora",
    password: "ruvora-local-only",
    authMethod: "scram-sha-256",
    persistent: true,
    createPostgresUser: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-h", "127.0.0.1", "-c", "password_encryption=scram-sha-256"],
    onLog: (message) => process.stdout.write(String(message)),
    onError: (error) => console.error(error),
  });

  let initialized = true;
  try {
    await access(join(databaseDir, "PG_VERSION"), constants.R_OK);
  } catch {
    initialized = false;
  }
  if (initialized) {
    const version = (await readFile(join(databaseDir, "PG_VERSION"), "utf8")).trim();
    if (version !== "18")
      throw new Error(
        `Existing cluster is PostgreSQL ${version}; migrate it explicitly before using PG18.`,
      );
  } else {
    await database.initialise();
  }

  try {
    await database.start();
    const client = database.getPgClient("postgres", "127.0.0.1");
    try {
      await client.connect();
      for (const name of ["ruvora", "ruvora_test"]) {
        const found = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
        if (!found.rowCount) await client.query(`CREATE DATABASE "${name}"`);
      }
      const result = await client.query(
        "SELECT version(), current_setting('listen_addresses') AS listen_addresses",
      );
      console.log("\n" + result.rows[0].version);
      console.log(`Local PostgreSQL ready on ${result.rows[0].listen_addresses}:${port}.`);
      console.log("Databases: ruvora (development), ruvora_test (integration tests).");
      console.log(
        "Credentials are local-only defaults from .env.example. Never reuse them in production.",
      );
      console.log(
        "Stop with Ctrl+C, or node scripts/local-postgres.mjs --stop. Data persists in .local/postgres.",
      );
    } finally {
      await client.end();
    }
  } catch (error) {
    await database.stop();
    throw error;
  }
  // embedded-postgres registers signal/exit hooks and calls our idempotent
  // graceful stop override. Its child-process pipes keep this supervisor alive.
}
