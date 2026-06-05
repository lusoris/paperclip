import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { artifactsApi, type ArtifactKindFilter } from "../api/artifacts";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { ArtifactCard } from "../components/artifacts/ArtifactCard";
import { cn } from "@/lib/utils";

const KIND_FILTERS: { value: ArtifactKindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "document", label: "Documents" },
  { value: "text", label: "Text" },
  { value: "file", label: "Files" },
];

export function Artifacts() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [kind, setKind] = useState<ArtifactKindFilter>("all");

  useEffect(() => {
    setBreadcrumbs([{ label: "Artifacts" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.artifacts.list(selectedCompanyId!, kind),
    queryFn: () => artifactsApi.list(selectedCompanyId!, { kind }),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Package} message="Select a company to view artifacts." />;
  }

  const artifacts = data?.artifacts ?? [];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Work your agents have produced — documents, media, and files — across this company's issues.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter artifacts by type">
        {KIND_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            role="tab"
            aria-selected={kind === filter.value}
            onClick={() => setKind(filter.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              kind === filter.value
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {isLoading ? (
        <PageSkeleton variant="list" />
      ) : artifacts.length === 0 ? (
        <EmptyState
          icon={Package}
          message={
            kind === "all"
              ? "No artifacts yet. Agent-produced documents, media, and files will appear here."
              : "No artifacts of this type yet."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {artifacts.map((artifact) => (
            <ArtifactCard key={`${artifact.source}:${artifact.id}`} artifact={artifact} />
          ))}
        </div>
      )}
    </div>
  );
}
