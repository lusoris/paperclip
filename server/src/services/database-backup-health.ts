import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

export type DatabaseBackupHealthWarningCode =
  | "database_backup_check_failed"
  | "database_backup_clock_skew"
  | "database_backup_last_failure"
  | "database_backup_missing"
  | "database_backup_stale";

export type DatabaseBackupHealthWarning = {
  code: DatabaseBackupHealthWarningCode;
  message: string;
};

export type DatabaseBackupHealthStatus = {
  enabled: boolean;
  status: "ok" | "warning";
  backupDir: string;
  maxAgeHours: number;
  latestBackup: {
    name: string;
    path: string;
    mtime: string;
    ageHours: number;
    sizeBytes: number;
  } | null;
  lastFailure: {
    path: string;
    mtime: string;
    message: string;
  } | null;
  warnings: DatabaseBackupHealthWarning[];
};

export type InspectDatabaseBackupHealthOptions = {
  enabled: boolean;
  backupDir: string;
  maxAgeHours: number;
  alertFile?: string;
  now?: Date;
};

function roundHours(value: number): number {
  return Math.round(value * 10) / 10;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readLastFailure(alertFile: string | undefined) {
  if (!alertFile) return null;

  try {
    const [alertStat, contents] = await Promise.all([
      stat(alertFile),
      readFile(alertFile, "utf8"),
    ]);
    const message = contents.trim().split(/\r?\n/)[0] || "Database backup failure marker is present.";
    return {
      path: alertFile,
      mtime: new Date(alertStat.mtimeMs).toISOString(),
      message,
    };
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

async function findLatestBackup(backupDir: string, nowMs: number) {
  let names: string[];
  try {
    names = await readdir(backupDir);
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }

  let latest: { fullPath: string; mtimeMs: number; size: number } | null = null;
  for (const name of names) {
    if (!name.endsWith(".sql.gz")) continue;
    const fullPath = join(backupDir, name);
    let fileStat;
    try {
      fileStat = await stat(fullPath);
    } catch (error) {
      if (isMissingFileError(error)) continue;
      throw error;
    }
    // Zero-byte archives are failed/partial dumps, not restorable backups.
    if (fileStat.size === 0) continue;
    if (!latest || fileStat.mtimeMs > latest.mtimeMs) {
      latest = { fullPath, mtimeMs: fileStat.mtimeMs, size: fileStat.size };
    }
  }

  if (!latest) return null;

  return {
    name: basename(latest.fullPath),
    path: latest.fullPath,
    mtime: new Date(latest.mtimeMs).toISOString(),
    ageHours: roundHours((nowMs - latest.mtimeMs) / 3_600_000),
    sizeBytes: latest.size,
  };
}

export async function inspectDatabaseBackupHealth(
  opts: InspectDatabaseBackupHealthOptions,
): Promise<DatabaseBackupHealthStatus> {
  const warnings: DatabaseBackupHealthWarning[] = [];
  const now = opts.now ?? new Date();
  const maxAgeHours =
    Number.isFinite(opts.maxAgeHours) && opts.maxAgeHours > 0 ? opts.maxAgeHours : 1;

  let latestBackup: DatabaseBackupHealthStatus["latestBackup"] = null;
  let lastFailure: DatabaseBackupHealthStatus["lastFailure"] = null;

  try {
    [latestBackup, lastFailure] = await Promise.all([
      findLatestBackup(opts.backupDir, now.getTime()),
      readLastFailure(opts.alertFile),
    ]);

    if (!latestBackup) {
      warnings.push({
        code: "database_backup_missing",
        message: `No non-empty .sql.gz database backups found in ${opts.backupDir}.`,
      });
    } else if (latestBackup.ageHours < 0) {
      warnings.push({
        code: "database_backup_clock_skew",
        message: `Latest database backup timestamp ${latestBackup.mtime} is in the future; backup freshness cannot be verified (check system clock).`,
      });
    } else if (latestBackup.ageHours > maxAgeHours) {
      warnings.push({
        code: "database_backup_stale",
        message: `Latest database backup is ${latestBackup.ageHours}h old, exceeding ${maxAgeHours}h.`,
      });
    }

    if (lastFailure) {
      warnings.push({
        code: "database_backup_last_failure",
        message: lastFailure.message,
      });
    }
  } catch (error) {
    warnings.push({
      code: "database_backup_check_failed",
      message: `Database backup health check failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  return {
    enabled: opts.enabled,
    status: warnings.length > 0 ? "warning" : "ok",
    backupDir: opts.backupDir,
    maxAgeHours,
    latestBackup,
    lastFailure,
    warnings,
  };
}
