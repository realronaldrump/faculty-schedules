import React, { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  User,
  Clock,
  Building,
  Check,
  AlertCircle,
  DollarSign,
  Calendar,
  GraduationCap,
} from "lucide-react";
import JobCard from "./JobCard";
import TimelineVisualization from "./TimelineVisualization";
import StatusBadge, { getStudentStatus } from "./StatusBadge";
import { parseStudentWorkerDate } from "../../utils/studentWorkers";

/**
 * StudentAddWizard - Step-by-step wizard for adding new student workers
 *
 * Breaks down the student creation process into 4 manageable steps:
 * 1. Basic Information (name, email, phone)
 * 2. Employment Details (dates, status)
 * 3. Job Assignments (jobs with schedules and buildings)
 * 4. Review & Confirm (summary and validation)
 */

const STEPS = [
  { id: "basic", label: "Basic Info", icon: User },
  { id: "employment", label: "Employment", icon: Calendar },
  { id: "jobs", label: "Jobs", icon: Building },
  { id: "review", label: "Review", icon: Check },
];

const formatStudentWorkerDate = (value) => {
  const parsed = parseStudentWorkerDate(value);
  return parsed ? parsed.toLocaleDateString() : "";
};

const StudentAddWizard = ({
  onSave,
  onCancel,
  availableBuildings = [],
  supervisorOptions = [],
  existingJobTitles = [],
  semesterLabel = "",
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [student, setStudent] = useState({
    name: "",
    email: "",
    phone: "",
    hasNoPhone: false,
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    isActive: true,
    jobs: [],
  });
  const [errors, setErrors] = useState({});
  const [editingJobIndex, setEditingJobIndex] = useState(null);

  const supervisorLabelById = useMemo(() => {
    return new Map(
      (supervisorOptions || [])
        .filter((option) => option?.id && option?.label)
        .map((option) => [option.id, option.label]),
    );
  }, [supervisorOptions]);

  const resolveSupervisorLabel = (job) => {
    if (job?.supervisorId && supervisorLabelById.has(job.supervisorId)) {
      return supervisorLabelById.get(job.supervisorId);
    }
    return job?.supervisor || "No supervisor";
  };

  // Validation for each step
  const validateStep = (stepIndex) => {
    const newErrors = {};

    if (stepIndex === 0) {
      if (!student.name?.trim()) {
        newErrors.name = "Name is required";
      }
      if (!student.email?.trim()) {
        newErrors.email = "Email is required";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email)) {
        newErrors.email = "Please enter a valid email address";
      }
      if (!student.hasNoPhone && !student.phone?.trim()) {
        newErrors.phone = 'Phone number is required (or check "No Phone")';
      }
    }

    if (stepIndex === 1) {
      // Validate employment dates
      if (student.startDate && student.endDate) {
        const start = parseStudentWorkerDate(student.startDate);
        const end = parseStudentWorkerDate(student.endDate);
        if (start && end && end < start) {
          newErrors.endDate = "End date cannot be before start date";
        }
      }
    }

    if (stepIndex === 2) {
      const validJobs = (student.jobs || []).filter(
        (job) =>
          job.jobTitle?.trim() ||
          job.supervisor?.trim() ||
          job.hourlyRate ||
          (Array.isArray(job.location) && job.location.length > 0) ||
          (Array.isArray(job.weeklySchedule) && job.weeklySchedule.length > 0),
      );
      if (validJobs.length === 0) {
        newErrors.jobs = "Add at least one job assignment with meaningful data";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
      setErrors({});
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
    setErrors({});
  };

  const updateStudent = (updates) => {
    setStudent((prev) => ({ ...prev, ...updates }));
    // Clear errors for updated fields
    const updatedFields = Object.keys(updates);
    setErrors((prev) => {
      const newErrors = { ...prev };
      updatedFields.forEach((field) => delete newErrors[field]);
      return newErrors;
    });
  };

  // Job management
  const addJob = (job) => {
    updateStudent({
      jobs: [...student.jobs, { ...job, id: Date.now().toString() }],
    });
    setEditingJobIndex(null);
  };

  const updateJob = (index, updates) => {
    const newJobs = [...student.jobs];
    newJobs[index] = { ...newJobs[index], ...updates };
    updateStudent({ jobs: newJobs });
  };

  const removeJob = (index) => {
    updateStudent({
      jobs: student.jobs.filter((_, i) => i !== index),
    });
  };

  // Calculate totals
  const calculateTotalHours = () => {
    return student.jobs.reduce((total, job) => {
      return (
        total +
        (job.weeklySchedule?.reduce((sum, entry) => {
          const start = parseTime(entry.start);
          const end = parseTime(entry.end);
          return sum + (end - start) / 60;
        }, 0) || 0)
      );
    }, 0);
  };

  const calculateWeeklyPay = () => {
    return student.jobs.reduce((total, job) => {
      const hours =
        job.weeklySchedule?.reduce((sum, entry) => {
          const start = parseTime(entry.start);
          const end = parseTime(entry.end);
          return sum + (end - start) / 60;
        }, 0) || 0;
      return total + hours * (parseFloat(job.hourlyRate) || 0);
    }, 0);
  };

  const parseTime = (timeStr) => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const formatCurrency = (value) => {
    return `$${value.toFixed(2)}`;
  };

  // Get current status
  const currentStatus = getStudentStatus(student);

  // Step Render Functions
  const renderBasicInfoStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-lg font-semibold text-gray-900">
          Basic Information
        </h3>
        <p className="text-sm text-gray-600">
          Enter the student's contact details
        </p>
      </div>

      <div className="space-y-4 max-w-md mx-auto">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={student.name}
            onChange={(e) => updateStudent({ name: e.target.value })}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green ${
              errors.name ? "border-red-500" : "border-gray-300"
            }`}
            placeholder="e.g., John Doe"
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
            value={student.email}
            onChange={(e) => updateStudent({ email: e.target.value })}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green ${
              errors.email ? "border-red-500" : "border-gray-300"
            }`}
            placeholder="student@baylor.edu"
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
              value={student.phone}
              disabled={student.hasNoPhone}
              onChange={(e) => updateStudent({ phone: e.target.value })}
              className={`flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green ${
                errors.phone ? "border-red-500" : "border-gray-300"
              } ${student.hasNoPhone ? "bg-gray-100" : ""}`}
              placeholder="(254) 710-1234"
            />
            <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={student.hasNoPhone}
                onChange={(e) =>
                  updateStudent({ hasNoPhone: e.target.checked, phone: "" })
                }
                className="rounded text-baylor-green focus:ring-baylor-green"
              />
              <span className="text-sm text-gray-600 whitespace-nowrap">
                No Phone
              </span>
            </label>
          </div>
          {errors.phone && (
            <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
              <AlertCircle size={14} />
              {errors.phone}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const renderEmploymentStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-lg font-semibold text-gray-900">
          Employment Details
        </h3>
        <p className="text-sm text-gray-600">
          Set the employment period and status
        </p>
      </div>

      <div className="max-w-md mx-auto space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={student.startDate || ""}
              onChange={(e) => updateStudent({ startDate: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date (Optional)
            </label>
            <input
              type="date"
              value={student.endDate || ""}
              onChange={(e) => updateStudent({ endDate: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
              min={student.startDate}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
          <input
            type="checkbox"
            id="isActive"
            checked={student.isActive}
            onChange={(e) => updateStudent({ isActive: e.target.checked })}
            className="h-5 w-5 rounded text-baylor-green focus:ring-baylor-green"
          />
          <label
            htmlFor="isActive"
            className="text-sm font-medium text-gray-700"
          >
            Active Student Worker
          </label>
        </div>

        {/* Timeline Preview */}
        <div className="mt-6">
          <TimelineVisualization
            studentStartDate={student.startDate}
            studentEndDate={student.endDate}
            jobs={student.jobs}
            compact={true}
          />
        </div>

        {/* Status Preview */}
        <div className="flex items-center justify-center gap-3 p-4 bg-gray-50 rounded-lg">
          <span className="text-sm text-gray-600">Current Status:</span>
          <StatusBadge status={currentStatus} />
        </div>
      </div>
    </div>
  );

  const renderJobsStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Job Assignments</h3>
        <p className="text-sm text-gray-600">
          Add one or more job assignments with schedules
          {semesterLabel && ` for ${semesterLabel}`}
        </p>
      </div>

      {/* Job Cards */}
      <div className="space-y-3 max-w-2xl mx-auto">
        {student.jobs.map((job, idx) => (
          <JobCard
            key={job.id}
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
            supervisorOptions={supervisorOptions}
            existingJobTitles={existingJobTitles}
          />
        ))}
      </div>

      {errors.jobs && (
        <div className="max-w-2xl mx-auto flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
          <AlertCircle size={16} />
          {errors.jobs}
        </div>
      )}

      {/* Add Job Button */}
      {editingJobIndex === null && (
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => setEditingJobIndex("new")}
            className="w-full py-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-baylor-green hover:text-baylor-green transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            Add Job Assignment
          </button>
        </div>
      )}

      {/* New Job Form */}
      {editingJobIndex === "new" && (
        <div className="max-w-2xl mx-auto">
          <JobCard
            job={{
              jobTitle: "",
              supervisor: "",
              supervisorId: "",
              hourlyRate: "",
              buildings: [],
              weeklySchedule: [],
              startDate: student.startDate,
              endDate: student.endDate,
            }}
            isEditing={true}
            onSave={addJob}
            onCancel={() => setEditingJobIndex(null)}
            availableBuildings={availableBuildings}
            supervisorOptions={supervisorOptions}
            existingJobTitles={existingJobTitles}
          />
        </div>
      )}

      {/* Summary Stats */}
      {student.jobs.length > 0 && (
        <div className="max-w-2xl mx-auto mt-6 p-4 bg-baylor-gold/10 rounded-lg border border-baylor-gold/30">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-baylor-green">
                {calculateTotalHours().toFixed(1)}
              </p>
              <p className="text-sm text-gray-600">Total Hours/Week</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-baylor-green">
                {formatCurrency(calculateWeeklyPay())}
              </p>
              <p className="text-sm text-gray-600">Est. Weekly Pay</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-lg font-semibold text-gray-900">
          Review & Confirm
        </h3>
        <p className="text-sm text-gray-600">
          Verify all information before saving
        </p>
      </div>

      <div className="max-w-2xl mx-auto space-y-4">
        {/* Student Info Summary */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <User size={18} className="text-baylor-green" />
            <h4 className="font-medium text-gray-900">Student Information</h4>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Name:</span>
              <span className="ml-2 font-medium">{student.name}</span>
            </div>
            <div>
              <span className="text-gray-500">Email:</span>
              <span className="ml-2 font-medium">{student.email}</span>
            </div>
            <div>
              <span className="text-gray-500">Phone:</span>
              <span className="ml-2 font-medium">
                {student.hasNoPhone ? "No phone on file" : student.phone}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>
              <span className="ml-2">
                <StatusBadge status={currentStatus} size="sm" />
              </span>
            </div>
          </div>
        </div>

        {/* Employment Summary */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={18} className="text-baylor-green" />
            <h4 className="font-medium text-gray-900">Employment Period</h4>
          </div>
          <p className="text-sm">
            {formatStudentWorkerDate(student.startDate)}
            {" → "}
            {student.endDate
              ? formatStudentWorkerDate(student.endDate)
              : "Ongoing"}
          </p>
        </div>

        {/* Jobs Summary */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building size={18} className="text-baylor-green" />
            <h4 className="font-medium text-gray-900">
              Job Assignments ({student.jobs.length})
            </h4>
          </div>
          <div className="space-y-2">
            {student.jobs.map((job, idx) => (
              <div
                key={idx}
                className="text-sm border-l-2 border-baylor-green pl-3 py-1"
              >
                <p className="font-medium">{job.jobTitle}</p>
                <p className="text-gray-600">
                  {resolveSupervisorLabel(job)} • ${job.hourlyRate || "0.00"}/hr
                </p>
                <p className="text-gray-500 text-xs">
                  {job.weeklySchedule?.length || 0} schedule entries
                  {job.buildings?.length > 0 &&
                    ` • ${job.buildings.length} locations`}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Financial Summary */}
        <div className="bg-baylor-green/5 rounded-lg p-4 border border-baylor-green/20">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign size={18} className="text-baylor-green" />
            <h4 className="font-medium text-baylor-green">Payroll Summary</h4>
          </div>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-xl font-bold text-baylor-green">
                {calculateTotalHours().toFixed(1)} hrs
              </p>
              <p className="text-xs text-gray-600">Weekly Hours</p>
            </div>
            <div>
              <p className="text-xl font-bold text-baylor-green">
                {formatCurrency(calculateWeeklyPay())}
              </p>
              <p className="text-xs text-gray-600">Weekly Pay</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3 text-center">
            Estimated monthly: {formatCurrency(calculateWeeklyPay() * 4)}
          </p>
        </div>

        {/* Warnings */}
        {calculateTotalHours() > 20 && (
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle
              size={18}
              className="text-amber-600 flex-shrink-0 mt-0.5"
            />
            <p className="text-sm text-amber-800">
              This student is scheduled for {calculateTotalHours().toFixed(1)}{" "}
              hours/week. Verify this is within university guidelines.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow-lg max-w-4xl mx-auto">
      {/* Header with Stepper */}
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-baylor-green/10 p-2 rounded-full">
              <GraduationCap size={24} className="text-baylor-green" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              Add Student Worker
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-between">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = idx === currentStep;
            const isCompleted = idx < currentStep;
            const isPending = idx > currentStep;

            return (
              <div key={step.id} className="flex items-center flex-1">
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                    isActive
                      ? "bg-baylor-green text-white"
                      : isCompleted
                        ? "bg-baylor-green/20 text-baylor-green"
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  <div
                    className={`${isCompleted ? "bg-baylor-green text-white" : ""} rounded-full p-0.5`}
                  >
                    <Icon size={16} />
                  </div>
                  <span className="text-sm font-medium hidden sm:block">
                    {step.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 ${
                      isCompleted ? "bg-baylor-green/50" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 min-h-[400px]">
        {currentStep === 0 && renderBasicInfoStep()}
        {currentStep === 1 && renderEmploymentStep()}
        {currentStep === 2 && renderJobsStep()}
        {currentStep === 3 && renderReviewStep()}
      </div>

      {/* Footer Navigation */}
      <div className="border-t border-gray-200 p-6 flex justify-between">
        <button
          onClick={handleBack}
          disabled={currentStep === 0}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={16} />
          Back
        </button>

        {currentStep < STEPS.length - 1 ? (
          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-6 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
          >
            Next
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={() => onSave(student)}
            className="flex items-center gap-2 px-6 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
          >
            <Check size={16} />
            Save Student
          </button>
        )}
      </div>
    </div>
  );
};

export default StudentAddWizard;
