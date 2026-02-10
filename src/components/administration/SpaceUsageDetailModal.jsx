import React, { useEffect, useMemo, useState } from "react";
import { Briefcase, Calendar, Mail, Users, X } from "lucide-react";

const getPersonDisplayName = (person) => {
  if (!person) return "Unknown";
  const name = `${person.firstName || ""} ${person.lastName || ""}`.trim();
  const fallback = (person.name || "").toString().trim();
  return name || fallback || person.email || person.id || "Unknown";
};

const getScheduleTitle = (schedule) => {
  if (!schedule) return "";
  return (
    (schedule.courseTitle ||
      schedule["Course Title"] ||
      schedule.Title ||
      schedule.title ||
      "") + ""
  ).trim();
};

const getScheduleCourseLabel = (schedule) => {
  if (!schedule) return "";
  const course = ((schedule.Course || schedule.courseCode || "") + "").trim();
  const section = ((schedule.Section || schedule.section || "") + "").trim();
  if (!course && !section) return "";
  if (course && section) return `${course} (Sec ${section})`;
  return course || section;
};

const getScheduleMeta = (schedule) => {
  if (!schedule) return { term: "", when: "", instructor: "", crn: "" };
  const term = ((schedule.Term || schedule.term || "") + "").trim();
  const day = ((schedule.Day || schedule.day || "") + "").trim();
  const start = (
    (schedule["Start Time"] || schedule.startTime || "") + ""
  ).trim();
  const end = ((schedule["End Time"] || schedule.endTime || "") + "").trim();
  const whenParts = [];
  if (day) whenParts.push(day);
  if (start && end) whenParts.push(`${start} - ${end}`);
  else if (start || end) whenParts.push(start || end);
  const when = whenParts.join(" ");
  const instructor = (
    (schedule.Instructor || schedule.instructorName || "") + ""
  ).trim();
  const crn = ((schedule.CRN || schedule.crn || "") + "").trim();
  return { term, when, instructor, crn };
};

const normalizeTab = (value) => (value === "office" ? "office" : "scheduled");

const SpaceUsageDetailModal = ({
  isOpen,
  space,
  usage,
  initialTab = "scheduled",
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState(normalizeTab(initialTab));

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(normalizeTab(initialTab));
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const schedules = useMemo(() => {
    const raw = Array.isArray(usage?.schedules) ? usage.schedules : [];
    // Dedupe defensively by id (scheduleData should already be unique).
    const seen = new Set();
    const out = [];
    raw.forEach((s) => {
      const key = s?.id || s?._originalId;
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(s);
    });
    return out;
  }, [usage]);

  const officePeople = useMemo(() => {
    const raw = Array.isArray(usage?.officePeople) ? usage.officePeople : [];
    const seen = new Set();
    const out = [];
    raw.forEach((p) => {
      const key = p?.id || p?.email || getPersonDisplayName(p);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(p);
    });
    out.sort((a, b) =>
      getPersonDisplayName(a).localeCompare(getPersonDisplayName(b)),
    );
    return out;
  }, [usage]);

  const scheduledCount = schedules.length;
  const officeCount = officePeople.length;

  if (!isOpen || !space) return null;

  const spaceKey = (space.spaceKey || space.id || "").toString().trim();
  const displayName = (
    (space.displayName || space.name || "") + ""
  ).trim();
  const type = ((space.type || "") + "").trim();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Usage Details</div>
            <h3 className="modal-title truncate">{spaceKey || "Space"}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {displayName ? (
                <span className="text-sm text-gray-700">{displayName}</span>
              ) : null}
              {type ? (
                <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">
                  {type}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            aria-label="Close usage details"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("scheduled")}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                activeTab === "scheduled"
                  ? "bg-blue-50 border-blue-200 text-blue-800"
                  : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Calendar size={16} />
              Classes ({scheduledCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("office")}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                activeTab === "office"
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Briefcase size={16} />
              Office ({officeCount})
            </button>
          </div>

          {activeTab === "scheduled" ? (
            scheduledCount === 0 ? (
              <div className="text-sm text-gray-600">
                No scheduled classes reference this space.
              </div>
            ) : (
              <div className="space-y-2">
                {schedules.map((s) => {
                  const label = getScheduleCourseLabel(s) || "Scheduled Class";
                  const title = getScheduleTitle(s);
                  const meta = getScheduleMeta(s);

                  return (
                    <div
                      key={s.id || s._originalId || label}
                      className="border border-gray-200 rounded-lg p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-baylor-green">
                            {label}
                          </div>
                          {title ? (
                            <div className="text-sm text-gray-800">
                              {title}
                            </div>
                          ) : null}
                        </div>
                        {meta.term ? (
                          <div className="text-xs text-gray-500">
                            {meta.term}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
                        {meta.when ? (
                          <span>
                            <span className="font-medium text-gray-700">
                              When:
                            </span>{" "}
                            {meta.when}
                          </span>
                        ) : null}
                        {meta.instructor ? (
                          <span>
                            <span className="font-medium text-gray-700">
                              Instructor:
                            </span>{" "}
                            {meta.instructor}
                          </span>
                        ) : null}
                        {meta.crn ? (
                          <span>
                            <span className="font-medium text-gray-700">
                              CRN:
                            </span>{" "}
                            {meta.crn}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : officeCount === 0 ? (
            <div className="text-sm text-gray-600">
              No one is currently assigned to this office in the directory.
            </div>
          ) : (
            <div className="space-y-2">
              {officePeople.map((p) => {
                const name = getPersonDisplayName(p);
                const email = ((p?.email || "") + "").trim();
                const jobTitle = ((p?.jobTitle || "") + "").trim();
                return (
                  <div
                    key={p.id || p.email || name}
                    className="border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Users size={16} className="text-gray-500" />
                          <div className="font-medium text-gray-900 truncate">
                            {name}
                          </div>
                        </div>
                        {jobTitle ? (
                          <div className="mt-1 text-sm text-gray-700">
                            {jobTitle}
                          </div>
                        ) : null}
                        {email ? (
                          <div className="mt-1 inline-flex items-center gap-2 text-sm text-gray-600">
                            <Mail size={14} />
                            <span className="truncate">{email}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SpaceUsageDetailModal;

