export const getScheduleInstructorReferenceIds = (schedule = {}) => {
  const ids = new Set();
  const addId = (value) => {
    if (value === null || value === undefined) return;
    const id = String(value).trim();
    if (id) ids.add(id);
  };

  addId(schedule.instructorId);
  addId(schedule.InstructorId);

  if (Array.isArray(schedule.instructorIds)) {
    schedule.instructorIds.forEach(addId);
  }

  if (Array.isArray(schedule.instructorAssignments)) {
    schedule.instructorAssignments.forEach((assignment) => {
      addId(assignment?.personId);
      addId(assignment?.instructorId);
      addId(assignment?.id);
    });
  }

  return Array.from(ids);
};

export const scheduleReferencesPerson = (schedule = {}, personId = "") => {
  const id = String(personId || "").trim();
  return id ? getScheduleInstructorReferenceIds(schedule).includes(id) : false;
};
