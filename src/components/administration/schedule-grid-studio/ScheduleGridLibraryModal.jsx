import { useMemo, useState } from "react";
import {
  Copy,
  FileText,
  FolderOpen,
  RefreshCw,
  Search,
  Star,
  Trash2,
} from "lucide-react";

import Badge from "../../shared/Badge";
import ConfirmDialog from "../../shared/ConfirmDialog";
import Modal from "../../shared/Modal";

const getTimestamp = (value) => {
  if (typeof value === "number") return value;
  if (value?.toMillis) return value.toMillis();
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getStudioDocument = (template) => template?.studio || {};

const ScheduleGridLibraryModal = ({
  isOpen,
  onClose,
  templates = [],
  isLoading = false,
  onRefresh,
  onOpen,
  onDuplicate,
  onToggleFavorite,
  onDelete,
}) => {
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("all");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const folders = useMemo(
    () =>
      Array.from(
        new Set(
          templates
            .map((template) => getStudioDocument(template).folder || "Unfiled")
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [templates],
  );

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return templates
      .filter((template) => {
        const studio = getStudioDocument(template);
        if (folder !== "all" && (studio.folder || "Unfiled") !== folder) {
          return false;
        }
        if (!normalizedQuery) return true;
        return [
          studio.name,
          template.title,
          studio.folder,
          studio.building,
          studio.room,
          studio.semester,
          ...(studio.tags || []),
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(normalizedQuery),
          );
      })
      .sort((a, b) => {
        const aStudio = getStudioDocument(a);
        const bStudio = getStudioDocument(b);
        if (Boolean(aStudio.favorite) !== Boolean(bStudio.favorite)) {
          return aStudio.favorite ? -1 : 1;
        }
        return (
          getTimestamp(b.updatedAt || b.createdAt) -
          getTimestamp(a.updatedAt || a.createdAt)
        );
      });
  }, [folder, query, templates]);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setError("");
    try {
      await onDelete?.(pendingDelete);
      setPendingDelete(null);
    } catch (deleteError) {
      setError(deleteError?.message || "Could not delete this template.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="xl"
        title="Schedule template library"
        subtitle="Find, organize, duplicate, and reopen grids without leaving the dashboard."
        bodyClassName="flex min-h-0 flex-col overflow-hidden"
      >
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Search schedule templates</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="form-input w-full pl-9"
                placeholder="Search name, room, semester, or tag"
              />
            </label>
            <label className="sm:w-52">
              <span className="sr-only">Filter by folder</span>
              <select
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
                className="form-select w-full"
              >
                <option value="all">All folders</option>
                {folders.map((folderName) => (
                  <option key={folderName} value={folderName}>
                    {folderName}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={onRefresh}
              className="btn-secondary shrink-0"
              disabled={isLoading}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Refresh
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
            <span>
              {filteredTemplates.length} template
              {filteredTemplates.length === 1 ? "" : "s"}
            </span>
            <span>Favorites appear first</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error ? (
            <div className="alert alert-error mb-4" role="alert">
              {error}
            </div>
          ) : null}

          {isLoading && templates.length === 0 ? (
            <div className="flex min-h-64 items-center justify-center text-gray-500">
              <RefreshCw className="mr-3 h-5 w-5 animate-spin" />
              Loading your schedule templates…
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center">
              <FolderOpen className="mb-3 h-10 w-10 text-gray-400" />
              <h3 className="!mb-0 !text-base !font-semibold !text-gray-800">
                {templates.length === 0
                  ? "No Studio templates yet"
                  : "No matching templates"}
              </h3>
              <p className="mt-1 max-w-md text-sm text-gray-500">
                {templates.length === 0
                  ? "Save your current grid and it will appear here for the whole in-app workflow."
                  : "Try another search or folder."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filteredTemplates.map((template) => {
                const studio = getStudioDocument(template);
                const updatedAt = getTimestamp(
                  template.updatedAt || template.createdAt,
                );
                return (
                  <article
                    key={template.id}
                    className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-baylor-green/40 hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-baylor-green/10 p-2 text-baylor-green">
                        <FileText className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="!mb-0 truncate !text-base !font-semibold !text-gray-900">
                              {studio.name || template.title || "Untitled grid"}
                            </h3>
                            <p className="mt-0.5 truncate text-sm text-gray-500">
                              {[studio.building, studio.room, studio.semester]
                                .filter(Boolean)
                                .join(" · ") || "Manual schedule"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onToggleFavorite?.(template)}
                            className={`rounded-lg p-2 transition ${
                              studio.favorite
                                ? "bg-baylor-gold/15 text-amber-600"
                                : "text-gray-400 hover:bg-gray-100 hover:text-amber-600"
                            }`}
                            aria-label={
                              studio.favorite
                                ? `Remove ${studio.name} from favorites`
                                : `Add ${studio.name} to favorites`
                            }
                          >
                            <Star
                              className="h-4 w-4"
                              fill={studio.favorite ? "currentColor" : "none"}
                            />
                          </button>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge size="sm" tone="neutral" icon={FolderOpen}>
                            {studio.folder || "Unfiled"}
                          </Badge>
                          <Badge size="sm" tone="info">
                            {studio.entries?.length || 0} classes
                          </Badge>
                          <Badge size="sm" tone="muted">
                            {studio.layout?.widthIn || 7} × {studio.layout?.heightIn || 5} in
                          </Badge>
                        </div>

                        {studio.tags?.length ? (
                          <p className="mt-3 truncate text-xs text-gray-500">
                            {studio.tags.map((tag) => `#${tag}`).join("  ")}
                          </p>
                        ) : null}

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
                          <span className="text-xs text-gray-400">
                            {updatedAt
                              ? `Updated ${new Date(updatedAt).toLocaleDateString()}`
                              : "Not saved yet"}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => onDuplicate?.(template)}
                              className="btn-ghost px-2 py-1 text-xs"
                              aria-label={`Duplicate ${studio.name}`}
                            >
                              <Copy className="mr-1 h-3.5 w-3.5" />
                              Copy
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDelete(template)}
                              className="btn-ghost px-2 py-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                              aria-label={`Delete ${studio.name}`}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpen?.(template)}
                              className="btn-primary px-3 py-1.5 text-xs"
                            >
                              Open
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title="Delete schedule template"
        message={
          <>
            Delete “
            {getStudioDocument(pendingDelete).name || pendingDelete?.title}” from
            the in-app library? This cannot be undone.
          </>
        }
        variant="danger"
        confirmText={isDeleting ? "Deleting…" : "Delete"}
        confirmDisabled={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
};

export default ScheduleGridLibraryModal;
