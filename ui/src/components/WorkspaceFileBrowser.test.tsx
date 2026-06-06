// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { WorkspaceFileListItem, WorkspaceFileListResponse } from "@paperclipai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceFileBrowser, describeUnavailable } from "./WorkspaceFileBrowser";

const useQueryMock = vi.fn();

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: (options: unknown) => useQueryMock(options),
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function createItem(overrides: Partial<WorkspaceFileListItem> = {}): WorkspaceFileListItem {
  return {
    kind: "file",
    provider: "git_worktree",
    title: "IssueDetail.tsx",
    relativePath: "ui/src/pages/IssueDetail.tsx",
    displayPath: "ui/src/pages/IssueDetail.tsx",
    workspaceLabel: "Isolated workspace",
    workspaceKind: "execution_workspace",
    workspaceId: "ws-1",
    contentType: "text/plain; charset=utf-8",
    byteSize: 2048,
    modifiedAt: null,
    previewKind: "text",
    capabilities: { preview: true, download: false, listChildren: false },
    ...overrides,
  };
}

function availableResponse(items: WorkspaceFileListItem[]): WorkspaceFileListResponse {
  return {
    kind: "workspace_file_list",
    state: "available",
    workspace: {
      provider: "git_worktree",
      workspaceLabel: "Isolated workspace",
      workspaceKind: "execution_workspace",
      workspaceId: "ws-1",
    },
    query: { workspace: "auto", mode: "changed", q: null, limit: 100 },
    items,
    scannedCount: items.length,
    truncated: false,
  };
}

function unavailableResponse(reason: string): WorkspaceFileListResponse {
  return {
    kind: "workspace_file_list",
    state: "unavailable",
    unavailableReason: reason,
    workspace: null,
    query: { workspace: "auto", mode: "changed", q: null, limit: 100 },
    items: [],
    scannedCount: 0,
    truncated: false,
  };
}

describe("WorkspaceFileBrowser", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    useQueryMock.mockReset();
  });

  afterEach(() => {
    container.remove();
  });

  function renderBrowser(onOpen = vi.fn()) {
    const root = createRoot(container);
    act(() => {
      root.render(<WorkspaceFileBrowser issueId="issue-1" onOpen={onOpen} />);
    });
    return { root, onOpen };
  }

  it("lists available files and opens one with its relative path and workspace selector", () => {
    useQueryMock.mockReturnValue({
      data: availableResponse([createItem(), createItem({ relativePath: "README.md", displayPath: "README.md" })]),
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const { onOpen } = renderBrowser();

    expect(container.textContent).toContain("From Isolated workspace");
    const fileButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.getAttribute("title") === "ui/src/pages/IssueDetail.tsx",
    );
    expect(fileButton).not.toBeUndefined();

    act(() => {
      fileButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(onOpen).toHaveBeenCalledWith({ path: "ui/src/pages/IssueDetail.tsx", workspace: "auto" });
  });

  it("shows the remote-workspace state without any file rows", () => {
    useQueryMock.mockReturnValue({
      data: unavailableResponse("remote_workspace"),
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderBrowser();
    expect(container.textContent).toContain("Remote workspace");
    expect(container.textContent).not.toContain("From Isolated workspace");
  });

  it("shows the no-workspace state when the issue has no workspace", () => {
    useQueryMock.mockReturnValue({
      data: unavailableResponse("no_workspace"),
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderBrowser();
    expect(container.textContent).toContain("No workspace yet");
  });

  it("offers a fallback to all files when recent-change tracking is unavailable", () => {
    useQueryMock.mockReturnValue({
      data: unavailableResponse("changed_unavailable"),
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderBrowser();
    expect(container.textContent).toContain("Recent changes unavailable");
    const fallback = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Browse all files"),
    );
    expect(fallback).not.toBeUndefined();
  });
});

describe("describeUnavailable", () => {
  it("maps each documented reason to a distinct, human-readable title", () => {
    expect(describeUnavailable("remote_workspace").title).toBe("Remote workspace");
    expect(describeUnavailable("no_workspace").title).toBe("No workspace yet");
    expect(describeUnavailable("no_local_workspace").title).toBe("No workspace yet");
    expect(describeUnavailable("workspace_unavailable").title).toBe("Workspace cleaned up");
    expect(describeUnavailable("changed_unavailable").title).toBe("Recent changes unavailable");
  });

  it("never leaks the raw reason code as the body", () => {
    for (const reason of ["remote_workspace", "no_workspace", "workspace_unavailable", "weird_unknown"]) {
      const { body } = describeUnavailable(reason);
      expect(body).not.toBe(reason);
      expect(body).not.toMatch(/^[a-z_]+$/);
    }
  });
});
