import type { PluginDetailTabProps } from "@paperclipai/plugin-sdk/ui";
import { usePluginData, usePluginToast } from "@paperclipai/plugin-sdk/ui";
import type { WorkspaceDiffResponse } from "@paperclipai/plugin-sdk";
import { DIFFS_TAG_NAME, getSingularPatch } from "@pierre/diffs";
import type { PatchDiffProps } from "@pierre/diffs/react";
import { useFileDiffInstance } from "@pierre/diffs/react";
import { createElement, useEffect, useMemo, useState } from "react";
import {
  diffSummary,
  fileName,
  nextExpandedFileSet,
  statusLabel,
  toFileViewModels,
  type DiffFileViewModel,
  type DiffPatchViewModel,
  type DiffRenderMode,
} from "../diff-model.js";

type WorkspaceDiffData = WorkspaceDiffResponse;
type WorkspacePatchDiffOptions = PatchDiffProps<undefined>["options"];

function buttonClass(active = false) {
  return [
    "inline-flex h-8 items-center justify-center rounded-md border px-2.5 text-xs font-medium transition-colors",
    active
      ? "border-foreground/20 bg-foreground text-background"
      : "border-border bg-background text-muted-foreground hover:text-foreground",
  ].join(" ");
}

function iconButtonClass(active = false) {
  return [
    "inline-flex h-7 w-7 items-center justify-center rounded-md border text-xs transition-colors",
    active
      ? "border-foreground/20 bg-foreground text-background"
      : "border-border bg-background text-muted-foreground hover:text-foreground",
  ].join(" ");
}

function warningText(file: DiffFileViewModel) {
  if (file.binary) return "Binary file";
  if (file.oversized) return "Too large to render";
  if (file.truncated) return "Patch truncated";
  if (file.warnings.length > 0) return file.warnings[0]?.message ?? "Diff warning";
  if (file.patches.every((patch) => !patch.patch)) return "No text patch";
  return null;
}

const PATCH_KIND_LABELS: Record<DiffPatchViewModel["kind"], string> = {
  staged: "Staged",
  unstaged: "Unstaged",
  head: "Head",
  untracked: "Untracked",
};

function patchKindLabel(kind: DiffPatchViewModel["kind"]) {
  return PATCH_KIND_LABELS[kind] ?? "Patch";
}

function patchWarningText(patch: DiffPatchViewModel) {
  if (patch.binary) return "Binary file";
  if (patch.oversized) return "Too large to render";
  if (patch.truncated) return "Patch truncated";
  if (patch.warnings.length > 0) return patch.warnings[0]?.message ?? "Diff warning";
  if (!patch.patch) return "No text patch";
  return null;
}

function FileRow({
  file,
  active,
  expanded,
  onSelect,
  onToggle,
  onCopy,
}: {
  file: DiffFileViewModel;
  active: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onCopy: () => void;
}) {
  const warning = warningText(file);
  const expandLabel = expanded ? "Collapse file" : "Expand file";
  const fileAriaLabel = expanded ? `Collapse ${file.path}` : `Expand ${file.path}`;

  return (
    <div
      className={[
        "group border-b border-border/70 px-3 py-2 last:border-b-0",
        active ? "bg-accent/60" : "bg-background hover:bg-muted/45",
      ].join(" ")}
    >
      <div key="main" className="flex min-w-0 items-start gap-2">
        <button
          key="toggle"
          type="button"
          className="mt-0.5 text-muted-foreground hover:text-foreground"
          onClick={onToggle}
          title={expandLabel}
          aria-label={fileAriaLabel}
        >
          {expanded ? "−" : "+"}
        </button>
        <button
          key="select"
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onSelect}
        >
          <div key="name" className="truncate text-sm font-medium text-foreground">{fileName(file.path)}</div>
          <div key="path" className="truncate font-mono text-[11px] text-muted-foreground">{file.path}</div>
        </button>
        <button
          key="copy"
          type="button"
          className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          onClick={onCopy}
          title="Copy path"
          aria-label={`Copy ${file.path}`}
        >
          ⧉
        </button>
      </div>
      <div key="meta" className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-5 text-[11px] text-muted-foreground">
        <span key="status">{statusLabel(file.status)}</span>
        <span key="additions" className="font-mono text-emerald-700 dark:text-emerald-300">{`+${file.additions}`}</span>
        <span key="deletions" className="font-mono text-red-700 dark:text-red-300">{`-${file.deletions}`}</span>
        {warning ? <span key="warning" className="text-amber-700 dark:text-amber-300">{warning}</span> : null}
      </div>
    </div>
  );
}

// The upstream React wrapper emits React 19 key warnings for its internal slot array.
// This mounts the same Diffs custom element through the exported imperative hook.
function WorkspacePatchDiff({
  patch,
  options,
}: {
  patch: string;
  options: WorkspacePatchDiffOptions;
}) {
  const fileDiff = useMemo(() => getSingularPatch(patch), [patch]);
  const { ref } = useFileDiffInstance({
    fileDiff,
    options,
    metrics: undefined,
    lineAnnotations: undefined,
    selectedLines: undefined,
    prerenderedHTML: undefined,
    hasGutterRenderUtility: false,
    hasCustomHeader: false,
    disableWorkerPool: false,
  });

  return createElement(DIFFS_TAG_NAME, { ref });
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border bg-background px-4 py-8 text-center">
      <div className="text-sm font-medium text-foreground">No workspace changes</div>
      <div className="mt-1 text-sm text-muted-foreground">
        The workspace matches its current comparison target.
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
      Loading workspace changes…
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

function FileDiffPanel({
  file,
  mode,
}: {
  file: DiffFileViewModel;
  mode: DiffRenderMode;
}) {
  const warning = warningText(file);
  if (warning) {
    return (
      <div className="border border-dashed border-border bg-background px-4 py-6 text-sm text-muted-foreground">
        {warning ?? "No renderable patch is available for this file."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {file.patches.map((patch) => {
        const patchWarning = patchWarningText(patch);
        return (
          <div key={patch.kind} className="overflow-hidden border border-border bg-background">
            {file.patches.length > 1 ? (
              <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{patchKindLabel(patch.kind)}</span>
                <span className="font-mono text-emerald-700 dark:text-emerald-300">{`+${patch.additions}`}</span>
                <span className="font-mono text-red-700 dark:text-red-300">{`-${patch.deletions}`}</span>
              </div>
            ) : null}
            {patchWarning || !patch.patch ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                {patchWarning ?? "No renderable patch is available for this file."}
              </div>
            ) : (
              <WorkspacePatchDiff
                patch={patch.patch}
                options={{
                  diffStyle: mode,
                  overflow: "scroll",
                  disableLineNumbers: false,
                  themeType: "system",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ChangesTab({ context }: PluginDetailTabProps) {
  const toast = usePluginToast();
  const [mode, setMode] = useState<DiffRenderMode>("split");
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const params = useMemo(() => ({
    workspaceId: context.entityId,
    companyId: context.companyId ?? "",
    view: "working-tree",
    includeUntracked,
  }), [context.companyId, context.entityId, includeUntracked]);

  const { data, loading, error, refresh } = usePluginData<WorkspaceDiffData>("workspace-diff", params);
  const files = useMemo(() => toFileViewModels(data), [data]);
  const summary = useMemo(() => diffSummary(data), [data]);
  const selectedFile = files.find((file) => file.path === selectedPath) ?? files[0] ?? null;
  const compareLabel = `${data?.baseRef ? `base ${data.baseRef}` : "working tree"}${data?.headSha ? ` · ${data.headSha.slice(0, 12)}` : ""}`;

  useEffect(() => {
    if (files.length === 0) {
      setExpandedFiles(new Set());
      setSelectedPath(null);
      return;
    }
    setExpandedFiles((current) => current.size > 0 ? current : new Set(files.map((file) => file.path)));
    setSelectedPath((current) => files.some((file) => file.path === current) ? current : files[0]?.path ?? null);
  }, [files]);

  const copyPath = async (filePath: string) => {
    try {
      await navigator.clipboard.writeText(filePath);
      toast({ title: "Path copied", body: filePath });
    } catch {
      toast({ title: "Copy failed", body: filePath, tone: "error" });
    }
  };

  return (
    <div className="space-y-3">
      <div key="toolbar" className="flex flex-col gap-3 border-b border-border pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div key="summary" className="min-w-0">
          <div key="summary-line" className="flex flex-wrap items-center gap-2 text-sm">
            <span key="changed" className="font-medium text-foreground">{summary.changedLabel}</span>
            <span key="lines" className="font-mono text-xs text-muted-foreground">{summary.lineLabel}</span>
            {summary.truncated ? (
              <span key="truncated" className="text-xs text-amber-700 dark:text-amber-300">Truncated</span>
            ) : null}
            {summary.warningCount > 0 ? (
              <span key="warnings" className="text-xs text-muted-foreground">{summary.warningCount} warnings</span>
            ) : null}
          </div>
          <div key="compare" className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {compareLabel}
          </div>
        </div>

        <div key="actions" className="flex flex-wrap items-center gap-2">
          <div key="layout" className="inline-flex gap-1" aria-label="Diff layout">
            <button key="split" type="button" className={buttonClass(mode === "split")} onClick={() => setMode("split")}>
              Split
            </button>
            <button key="unified" type="button" className={buttonClass(mode === "unified")} onClick={() => setMode("unified")}>
              Unified
            </button>
          </div>
          <button
            key="untracked"
            type="button"
            className={buttonClass(includeUntracked)}
            onClick={() => setIncludeUntracked((value) => !value)}
          >
            Untracked
          </button>
          <button key="refresh" type="button" className={buttonClass(false)} onClick={() => refresh()}>
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error.message} />
      ) : files.length === 0 ? (
        <EmptyState />
      ) : (
        <div key="content" className="grid min-h-[560px] gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside key="files" className="min-w-0 border border-border bg-background">
            <div key="heading" className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Files
            </div>
            <div key="list" className="max-h-[70vh] overflow-auto">
              {files.map((file) => (
                <FileRow
                  key={file.path}
                  file={file}
                  active={file.path === selectedFile?.path}
                  expanded={expandedFiles.has(file.path)}
                  onSelect={() => setSelectedPath(file.path)}
                  onToggle={() => setExpandedFiles((current) => nextExpandedFileSet(current, file.path))}
                  onCopy={() => void copyPath(file.path)}
                />
              ))}
            </div>
          </aside>

          <main key="diffs" className="min-w-0 space-y-3">
            {files
              .filter((file) => expandedFiles.has(file.path))
              .map((file) => (
                <section
                  key={file.path}
                  className={file.path === selectedFile?.path ? "scroll-mt-20" : undefined}
                >
                  <div key="header" className="flex min-w-0 items-center justify-between gap-3 border border-b-0 border-border bg-muted/35 px-3 py-2">
                    <button
                      key="select"
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => setSelectedPath(file.path)}
                    >
                      <div key="path" className="truncate text-sm font-medium">{file.path}</div>
                      {file.oldPath ? (
                        <div key="old-path" className="truncate font-mono text-[11px] text-muted-foreground">
                          from {file.oldPath}
                        </div>
                      ) : null}
                    </button>
                    <div key="actions" className="flex shrink-0 items-center gap-1">
                      <button
                        key="copy"
                        type="button"
                        className={iconButtonClass(false)}
                        title="Copy path"
                        aria-label={`Copy ${file.path}`}
                        onClick={() => void copyPath(file.path)}
                      >
                        ⧉
                      </button>
                      <button
                        key="collapse"
                        type="button"
                        className={iconButtonClass(false)}
                        title="Collapse file"
                        aria-label={`Collapse ${file.path}`}
                        onClick={() => setExpandedFiles((current) => nextExpandedFileSet(current, file.path))}
                      >
                        −
                      </button>
                    </div>
                  </div>
                  <FileDiffPanel key="diff" file={file} mode={mode} />
                </section>
              ))}
          </main>
        </div>
      )}
    </div>
  );
}
