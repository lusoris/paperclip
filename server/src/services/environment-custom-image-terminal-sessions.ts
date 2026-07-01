import { createHash, randomBytes } from "node:crypto";

const DEFAULT_TERMINAL_SESSION_TOKEN_TTL_MS = 5 * 60 * 1000;
const TERMINAL_SESSION_TOKEN_BYTES = 32;

export interface ParsedCustomImageSetupSshCommand {
  username: string;
  host: string;
  port: number;
}

export interface EnvironmentCustomImageTerminalSessionRecord {
  setupSessionId: string;
  companyId: string;
  environmentId: string;
  provider: string;
  connectionType: "ssh";
  ssh: ParsedCustomImageSetupSshCommand;
  createdAt: Date;
  expiresAt: Date;
}

export interface MintedEnvironmentCustomImageTerminalSession {
  token: string;
  session: EnvironmentCustomImageTerminalSessionRecord;
}

function parsePort(value: string): number | null {
  if (!/^\d{1,5}$/.test(value)) return null;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : null;
}

function parseDestination(value: string): Pick<ParsedCustomImageSetupSshCommand, "username" | "host"> | null {
  if (value.startsWith("-")) return null;
  const parts = value.split("@");
  if (parts.length !== 2) return null;
  const [username, host] = parts;
  if (!username || !host) return null;
  if (!/^[^\s@/]+$/.test(username)) return null;
  if (!/^[^\s@/:]+$/.test(host)) return null;
  return { username, host };
}

export function parseCustomImageSetupSshCommand(command: string): ParsedCustomImageSetupSshCommand | null {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  if (tokens[0] !== "ssh") return null;

  if (tokens.length === 2) {
    const destination = parseDestination(tokens[1]!);
    return destination ? { ...destination, port: 22 } : null;
  }

  if (tokens.length !== 4) return null;

  if (tokens[1] === "-p") {
    const port = parsePort(tokens[2]!);
    const destination = parseDestination(tokens[3]!);
    return port && destination ? { ...destination, port } : null;
  }

  if (tokens[2] === "-p") {
    const destination = parseDestination(tokens[1]!);
    const port = parsePort(tokens[3]!);
    return port && destination ? { ...destination, port } : null;
  }

  return null;
}

function hashTerminalSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function minDate(dates: Date[]): Date {
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function toValidFutureDate(value: Date | string | null | undefined, now: Date): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime() > now.getTime() ? date : null;
}

export class EnvironmentCustomImageTerminalSessionStore {
  private readonly sessions = new Map<string, EnvironmentCustomImageTerminalSessionRecord>();

  create(input: {
    setupSessionId: string;
    companyId: string;
    environmentId: string;
    provider: string;
    ssh: ParsedCustomImageSetupSshCommand;
    setupExpiresAt: Date | string;
    connectionExpiresAt?: Date | string | null;
    now?: Date;
  }): MintedEnvironmentCustomImageTerminalSession {
    const now = input.now ?? new Date();
    this.cleanupExpired(now);

    const candidateExpirations = [
      new Date(now.getTime() + DEFAULT_TERMINAL_SESSION_TOKEN_TTL_MS),
      toValidFutureDate(input.setupExpiresAt, now),
      toValidFutureDate(input.connectionExpiresAt, now),
    ].filter((date): date is Date => date !== null);
    const expiresAt = minDate(candidateExpirations);
    const token = randomBytes(TERMINAL_SESSION_TOKEN_BYTES).toString("base64url");
    const session: EnvironmentCustomImageTerminalSessionRecord = {
      setupSessionId: input.setupSessionId,
      companyId: input.companyId,
      environmentId: input.environmentId,
      provider: input.provider,
      connectionType: "ssh",
      ssh: input.ssh,
      createdAt: now,
      expiresAt,
    };
    this.sessions.set(hashTerminalSessionToken(token), session);
    return { token, session };
  }

  get(token: string, now = new Date()): EnvironmentCustomImageTerminalSessionRecord | null {
    if (!token) return null;
    const key = hashTerminalSessionToken(token);
    const session = this.sessions.get(key) ?? null;
    if (!session) return null;
    if (session.expiresAt.getTime() <= now.getTime()) {
      this.sessions.delete(key);
      return null;
    }
    return session;
  }

  delete(token: string): boolean {
    if (!token) return false;
    return this.sessions.delete(hashTerminalSessionToken(token));
  }

  cleanupExpired(now = new Date()): number {
    let removed = 0;
    for (const [key, session] of this.sessions) {
      if (session.expiresAt.getTime() <= now.getTime()) {
        this.sessions.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clear(): void {
    this.sessions.clear();
  }
}

export const environmentCustomImageTerminalSessionStore =
  new EnvironmentCustomImageTerminalSessionStore();
