import { useMemo, useState, useEffect, useCallback } from "react";
import {
  IdCard,
  Edit,
  Save,
  X,
  CheckCircle2,
  AlertCircle,
  Download,
  Trash2,
} from "lucide-react";
import UniversalDirectory from "../shared/UniversalDirectory";
import FacultyContactCard from "../FacultyContactCard";
import ConfirmDialog from "../shared/ConfirmDialog";
import { usePeople } from "../../contexts/PeopleContext";
import { useAuth } from "../../contexts/AuthContext";
import { usePeopleOperations } from "../../hooks";
import { useUI } from "../../contexts/UIContext";
import { usePermissions } from "../../utils/permissions";
import { hasRole } from "../../utils/peopleUtils";

const getDisplayRoleLabels = (person) => {
  const labels = [];
  if (hasRole(person, "faculty")) labels.push("Faculty");
  if (hasRole(person, "staff")) labels.push("Staff");
  if (hasRole(person, "student")) labels.push("Student");
  if (person.isAdjunct) labels.push("Adjunct"); // derive adjunct only from explicit flag
  return labels;
};

const getPersonType = (person) => {
  if (hasRole(person, "student")) return "student";
  if (hasRole(person, "staff")) return "staff";
  return "faculty"; // default to faculty
};

const BaylorIDManager = ({ embedded = false }) => {
  const { people: directoryData, loadPeople } = usePeople();
  const { handleBaylorIdUpdate } = usePeopleOperations();
  const { showNotification } = useUI();
  const { canEdit } = usePermissions();
  const { isAdmin } = useAuth();
  const canEditIds = isAdmin && canEdit("people/baylor-id-manager");
  const [filterText, setFilterText] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [roleChecks, setRoleChecks] = useState({
    faculty: true,
    adjunct: true,
    staff: true,
    studentWorkers: true,
  });
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [baylorIdDraft, setBaylorIdDraft] = useState("");
  const [error, setError] = useState("");
  const [removeTarget, setRemoveTarget] = useState(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [selectedPersonForCard, setSelectedPersonForCard] = useState(null);
  const [sortConfig, setSortConfig] = useState({
    key: "name",
    direction: "ascending",
  });

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  const people = useMemo(
    () => (Array.isArray(directoryData) ? directoryData : []),
    [directoryData],
  );

  const getBaylorId = useCallback((person) => {
    const raw = person?.baylorId || person?.externalIds?.baylorId || "";
    return raw ? String(raw).trim() : "";
  }, []);

  const filtered = useMemo(() => {
    const term = filterText.trim().toLowerCase();
    return people
      .filter((p) => {
        if (!p) return false;
        if (!includeInactive && p.isActive === false) return false;
        const includeByRole =
          (roleChecks.faculty && hasRole(p, "faculty") && !p.isAdjunct) ||
          (roleChecks.adjunct && p.isAdjunct) ||
          (roleChecks.staff && hasRole(p, "staff")) ||
          (roleChecks.studentWorkers && hasRole(p, "student"));
        if (!includeByRole) return false;
        const baylorId = getBaylorId(p);
        if (onlyMissing && baylorId) return false;
        if (!term) return true;
        const name = (p.name || "").toLowerCase();
        const email = (p.email || "").toLowerCase();
        const id = baylorId.toLowerCase();
        return name.includes(term) || email.includes(term) || id.includes(term);
      })
      .sort((a, b) => {
        let valA, valB;
        if (sortConfig.key === "name") {
          valA = (a.name || "").toLowerCase();
          valB = (b.name || "").toLowerCase();
        } else if (sortConfig.key === "baylorId") {
          valA = getBaylorId(a).toLowerCase();
          valB = getBaylorId(b).toLowerCase();
        } else {
          valA = (a[sortConfig.key] || "").toString().toLowerCase();
          valB = (b[sortConfig.key] || "").toString().toLowerCase();
        }
        if (valA < valB) return sortConfig.direction === "ascending" ? -1 : 1;
        if (valA > valB) return sortConfig.direction === "ascending" ? 1 : -1;
        return 0;
      });
  }, [
    people,
    filterText,
    roleChecks,
    onlyMissing,
    includeInactive,
    sortConfig,
    getBaylorId,
  ]);

  const exportToCSV = () => {
    const headers = ["Name", "Baylor ID"];
    const rows = filtered.map((person) => [
      person.name || "",
      getBaylorId(person),
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `baylor-id-export-${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const startEdit = (person) => {
    setEditingId(person.id);
    setBaylorIdDraft(getBaylorId(person));
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setBaylorIdDraft("");
    setError("");
  };

  const validateId = (value, person) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) {
      return getBaylorId(person)
        ? "Use Remove ID to permanently delete an assigned Baylor ID."
        : "Baylor ID must be 9 digits.";
    }
    if (digits.length !== 9) return "Baylor ID must be exactly 9 digits";
    return "";
  };

  const saveId = async (person) => {
    const validation = validateId(baylorIdDraft, person);
    if (validation) {
      setError(validation);
      return;
    }
    if (!canEditIds) {
      showNotification?.(
        "warning",
        "Permission Denied",
        "You do not have permission to modify Baylor IDs.",
      );
      return;
    }
    const cleanedId = baylorIdDraft.replace(/\D/g, "");
    try {
      await handleBaylorIdUpdate(person.id, cleanedId);
      setEditingId(null);
      setBaylorIdDraft("");
      setError("");
    } catch (e) {
      setError(e?.message || "Failed to save.");
    }
  };

  const confirmRemoveId = async () => {
    if (!removeTarget) return;
    if (!canEditIds) {
      showNotification?.(
        "warning",
        "Permission Denied",
        "You do not have permission to remove Baylor IDs.",
      );
      return;
    }

    try {
      setIsRemoving(true);
      await handleBaylorIdUpdate(removeTarget.id, null, { remove: true });
      setRemoveTarget(null);
      setEditingId(null);
      setBaylorIdDraft("");
      setError("");
    } catch (e) {
      setError(e?.message || "Failed to remove Baylor ID.");
    } finally {
      setIsRemoving(false);
    }
  };

  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction:
        prev.key === key && prev.direction === "ascending"
          ? "descending"
          : "ascending",
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setRoleChecks({
      faculty: true,
      adjunct: true,
      staff: true,
      studentWorkers: true,
    });
    setOnlyMissing(false);
    setIncludeInactive(false);
  }, []);

  // Column definitions for DirectoryTable
  const columns = useMemo(
    () => [
      {
        key: "name",
        label: "Name",
        render: (person) => (
          <div>
            <div
              className="text-gray-900 font-medium cursor-pointer hover:text-baylor-green transition-colors"
              onClick={() => setSelectedPersonForCard(person)}
            >
              {person.name || "-"}
            </div>
            <div className="text-xs text-gray-500">{person.email || ""}</div>
          </div>
        ),
      },
      {
        key: "roles",
        label: "Roles",
        render: (person) => {
          const roles = getDisplayRoleLabels(person);
          return (
            <div className="flex flex-wrap gap-1">
              {roles.length === 0 ? (
                <span className="text-xs text-gray-500">Unassigned</span>
              ) : (
                roles.map((r) => (
                  <span
                    key={r}
                    className="px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-700"
                  >
                    {r}
                  </span>
                ))
              )}
            </div>
          );
        },
      },
      {
        key: "baylorId",
        label: "Baylor ID",
        render: (person) => {
          const isEditing = editingId === person.id;
          const baylorId = getBaylorId(person);
          const hasId = Boolean(baylorId);

          if (isEditing) {
            return (
              <div>
                <input
                  value={baylorIdDraft}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 9);
                    setBaylorIdDraft(v);
                    if (error) setError("");
                  }}
                  placeholder="9 digits"
                  className={`w-48 p-2 border rounded ${error ? "border-red-500" : "border-gray-300"}`}
                />
                {error && (
                  <div className="flex items-center gap-1 text-red-600 text-xs mt-1">
                    <AlertCircle size={12} />
                    {error}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div className="flex items-center gap-2">
              {hasId ? (
                <span className="inline-flex items-center gap-1 text-gray-800">
                  <CheckCircle2 size={14} className="text-green-600" />
                  {baylorId}
                </span>
              ) : (
                <span className="text-gray-500 italic">Not assigned</span>
              )}
            </div>
          );
        },
      },
    ],
    [editingId, baylorIdDraft, error, getBaylorId],
  );

  // Actions column renderer
  const renderActions = useCallback(
    (person) => {
      if (!canEditIds) return null;
      const isEditing = editingId === person.id;
      if (isEditing) {
        return (
          <div className="flex gap-1 justify-end">
            <button
              onClick={() => saveId(person)}
              className="p-2 text-baylor-green hover:bg-baylor-green/10 rounded-full"
              title="Save"
            >
              <Save size={16} />
            </button>
            <button
              onClick={cancelEdit}
              className="p-2 text-red-600 hover:bg-red-100 rounded-full"
              title="Cancel"
            >
              <X size={16} />
            </button>
          </div>
        );
      }

      return (
        <div className="flex gap-1 justify-end">
          <button
            onClick={() => startEdit(person)}
            className="p-2 text-baylor-green hover:bg-baylor-green/10 rounded-full"
            title={getBaylorId(person) ? "Edit Baylor ID" : "Add Baylor ID"}
          >
            <Edit size={16} />
          </button>
          {getBaylorId(person) && (
            <button
              onClick={() => setRemoveTarget(person)}
              className="p-2 text-red-600 hover:bg-red-100 rounded-full"
              title="Permanently remove Baylor ID"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      );
    },
    [canEditIds, editingId, getBaylorId],
  );

  // Filter content for the collapsible panel
  const filterContent = (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Roles</h4>
        <div className="flex flex-wrap gap-4">
          {[
            { key: "faculty", label: "Faculty" },
            { key: "adjunct", label: "Adjunct" },
            { key: "staff", label: "Staff" },
            { key: "studentWorkers", label: "Student Workers" },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={roleChecks[key]}
                onChange={(e) =>
                  setRoleChecks((prev) => ({
                    ...prev,
                    [key]: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="border-t border-gray-200 pt-3">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Options</h4>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyMissing}
              onChange={(e) => setOnlyMissing(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
            />
            Only show unassigned IDs
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
            />
            Include inactive
          </label>
        </div>
      </div>
    </div>
  );

  // Export CSV button in the header actions area
  const trailingActions = (
    <button
      onClick={exportToCSV}
      className="flex items-center gap-2 px-3 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors text-sm"
    >
      <Download size={16} />
      Export CSV
    </button>
  );

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Baylor IDs</h1>
          <p className="text-gray-600">
            Quickly view and update Baylor IDs across directory members.
          </p>
        </div>
      )}

      <UniversalDirectory
        type="people"
        title="Baylor IDs"
        icon={IdCard}
        data={filtered}
        columns={columns}
        sortConfig={sortConfig}
        onSort={handleSort}
        filterText={filterText}
        onFilterTextChange={setFilterText}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
        onClearFilters={clearFilters}
        filterContent={filterContent}
        trailingActions={trailingActions}
        useHtmlTable
        tableProps={{
          editingId,
          renderActions,
          emptyMessage: "No people found. Adjust your search or filters.",
        }}
      />

      {selectedPersonForCard && (
        <FacultyContactCard
          person={selectedPersonForCard}
          onClose={() => setSelectedPersonForCard(null)}
          personType={getPersonType(selectedPersonForCard)}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(removeTarget)}
        title="Remove Baylor ID"
        message={
          <span>
            Permanently remove the Baylor ID from{" "}
            <strong>{removeTarget?.name || "this person"}</strong>? The ID
            number will be deleted from the active record. Use the Data Cleanup
            Baylor ID tool afterward to scrub application-managed history.
          </span>
        }
        onConfirm={confirmRemoveId}
        onCancel={() => {
          if (!isRemoving) setRemoveTarget(null);
        }}
        confirmText={isRemoving ? "Removing..." : "Remove ID"}
        cancelText="Cancel"
        variant="danger"
        confirmDisabled={isRemoving}
      />
    </div>
  );
};

export default BaylorIDManager;
