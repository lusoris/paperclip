import { describe, expect, it } from "vitest";
import {
  EnvironmentCustomImageTerminalSessionStore,
  parseCustomImageSetupSshCommand,
} from "./environment-custom-image-terminal-sessions.js";

describe("parseCustomImageSetupSshCommand", () => {
  it("parses supported SSH command shapes", () => {
    expect(parseCustomImageSetupSshCommand("ssh user@example.test")).toEqual({
      username: "user",
      host: "example.test",
      port: 22,
    });
    expect(parseCustomImageSetupSshCommand("ssh user@example.test -p 2222")).toEqual({
      username: "user",
      host: "example.test",
      port: 2222,
    });
    expect(parseCustomImageSetupSshCommand("ssh -p 2200 user@example.test")).toEqual({
      username: "user",
      host: "example.test",
      port: 2200,
    });
  });

  it("rejects unsupported or ambiguous SSH command shapes", () => {
    expect(parseCustomImageSetupSshCommand("scp user@example.test")).toBeNull();
    expect(parseCustomImageSetupSshCommand("ssh user@example.test -i key")).toBeNull();
    expect(parseCustomImageSetupSshCommand("ssh user@example.test:2222")).toBeNull();
    expect(parseCustomImageSetupSshCommand("ssh -p not-a-port user@example.test")).toBeNull();
    expect(parseCustomImageSetupSshCommand("ssh -p 70000 user@example.test")).toBeNull();
    expect(parseCustomImageSetupSshCommand("ssh user@@example.test")).toBeNull();
  });
});

describe("EnvironmentCustomImageTerminalSessionStore", () => {
  it("mints opaque tokens and caps expiry by setup and provider payload expiry", () => {
    const store = new EnvironmentCustomImageTerminalSessionStore();
    const now = new Date("2026-06-25T20:00:00.000Z");
    const minted = store.create({
      setupSessionId: "session-1",
      companyId: "company-1",
      environmentId: "env-1",
      provider: "daytona",
      ssh: { username: "ssh-token-secret", host: "203.0.113.10", port: 2222 },
      setupExpiresAt: new Date("2026-06-25T20:30:00.000Z"),
      connectionExpiresAt: new Date("2026-06-25T20:02:00.000Z"),
      now,
    });

    expect(minted.token).toHaveLength(43);
    expect(minted.session.expiresAt.toISOString()).toBe("2026-06-25T20:02:00.000Z");
    expect(store.get(minted.token, new Date("2026-06-25T20:01:59.000Z"))?.ssh).toEqual({
      username: "ssh-token-secret",
      host: "203.0.113.10",
      port: 2222,
    });
    expect(store.get(minted.token, new Date("2026-06-25T20:02:00.000Z"))).toBeNull();
  });
});
