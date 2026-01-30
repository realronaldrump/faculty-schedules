import React, { useMemo, useState } from "react";
import { usePermissions } from "../../utils/permissions";
import { Database, AlertCircle, Save, Search, Pencil, X } from "lucide-react";
import { analyzeCRNCoverage } from "../../utils/crnMigrationUtils";
import { fetchSchedulesByTerms } from "../../utils/dataImportUtils";
import { db } from "../../firebase";
import { doc, updateDoc } from "firebase/firestore";
import { logUpdate } from "../../utils/changeLogger";
import MultiSelectDropdown from "../MultiSelectDropdown";
import { useUI } from "../../contexts/UIContext";
import { useSchedules } from "../../contexts/ScheduleContext";

const CRNQualityTools = () => {
  const { showNotification } = useUI();
  const { canEdit } = usePermissions();
  const canEditHere = canEdit("data/crn-tools");
  const { selectedSemester, termOptions, getTermByLabel } = useSchedules();
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [editingCrn, setEditingCrn] = useState({}); // { [scheduleId]: crn }
  const [filters, setFilters] = useState({
    terms: [],
    programs: [],
    instructors: [],
    searchTerm: "",
    showMissingOnly: false,
  });

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const termSelection =
        filters.terms.length > 0
          ? filters.terms
          : selectedSemester
            ? [selectedSemester]
            : [];
      if (termSelection.length === 0) {
        showNotification?.(
          "warning",
          "Select a Semester",
          "Choose at least one semester to analyze.",
        );
        return;
      }
      const termCodes = termSelection
        .map((term) => getTermByLabel?.(term)?.termCode)
        .filter(Boolean);
      const a = await analyzeCRNCoverage({ terms: termSelection, termCodes });
      setAnalysis(a);
      showNotification?.(
        "info",
        "CRN Analysis",
        `${a.coveragePercentage}% coverage (${a.withCRN}/${a.total})`,
      );
      // Load enriched schedules for detailed listing
      setLoadingSchedules(true);
      const { schedules: enriched } = await fetchSchedulesByTerms({
        terms: termSelection,
        termCodes,
      });
      setSchedules(enriched || []);
    } catch (e) {
      console.error(e);
      showNotification?.(
        "error",
        "Analysis failed",
        e.message || "Unable to analyze CRN coverage",
      );
    } finally {
      setIsAnalyzing(false);
      setLoadingSchedules(false);
    }
  };

  // No import, upload, or automated backfill features are provided on this page by design

  // Derived filter options
  const uniqueTerms = useMemo(() => {
    if (Array.isArray(termOptions) && termOptions.length > 0) {
      return termOptions.map((term) => term.term).filter(Boolean);
    }
    return Array.from(
      new Set(
        (schedules || []).map((s) => (s.term || "").trim()).filter(Boolean),
      ),
    ).sort();
  }, [termOptions, schedules]);

  const uniqueInstructors = useMemo(() => {
    return Array.from(
      new Set(
        (schedules || [])
          .map((s) => s.instructorName || "Staff")
          .filter(Boolean),
      ),
    ).sort();
  }, [schedules]);

  const uniquePrograms = useMemo(() => {
    return Array.from(
      new Set(
        (schedules || [])
          .map((s) => s.instructor?.program?.name || s.program || "")
          .filter(Boolean),
      ),
    ).sort();
  }, [schedules]);

  const filteredSchedules = useMemo(() => {
    let data = [...(schedules || [])];
    // Search
    const term = (filters.searchTerm || "").toLowerCase().trim();
    if (term) {
      data = data.filter((item) => {
        const values = [
          item.courseCode,
          item.section,
          item.term,
          item.crn || item.CRN || "",
          item.instructorName || "",
          item.instructor?.program?.name || item.program || "",
        ].map((v) => (v || "").toString().toLowerCase());
        return values.some((v) => v.includes(term));
      });
    }
    // Term filter
    if (filters.terms.length > 0) {
      data = data.filter((item) => item && filters.terms.includes(item.term));
    }
    // Program filter
    if (filters.programs.length > 0) {
      data = data.filter((item) => {
        const programName =
          item.instructor?.program?.name || item.program || "";
        return filters.programs.includes(programName);
      });
    }
    // Instructor filter
    if (filters.instructors.length > 0) {
      data = data.filter(
        (item) =>
          item && filters.instructors.includes(item.instructorName || "Staff"),
      );
    }
    // Missing only
    if (filters.showMissingOnly) {
      data = data.filter(
        (item) => !(item.crn || item.CRN || "").toString().trim(),
      );
    }
    return data;
  }, [schedules, filters]);

  const handleCrnInputChange = (id, value) => {
    // Enforce digits only in the field, but allow incomplete until save
    const digitsOnly = value.replace(/\D/g, "").slice(0, 5);
    setEditingCrn((prev) => ({ ...prev, [id]: digitsOnly }));
  };

  const handleCrnSave = async (row) => {
    if (!canEditHere) {
      showNotification?.(
        "warning",
        "Permission Denied",
        "You do not have permission to modify CRNs.",
      );
      return;
    }
    const newCrn = (editingCrn[row.id] ?? "").trim();
    if (!/^\d{5}$/.test(newCrn)) {
      showNotification?.(
        "warning",
        "Invalid CRN",
        "CRN must be exactly 5 digits.",
      );
      return;
    }
    try {
      const scheduleRef = doc(db, "schedules", row.id);
      const updateData = { crn: newCrn, updatedAt: new Date().toISOString() };
      const originalData = row;
      await updateDoc(scheduleRef, updateData);
      await logUpdate(
        `Schedule - ${row.courseCode} ${row.section}`,
        "schedules",
        row.id,
        updateData,
        originalData,
        "CRNQualityTools.jsx - handleCrnSave",
      );
      // Update local state
      setSchedules((prev) =>
        prev.map((s) => (s.id === row.id ? { ...s, ...updateData } : s)),
      );
      setEditingCrn((prev) => ({ ...prev, [row.id]: "" }));
      showNotification?.(
        "success",
        "CRN Updated",
        `Saved CRN ${newCrn} for ${row.courseCode} ${row.section}.`,
      );
      // Refresh analysis metrics
      await handleAnalyze();
    } catch (e) {
      console.error(e);
      showNotification?.(
        "error",
        "Save failed",
        e.message || "Unable to save CRN",
      );
    }
  };

  const cancelCrnEdit = (id) => {
    setEditingCrn((prev) => {
      const { [id]: _omit, ...rest } = prev;
      return rest;
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-baylor-green">
          CRN Quality Tools
        </h1>
        <p className="text-gray-600">
          Analyze coverage, find duplicates, and edit missing CRNs.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <div className="text-sm text-amber-800">
          CRNs are 5-digit numbers as provided by the Registrar's CLSS export.
          This view shows sections exactly as imported; if a CRN is missing
          here, it was missing in the source export.
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="px-6 py-3 bg-baylor-gold text-baylor-green rounded-lg hover:bg-baylor-gold/90 disabled:bg-gray-400 flex items-center"
        >
          {isAnalyzing ? (
            "Analyzing..."
          ) : (
            <>
              <Database className="w-4 h-4 mr-2" />
              Analyze CRN Coverage
            </>
          )}
        </button>
      </div>

      {analysis && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-md font-semibold text-gray-900 mb-3">
            CRN Coverage Analysis
          </h3>
          <div className="grid md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-baylor-green">
                {analysis.coveragePercentage}%
              </div>
              <div className="text-sm text-gray-600">Coverage</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-baylor-green">
                {analysis.withCRN}
              </div>
              <div className="text-sm text-gray-600">With CRN</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {analysis.missingCRN + analysis.emptyCRN}
              </div>
              <div className="text-sm text-gray-600">Missing CRN</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">
                {analysis.total}
              </div>
              <div className="text-sm text-gray-600">Total Records</div>
            </div>
          </div>
          {analysis.duplicateCRNs.length > 0 && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center mb-2">
                <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                <h4 className="font-semibold text-red-800">
                  Duplicate CRNs Detected
                </h4>
              </div>
              <div className="text-sm text-red-700">
                {analysis.duplicateCRNs.length} CRN(s) appear in multiple
                records within the same semester. Review the duplicates below
                and correct them here.
              </div>
            </div>
          )}
        </div>
      )}

      {analysis && analysis.duplicateCRNs.length > 0 && (
        <div className="mt-6 bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-md font-semibold text-gray-900 mb-3">
            Duplicate CRNs - Resolve
          </h3>
          <div className="space-y-4">
            {analysis.duplicateCRNs.map((group) => (
              <div
                key={`${group.crn}__${group.term || ""}`}
                className="border border-red-200 rounded-md"
              >
                <div className="px-3 py-2 bg-red-50 flex items-center justify-between">
                  <div className="text-sm text-red-800 font-medium">
                    Semester {group.term || "Unknown"} — CRN {group.crn} —{" "}
                    {group.count} records
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="university-table min-w-full">
                    <thead>
                      <tr>
                        <th className="table-header-cell">
                          Semester
                        </th>
                        <th className="table-header-cell">
                          Course
                        </th>
                        <th className="table-header-cell">
                          Section
                        </th>
                        <th className="table-header-cell">
                          CRN
                        </th>
                        <th className="table-header-cell">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.records.map((rec) => {
                        const row = (schedules || []).find(
                          (s) => s.id === rec.id,
                        ) || {
                          id: rec.id,
                          courseCode: rec.courseCode,
                          section: rec.section,
                          term: rec.term,
                          crn: group.crn,
                        };
                        const isEditing = Object.prototype.hasOwnProperty.call(
                          editingCrn,
                          row.id,
                        );
                        const currentValue = isEditing
                          ? (editingCrn[row.id] ?? "")
                          : row.crn || "";
                        return (
                          <tr key={row.id}>
                            <td className="table-cell text-gray-700 whitespace-nowrap">
                              {row.term}
                            </td>
                            <td className="table-cell text-gray-900 whitespace-nowrap font-medium">
                              {row.courseCode}
                            </td>
                            <td className="table-cell text-gray-700 whitespace-nowrap">
                              {row.section}
                            </td>
                            <td className="table-cell text-gray-900 whitespace-nowrap">
                              {isEditing ? (
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="\\d{5}"
                                  className="w-28 p-1 border border-gray-300 rounded-md focus:ring-baylor-green focus:border-baylor-green text-gray-900"
                                  value={currentValue}
                                  onChange={(e) =>
                                    handleCrnInputChange(row.id, e.target.value)
                                  }
                                />
                              ) : (
                                <span className="font-semibold">{row.crn}</span>
                              )}
                            </td>
                            <td className="table-cell text-gray-700 whitespace-nowrap">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  {canEditHere && (
                                    <button
                                      onClick={() => handleCrnSave(row.id)}
                                      className="btn btn-primary btn-sm"
                                    >
                                      Save
                                    </button>
                                  )}
                                  <button
                                    onClick={() => cancelCrnEdit(row.id)}
                                    className="inline-flex items-center px-2 py-1 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                                  >
                                    <X className="w-4 h-4 mr-1" /> Cancel
                                  </button>
                                </div>
                              ) : (
                                <>
                                  {canEditHere && (
                                    <button
                                      onClick={cancelCrnEdit}
                                      className="btn btn-outline btn-xs"
                                    >
                                      Cancel
                                    </button>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No import results panel; imports are handled exclusively in Import Wizard */}

      {analysis && (
        <div className="mt-6 bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-semibold text-gray-900">
              All Sections and CRNs
            </h3>
            <div className="text-sm text-gray-500">
              {loadingSchedules
                ? "Loading…"
                : `${filteredSchedules.length} of ${schedules.length}`}
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Semesters
              </label>
              <MultiSelectDropdown
                options={uniqueTerms}
                selected={filters.terms}
                onChange={(selected) =>
                  setFilters((prev) => ({ ...prev, terms: selected }))
                }
                placeholder="Filter by semester..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Programs
              </label>
              <MultiSelectDropdown
                options={uniquePrograms}
                selected={filters.programs}
                onChange={(selected) =>
                  setFilters((prev) => ({ ...prev, programs: selected }))
                }
                placeholder="Filter by program..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Instructors
              </label>
              <MultiSelectDropdown
                options={uniqueInstructors}
                selected={filters.instructors}
                onChange={(selected) =>
                  setFilters((prev) => ({ ...prev, instructors: selected }))
                }
                placeholder="Filter by instructor..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <div className="flex items-center border border-gray-300 rounded-lg bg-white px-2">
                <Search className="w-4 h-4 text-gray-500 mr-1" />
                <input
                  type="text"
                  className="w-full py-1.5 outline-none text-sm"
                  placeholder="Search course, section, CRN, semester..."
                  value={filters.searchTerm}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      searchTerm: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <input
                  id="missingOnly"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                  checked={filters.showMissingOnly}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      showMissingOnly: e.target.checked,
                    }))
                  }
                />
                <label htmlFor="missingOnly" className="text-gray-700">
                  Show missing CRN only
                </label>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="university-table min-w-full">
              <thead>
                <tr>
                  <th className="table-header-cell">
                    Semester
                  </th>
                  <th className="table-header-cell">
                    Course
                  </th>
                  <th className="table-header-cell">
                    Section
                  </th>
                  <th className="table-header-cell">
                    CRN
                  </th>
                  <th className="table-header-cell">
                    Instructor
                  </th>
                  <th className="table-header-cell">
                    Program
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSchedules.map((row) => {
                  const effectiveCrn = (row.crn || row.CRN || "").toString();
                  const isMissing = !effectiveCrn.trim();
                  const programName =
                    row.instructor?.program?.name || row.program || "";
                  return (
                    <tr
                      key={row.id}
                      className={isMissing ? "bg-red-50/40" : ""}
                    >
                      <td className="table-cell text-gray-700 whitespace-nowrap">
                        {row.term}
                      </td>
                      <td className="table-cell text-gray-900 whitespace-nowrap font-medium">
                        {row.courseCode}
                      </td>
                      <td className="table-cell text-gray-700 whitespace-nowrap">
                        {row.section}
                      </td>
                      <td
                        className={`table-cell whitespace-nowrap ${isMissing ? "text-red-700" : "text-gray-900"}`}
                      >
                        {isMissing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="\\d{5}"
                              placeholder="Enter 5-digit CRN"
                              className="w-32 p-1 border border-red-300 rounded-md focus:ring-baylor-green focus:border-baylor-green text-gray-900"
                              value={editingCrn[row.id] ?? ""}
                              onChange={(e) =>
                                handleCrnInputChange(row.id, e.target.value)
                              }
                            />
                            <button
                              onClick={() => handleCrnSave(row)}
                              className="inline-flex items-center px-2 py-1 bg-baylor-green text-white rounded-md hover:bg-baylor-green/90"
                            >
                              <Save className="w-4 h-4 mr-1" /> Save
                            </button>
                          </div>
                        ) : (
                          <span className="font-semibold">{effectiveCrn}</span>
                        )}
                      </td>
                      <td className="table-cell text-gray-700 whitespace-nowrap">
                        {row.instructorName || "Staff"}
                      </td>
                      <td className="table-cell text-gray-700 whitespace-nowrap">
                        {programName}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CRNQualityTools;
