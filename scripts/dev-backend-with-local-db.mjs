import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import EmbeddedPostgres from "embedded-postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const localDir = resolve(rootDir, ".local");
const databaseDir = resolve(localDir, "postgres-data");
const postgresPort = Number(process.env.RAPID_POSTGRES_PORT ?? "5432");
const postgresUser = process.env.RAPID_POSTGRES_USER ?? "postgres";
const postgresPassword = process.env.RAPID_POSTGRES_PASSWORD ?? "postgres";
const postgresDatabase = process.env.RAPID_POSTGRES_DB ?? "rapid";
const backendPort = process.env.RAPID_BACKEND_PORT ?? "8000";
const backendHost = process.env.RAPID_BACKEND_HOST ?? "127.0.0.1";
const pythonBinary = process.env.RAPID_PYTHON_BIN ?? "python3";
const enableReload = process.env.RAPID_BACKEND_RELOAD === "1";
const pgVersionPath = resolve(databaseDir, "PG_VERSION");

mkdirSync(localDir, { recursive: true });

const postgres = new EmbeddedPostgres({
  databaseDir,
  user: postgresUser,
  password: postgresPassword,
  port: postgresPort,
  persistent: true,
  onLog: (message) => {
    const line = String(message).trim();
    if (line) {
      console.log(`[local-postgres] ${line}`);
    }
  },
  onError: (message) => {
    const line = String(message).trim();
    if (line) {
      console.error(`[local-postgres] ${line}`);
    }
  },
});

function buildDatabaseUrl() {
  return `postgresql://${encodeURIComponent(postgresUser)}:${encodeURIComponent(
    postgresPassword,
  )}@127.0.0.1:${postgresPort}/${postgresDatabase}`;
}

async function ensureApplicationDatabase() {
  try {
    await postgres.createDatabase(postgresDatabase);
    console.log(`[rapid] Created PostgreSQL database "${postgresDatabase}".`);
  } catch (error) {
    const detail = String(error);
    if (detail.includes("already exists") || detail.includes("42P04")) {
      console.log(`[rapid] PostgreSQL database "${postgresDatabase}" already exists.`);
      return;
    }

    throw error;
  }
}

async function stopPostgres() {
  try {
    await postgres.stop();
  } catch (error) {
    const detail = String(error);
    if (
      !detail.includes("No PostgreSQL process") &&
      !detail.includes("not running") &&
      !detail.includes("ENOENT")
    ) {
      console.error(`[rapid] Failed to stop local PostgreSQL: ${detail}`);
    }
  }
}

async function main() {
  if (!existsSync(pgVersionPath)) {
    await postgres.initialise();
  }
  await postgres.start();
  await ensureApplicationDatabase();

  const databaseUrl = buildDatabaseUrl();
  console.log(`[rapid] Local PostgreSQL ready at ${databaseUrl}`);

  const backend = spawn(
    pythonBinary,
    [
      "-m",
      "uvicorn",
      "backend.app.main:app",
      "--host",
      backendHost,
      "--port",
      backendPort,
      ...(enableReload ? ["--reload"] : []),
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
      env: {
        ...process.env,
        RAPID_DATABASE_URL: databaseUrl,
      },
    },
  );

  let shuttingDown = false;

  const shutdown = async (exitCode = 0) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    if (!backend.killed) {
      backend.kill("SIGINT");
    }

    await stopPostgres();
    process.exit(exitCode);
  };

  backend.on("exit", async (code, signal) => {
    await stopPostgres();

    if (signal) {
      process.exit(1);
    }

    process.exit(code ?? 0);
  });

  process.on("SIGINT", () => {
    void shutdown(0);
  });

  process.on("SIGTERM", () => {
    void shutdown(0);
  });
}

main().catch(async (error) => {
  console.error(`[rapid] Failed to start the backend with local PostgreSQL: ${error}`);
  await stopPostgres();
  process.exit(1);
});
