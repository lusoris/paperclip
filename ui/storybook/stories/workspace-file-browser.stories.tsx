import { useMemo, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { WorkspaceFileListItem, WorkspaceFileListResponse } from "@paperclipai/shared";
import { WorkspaceFileBrowser } from "@/components/WorkspaceFileBrowser";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Screenshot review surface for PAP-10511 — the issue-page "Browse workspace"
 * fallback. Each story seeds the react-query cache for the default browse query
 * (workspace=auto, mode=changed) so the component renders without a backend.
 */

const ISSUE_ID = "issue-browse-demo";

function seedKey(issueId: string) {
  return queryKeys.issues.fileResources(issueId, {
    workspace: "auto",
    mode: "changed",
    q: null,
    limit: 100,
  });
}

function item(relativePath: string, overrides: Partial<WorkspaceFileListItem> = {}): WorkspaceFileListItem {
  return {
    kind: "file",
    provider: "git_worktree",
    title: relativePath.split("/").pop() ?? relativePath,
    relativePath,
    displayPath: relativePath,
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

const availableData: WorkspaceFileListResponse = {
  kind: "workspace_file_list",
  state: "available",
  workspace: {
    provider: "git_worktree",
    workspaceLabel: "Isolated workspace",
    workspaceKind: "execution_workspace",
    workspaceId: "ws-1",
  },
  query: { workspace: "auto", mode: "changed", q: null, limit: 100 },
  items: [
    item("ui/src/components/WorkspaceFileBrowser.tsx"),
    item("ui/src/components/FileViewerSheet.tsx", { byteSize: 28_400 }),
    item("server/src/routes/file-resources.ts", { byteSize: 8_120 }),
    item("packages/shared/src/types/workspace-file-resource.ts", { byteSize: 3_200 }),
    item("docs/screenshots/preview.png", { previewKind: "image", contentType: "image/png", byteSize: 102_400 }),
    item(
      "server/src/services/very/deeply/nested/directory/structure/that/keeps/going/workspace-file-resources.ts",
      { byteSize: 16_900 },
    ),
  ],
  scannedCount: 412,
  truncated: true,
};

function unavailable(reason: string): WorkspaceFileListResponse {
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

function SheetFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[560px] w-[420px] flex-col overflow-hidden rounded-lg border border-border bg-background">
      <div className="border-b border-border p-3">
        <p className="text-sm font-medium text-foreground">Browse workspace</p>
        <p className="text-xs text-muted-foreground">Search and preview files from this issue's workspace.</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-4">{children}</div>
    </div>
  );
}

function Demo({ data }: { data: WorkspaceFileListResponse }) {
  const queryClient = useQueryClient();
  useMemo(() => {
    queryClient.setQueryData(seedKey(ISSUE_ID), data);
  }, [queryClient, data]);
  return (
    <SheetFrame>
      <WorkspaceFileBrowser
        issueId={ISSUE_ID}
        onOpen={(ref) => console.log("open", ref)}
        className="min-h-0 flex-1"
      />
    </SheetFrame>
  );
}

const meta: Meta<typeof Demo> = {
  title: "Issue/Workspace File Browser",
  component: Demo,
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof Demo>;

export const RecentChanges: Story = { args: { data: availableData } };
export const NoWorkspace: Story = { args: { data: unavailable("no_workspace") } };
export const RemoteWorkspace: Story = { args: { data: unavailable("remote_workspace") } };
export const CleanedUpWorkspace: Story = { args: { data: unavailable("workspace_unavailable") } };
export const RecentChangesUnavailable: Story = { args: { data: unavailable("changed_unavailable") } };
