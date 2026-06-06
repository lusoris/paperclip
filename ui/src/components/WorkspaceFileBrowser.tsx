import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Cloud,
  FileCode2,
  FolderOpen,
  FolderSearch,
  Loader2,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fileResourcesApi } from "@/api/file-resources";
import { ApiError } from "@/api/client";
import { queryKeys } from "@/lib/queryKeys";
import type {
  WorkspaceFileListItem,
  WorkspaceFileListMode,
  WorkspaceFileSelector,
} from "@paperclipai/shared";

const WORKSPACE_OPTIONS: ReadonlyArray<{ value: WorkspaceFileSelector; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "execution", label: "Execution" },
  { value: "project", label: "Project" },
];

const MODE_OPTIONS: ReadonlyArray<{ value: Extract<WorkspaceFileListMode, "changed" | "all">; label: string }> = [
  { value: "changed", label: "Recent changes" },
  { value: "all", label: "All files" },
];

const LIST_LIMIT = 100;

function formatBytes(size: number | null | undefined): string | null {
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx < 0 ? path : path.slice(idx + 1);
}

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx < 0 ? "" : path.slice(0, idx + 1);
}

/**
 * Maps a server `unavailableReason` (or transport error) to a calm, board-readable
 * explanation. Substring matching keeps it resilient to small reason-string changes
 * on the server, mirroring describeDenial() in FileViewerSheet.
 */
export function describeUnavailable(reason: string): { title: string; body: string; icon: ReactNode } {
  const lower = reason.toLowerCase();
  if (lower.includes("remote")) {
    return {
      icon: <Cloud aria-hidden="true" className="h-5 w-5 text-muted-foreground" />,
      title: "Remote workspace",
      body: "This issue runs in a remote workspace, so its files can't be browsed here yet.",
    };
  }
  if (lower.includes("no_workspace") || lower.includes("no_local")) {
    return {
      icon: <FolderOpen aria-hidden="true" className="h-5 w-5 text-muted-foreground" />,
      title: "No workspace yet",
      body: "This issue does not have a workspace to browse. Files appear here once a run creates one.",
    };
  }
  if (lower.includes("changed")) {
    return {
      icon: <AlertTriangle aria-hidden="true" className="h-5 w-5 text-amber-500" />,
      title: "Recent changes unavailable",
      body: "Recent-change tracking isn't available for this workspace. Browse all files instead.",
    };
  }
  if (lower.includes("archiv") || lower.includes("cleaned") || lower.includes("unavailable")) {
    return {
      icon: <FolderOpen aria-hidden="true" className="h-5 w-5 text-muted-foreground" />,
      title: "Workspace cleaned up",
      body: "The workspace for this issue has been cleaned up, so its files can no longer be browsed.",
    };
  }
  return {
    icon: <AlertTriangle aria-hidden="true" className="h-5 w-5 text-amber-500" />,
    title: "Workspace unavailable",
    body: "These workspace files can't be browsed right now.",
  };
}

function StateMessage({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 px-1 py-8 text-sm">
      <div className="flex items-start gap-3">
        {icon}
        <div className="space-y-1">
          <p className="font-medium text-foreground">{title}</p>
          {body ? <p className="text-muted-foreground">{body}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex shrink-0 rounded-md border border-border p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded px-2 py-1 text-xs transition-colors",
            value === option.value
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface WorkspaceFileRowProps {
  item: WorkspaceFileListItem;
  onOpen: (item: WorkspaceFileListItem) => void;
}

function WorkspaceFileRow({ item, onOpen }: WorkspaceFileRowProps) {
  const name = basename(item.displayPath);
  const dir = dirname(item.displayPath);
  const size = formatBytes(item.byteSize);
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      title={item.displayPath}
      className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <FileCode2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 items-baseline gap-0 overflow-hidden">
        {dir ? (
          <span className="min-w-0 shrink truncate font-mono text-xs text-muted-foreground">
            {dir}
          </span>
        ) : null}
        <span className="shrink-0 truncate font-mono text-xs text-foreground">{name}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
        <span className="capitalize">{item.previewKind}</span>
        {size ? <span className="tabular-nums">{size}</span> : null}
      </span>
    </button>
  );
}

export interface WorkspaceFileBrowserProps {
  issueId: string;
  onOpen: (ref: { path: string; workspace: WorkspaceFileSelector }) => void;
  className?: string;
}

export function WorkspaceFileBrowser({ issueId, onOpen, className }: WorkspaceFileBrowserProps) {
  const [workspace, setWorkspace] = useState<WorkspaceFileSelector>("auto");
  const [mode, setMode] = useState<Extract<WorkspaceFileListMode, "changed" | "all">>("changed");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(searchInput.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const q = debouncedQuery || null;

  const listQuery = useQuery({
    queryKey: queryKeys.issues.fileResources(issueId, {
      workspace,
      mode,
      q,
      limit: LIST_LIMIT,
    }),
    queryFn: () =>
      fileResourcesApi.list(issueId, { workspace, mode, q, limit: LIST_LIMIT }),
    retry: false,
    staleTime: 15_000,
  });

  const data = listQuery.data;
  const items = data?.items ?? [];
  const workspaceLabel = data?.workspace?.workspaceLabel ?? null;

  const liveRegionRef = useRef<HTMLDivElement>(null);
  const announcement = useMemo(() => {
    if (listQuery.isFetching) return "Loading workspace files…";
    if (listQuery.isError) return "Unable to load workspace files.";
    if (data?.state === "unavailable") return describeUnavailable(data.unavailableReason ?? "").title;
    if (items.length === 0) return "No matching files.";
    return `${items.length} file${items.length === 1 ? "" : "s"} found.`;
  }, [data, items.length, listQuery.isError, listQuery.isFetching]);

  let body: ReactNode;
  if (listQuery.isFetching && !data) {
    body = (
      <div className="space-y-1.5 py-2" aria-busy="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-2 px-2 py-1.5">
            <div className="h-3.5 w-3.5 shrink-0 rounded bg-muted" />
            <div className="h-3 flex-1 rounded bg-muted" style={{ maxWidth: `${80 - index * 8}%` }} />
          </div>
        ))}
      </div>
    );
  } else if (listQuery.isError) {
    const status = listQuery.error instanceof ApiError ? listQuery.error.status : 0;
    const fallback =
      status === 404
        ? "Workspace browsing isn't available for this issue."
        : "Something went wrong loading workspace files.";
    body = (
      <StateMessage
        icon={<AlertTriangle aria-hidden="true" className="h-5 w-5 text-amber-500" />}
        title="Couldn't load files"
        body={fallback}
        action={
          <Button type="button" variant="ghost" size="sm" onClick={() => void listQuery.refetch()}>
            Retry
          </Button>
        }
      />
    );
  } else if (data?.state === "unavailable") {
    const detail = describeUnavailable(data.unavailableReason ?? "");
    const isChangedReason = (data.unavailableReason ?? "").toLowerCase().includes("changed");
    body = (
      <StateMessage
        icon={detail.icon}
        title={detail.title}
        body={detail.body}
        action={
          isChangedReason && mode !== "all" ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setMode("all")}>
              Browse all files
            </Button>
          ) : null
        }
      />
    );
  } else if (items.length === 0) {
    body = (
      <StateMessage
        icon={<Search aria-hidden="true" className="h-5 w-5 text-muted-foreground" />}
        title={debouncedQuery ? "No files match your search" : "No files to show"}
        body={
          debouncedQuery
            ? "Try a different path or name, or switch to all files."
            : mode === "changed"
              ? "No recent changes detected. Switch to all files to browse everything."
              : "This workspace has no browsable files."
        }
        action={
          mode !== "all" ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setMode("all")}>
              Browse all files
            </Button>
          ) : null
        }
      />
    );
  } else {
    body = (
      <div className="space-y-0.5 py-1">
        {items.map((item) => (
          <WorkspaceFileRow
            key={`${item.workspaceId}:${item.relativePath}`}
            item={item}
            onOpen={(picked) => onOpen({ path: picked.relativePath, workspace })}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      <div className="flex items-center gap-2">
        <FolderSearch aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search workspace files by path or name"
            aria-label="Search workspace files"
            className="h-8 pl-8 font-mono text-xs"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl label="Workspace" value={workspace} options={WORKSPACE_OPTIONS} onChange={setWorkspace} />
        <SegmentedControl label="File set" value={mode} options={MODE_OPTIONS} onChange={setMode} />
      </div>

      {workspaceLabel ? (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate" title={workspaceLabel}>
            From {workspaceLabel}
          </span>
          {listQuery.isFetching ? (
            <Loader2 aria-hidden="true" className="h-3 w-3 shrink-0 animate-spin" />
          ) : null}
          {data?.truncated ? (
            <>
              <span aria-hidden="true" className="opacity-50">·</span>
              <span>Showing first {items.length}</span>
            </>
          ) : null}
        </div>
      ) : null}

      <div ref={liveRegionRef} aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </div>
  );
}
