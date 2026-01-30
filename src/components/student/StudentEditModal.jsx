import React, { useState, useMemo } from "react";
import {
  X,
  User,
  Building,
  Clock,
  DollarSign,
  Calendar,
  Check,
  AlertCircle,
  Trash2,
  Plus,
} from "lucide-react";
import JobCard from "./JobCard";
import TimelineVisualization from "./TimelineVisualization";
import StatusBadge, { getStudentStatus } from "./StatusBadge";
import BuildingSelector from "./BuildingSelector";
import VisualScheduleBuilder from "./VisualScheduleBuilder";

/**
 * StudentEditModal - Full-screen modal for editing student workers
 *
 * Provides a tabbed interface with dedicated space for:
 * - Basic Info (name, email, phone)
 * - Jobs & Schedule (manage assignments)
 * - Employment (dates, status, timeline)
 * - Payroll (hours, pay breakdown)
 */

const TABS = [
  { id: "basic", label: "Basic Info", icon: User },
  { id: "jobs", label: "Jobs & Schedule", icon: Building },
  { id: "employment", label: "Employment", icon: Calendar },
  { id: "payroll", label: "Payroll", icon: DollarSign },
];

const StudentEditModal = ({
  student,
  onSave,
  onClose,
  onDelete,
  availableBuildings = [],
  existingSupervisors = [],
  semesterLabel = "",
}) => {
  const [activeTab, setActiveTab] = useState("basic");
  const [formData, setFormData] = useState({ ...student });
  const [errors, setErrors] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingJobIndex, setEditingJobIndex] = useState(null);
  const [addingJob, setAddingJob] = useState(false);
  const canDeleteStudent =
    typeof window === "undefined" ||
    window?.appPermissions?.canDeleteStudent !== false;

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.name?.trim()) newErrors.name = "Name is required";
    if (!formData.email?.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validate()) {
      onSave(formData);
    }
  };

  // Job management
  const addJob = (job) => {
    setFormData((prev) => ({
      ...prev,
      jobs: [...(prev.jobs || []), { ...job, id: Date.now().toString() }],
    }));
    setAddingJob(false);
  };

  const updateJob = (index, updates) => {
    setFormData((prev) => {
      const newJobs = [...(prev.jobs || [])];
      newJobs[index] = { ...newJobs[index], ...updates };
      return { ...prev, jobs: newJobs };
    });
  };

  const removeJob = (index) => {
    setFormData((prev) => ({
      ...prev,
      jobs: (prev.jobs || []).filter((_, i) => i !== index),
    }));
  };

  // Calculate stats
  const stats = useMemo(() => {
    const jobs = formData.jobs || [];
    let totalHours = 0;
    let weeklyPay = 0;

    jobs.forEach((job) => {
      const jobHours = (job.weeklySchedule || []).reduce((sum, entry) => {
        const start =
          parseInt(entry.start.split(":")[0]) +
          parseInt(entry.start.split(":")[1] || 0) / 60;
        const end =
          parseInt(entry.end.split(":")[0]) +
          parseInt(entry.end.split(":")[1] || 0) / 60;
        return sum + (end - start);
      }, 0);
      totalHours += jobHours;
      weeklyPay += jobHours * (parseFloat(job.hourlyRate) || 0);
    });

    return { totalHours, weeklyPay, jobCount: jobs.length };
  }, [formData.jobs]);

  const currentStatus = getStudentStatus(formData);

  // Tab Components
  const BasicInfoTab = () => (
    <div className="max-w-2xl space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          Basic Information
        </h3>
        <p className="text-sm text-gray-600">
          Student contact details and identifiers
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name || ""}
            onChange={(e) => updateField("name", e.target.value)}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green ${
              errors.name ? "border-red-500" : "border-gray-300"
            }`}
          />
          {errors.name && (
            <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
              <AlertCircle size={14} />
              {errors.name}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email Address <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={formData.email || ""}
            onChange={(e) => updateField("email", e.target.value)}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green ${
              errors.email ? "border-red-500" : "border-gray-300"
            }`}
          />
          {errors.email && (
            <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
              <AlertCircle size={14} />
              {errors.email}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone Number
          </label>
          <div className="flex gap-3">
            <input
              type="tel"
              value={formData.phone || ""}
              disabled={formData.hasNoPhone}
              onChange={(e) => updateField("phone", e.target.value)}
              className={`flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green ${
                formData.hasNoPhone ? "bg-gray-100" : "border-gray-300"
              }`}
            />
            <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={formData.hasNoPhone || false}
                onChange={(e) => updateField("hasNoPhone", e.target.checked)}
                className="rounded text-baylor-green focus:ring-baylor-green"
              />
              <span className="text-sm text-gray-600">No Phone</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  const JobsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Job Assignments
          </h3>
          <p className="text-sm text-gray-600">
            Manage work assignments and schedules
            {semesterLabel && ` for ${semesterLabel}`}
          </p>
        </div>
        <button
          onClick={() => setAddingJob(true)}
          disabled={addingJob}
          className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors disabled:opacity-50"
        >
          <Plus size={18} />
          Add Job
        </button>
      </div>

      <div className="space-y-3">
        {(formData.jobs || []).map((job, idx) => (
          <JobCard
            key={job.id || idx}
            job={job}
            isEditing={editingJobIndex === idx}
            onEdit={() => setEditingJobIndex(idx)}
            onSave={(updatedJob) => {
              updateJob(idx, updatedJob);
              setEditingJobIndex(null);
            }}
            onCancel={() => setEditingJobIndex(null)}
            onRemove={() => removeJob(idx)}
            availableBuildings={availableBuildings}
            existingSupervisors={existingSupervisors}
          />
        ))}

        {addingJob && (
          <JobCard
            job={{
              jobTitle: "",
              supervisor: "",
              hourlyRate: "",
              buildings: [],
              weeklySchedule: [],
              startDate: formData.startDate,
              endDate: formData.endDate,
            }}
            isEditing={true}
            onSave={(newJob) => {
              addJob(newJob);
            }}
            onCancel={() => setAddingJob(false)}
            availableBuildings={availableBuildings}
            existingSupervisors={existingSupervisors}
          />
        )}

        {(formData.jobs || []).length === 0 && !addingJob && (
          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <Building size={48} className="mx-auto text-gray-400 mb-3" />
            <p className="text-gray-600 font-medium">No job assignments yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Click "Add Job" to create the first assignment
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const EmploymentTab = () => (
    <div className="max-w-2xl space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          Employment Period
        </h3>
        <p className="text-sm text-gray-600">
          Define when the student is authorized to work
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={formData.startDate || ""}
            onChange={(e) => updateField("startDate", e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            End Date (Optional)
          </label>
          <input
            type="date"
            value={formData.endDate || ""}
            onChange={(e) => updateField("endDate", e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
        <input
          type="checkbox"
          id="isActiveEdit"
          checked={formData.isActive !== false}
          onChange={(e) => updateField("isActive", e.target.checked)}
          className="h-5 w-5 rounded text-baylor-green focus:ring-baylor-green"
        />
        <label
          htmlFor="isActiveEdit"
          className="text-sm font-medium text-gray-700"
        >
          Active Student Worker
        </label>
      </div>

      <div className="mt-6">
        <TimelineVisualization
          studentStartDate={formData.startDate}
          studentEndDate={formData.endDate}
          jobs={formData.jobs || []}
        />
      </div>

      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle
            size={20}
            className="text-yellow-600 flex-shrink-0 mt-0.5"
          />
          <div>
            <p className="text-sm font-medium text-yellow-800">
              Automatic Inactivation
            </p>
            <p className="text-sm text-yellow-700 mt-1">
              Students will be automatically marked inactive after their end
              date unless extended. Individual job assignments may have
              different end dates.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const PayrollTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          Payroll Summary
        </h3>
        <p className="text-sm text-gray-600">
          Estimated wages based on scheduled hours
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-baylor-green/10 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-baylor-green">
            {stats.totalHours.toFixed(1)}
          </p>
          <p className="text-sm text-gray-600">Hours per Week</p>
        </div>
        <div className="bg-baylor-green/10 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-baylor-green">
            ${stats.weeklyPay.toFixed(2)}
          </p>
          <p className="text-sm text-gray-600">Weekly Pay</p>
        </div>
        <div className="bg-baylor-green/10 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-baylor-green">
            ${(stats.weeklyPay * 4).toFixed(2)}
          </p>
          <p className="text-sm text-gray-600">Monthly Estimate</p>
        </div>
      </div>

      <div className="mt-6">
        <h4 className="font-medium text-gray-900 mb-3">Job Breakdown</h4>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700">
                  Job Title
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">
                  Rate
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">
                  Hours/Week
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">
                  Weekly Pay
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(formData.jobs || []).map((job, idx) => {
                const hours = (job.weeklySchedule || []).reduce(
                  (sum, entry) => {
                    const start =
                      parseInt(entry.start.split(":")[0]) +
                      parseInt(entry.start.split(":")[1] || 0) / 60;
                    const end =
                      parseInt(entry.end.split(":")[0]) +
                      parseInt(entry.end.split(":")[1] || 0) / 60;
                    return sum + (end - start);
                  },
                  0,
                );
                const pay = hours * (parseFloat(job.hourlyRate) || 0);

                return (
                  <tr key={idx}>
                    <td className="px-4 py-3 font-medium">
                      {job.jobTitle || "Untitled Job"}
                    </td>
                    <td className="px-4 py-3">
                      ${job.hourlyRate || "0.00"}/hr
                    </td>
                    <td className="px-4 py-3">{hours.toFixed(1)} hrs</td>
                    <td className="px-4 py-3 font-medium">${pay.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {stats.totalHours > 20 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle
            size={18}
            className="text-amber-600 flex-shrink-0 mt-0.5"
          />
          <p className="text-sm text-amber-800">
            This student is scheduled for {stats.totalHours.toFixed(1)}{" "}
            hours/week. Verify this is within university guidelines.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-baylor-green text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-full">
              <User size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Edit Student Worker</h2>
              <p className="text-sm text-white/80">
                {formData.name || "New Student"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (canDeleteStudent) setShowDeleteConfirm(true);
              }}
              disabled={!canDeleteStudent}
              className={`p-2 rounded-full transition-colors ${
                canDeleteStudent
                  ? "text-white/80 hover:text-white hover:bg-white/20"
                  : "text-white/40 cursor-not-allowed"
              }`}
              title={
                canDeleteStudent
                  ? "Delete Student"
                  : "You do not have permission to delete students"
              }
            >
              <Trash2 size={20} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-full transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Summary Bar */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-baylor-green" />
              <span className="font-medium">
                {stats.totalHours.toFixed(1)} hrs/week
              </span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign size={16} className="text-baylor-green" />
              <span className="font-medium">
                ${stats.weeklyPay.toFixed(2)}/week
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Building size={16} className="text-baylor-green" />
              <span className="font-medium">
                {stats.jobCount} job{stats.jobCount !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="ml-auto">
              <StatusBadge status={currentStatus} />
            </div>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Tabs */}
          <div className="w-64 bg-gray-50 border-r border-gray-200 p-4">
            <nav className="space-y-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                      activeTab === tab.id
                        ? "bg-baylor-green text-white"
                        : "text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    <Icon size={18} />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Quick Actions */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">
                Quick Actions
              </p>
              <div className="space-y-2">
                <button
                  onClick={() =>
                    updateField("isActive", formData.isActive === false)
                  }
                  className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    formData.isActive !== false
                      ? "bg-red-100 text-red-700 hover:bg-red-200"
                      : "bg-green-100 text-green-700 hover:bg-green-200"
                  }`}
                >
                  {formData.isActive !== false
                    ? "Deactivate Student"
                    : "Activate Student"}
                </button>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === "basic" && <BasicInfoTab />}
            {activeTab === "jobs" && <JobsTab />}
            {activeTab === "employment" && <EmploymentTab />}
            {activeTab === "payroll" && <PayrollTab />}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-between items-center bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors font-medium"
            >
              <Check size={18} />
              Save Changes
            </button>
          </div>
        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md mx-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 rounded-full">
                  <Trash2 size={24} className="text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Delete Student?
                </h3>
              </div>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete <strong>{formData.name}</strong>
                ? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!canDeleteStudent) return;
                    onDelete(student.id);
                    onClose();
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Delete Student
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentEditModal;
