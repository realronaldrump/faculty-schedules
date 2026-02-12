const csvQuote = (value) => `"${value || ""}"`;

const rowsToCsv = (headers, rows) => {
  return [
    headers.join(","),
    ...rows.map((row) =>
      Object.values(row)
        .map((val) => csvQuote(val))
        .join(","),
    ),
  ].join("\n");
};

export const buildOutlookEmailFormat = (peopleData = []) => {
  return peopleData
    .filter((person) => person.email && person.email.trim() !== "")
    .map((person) => `"${person.name}" <${person.email}>`)
    .join("; ");
};

export const buildGmailEmailFormat = (peopleData = [], mode = "new") => {
  const emails = peopleData
    .filter((person) => person.email && person.email.trim() !== "")
    .map((person) => person.email);
  const separator = mode === "old" ? "; " : ", ";
  return emails.join(separator);
};

export const buildStudentWorkersCsv = (peopleToExport = []) => {
  const headers = ["Name", "Email", "Phone", "Job Titles", "Buildings"];
  const rows = peopleToExport.map((person) => ({
    Name: person.name || "",
    Email: person.email || "",
    Phone: person.phone || "",
    "Job Titles": person.allJobTitles.join("; "),
    Buildings: person.buildings.join("; "),
  }));

  return rowsToCsv(headers, rows);
};

export const buildDirectoryCsv = (
  peopleToExport = [],
  resolveBuildingName = () => "",
) => {
  const headers = [
    "Name",
    "Email",
    "Phone",
    "Role",
    "Job Title",
    "Program",
    "Office",
    "Building",
    "Is Adjunct",
    "Is Tenured",
    "Is UPD",
    "Is Remote",
    "Course Count (current semester)",
    "Courses Taught (current semester)",
  ];

  const rows = peopleToExport.map((person) => ({
    Name: person.name || "",
    Email: person.email || "",
    Phone: person.phone || "",
    Role: person.role || "",
    "Job Title": person.jobTitle || "",
    Program: person.program?.name || "",
    Office: person.office || "",
    Building: resolveBuildingName(person) || "No Building",
    "Is Adjunct": person.isAdjunct ? "Yes" : "No",
    "Is Tenured": person.isTenured ? "Yes" : "No",
    "Is UPD": person.isUPD ? "Yes" : "No",
    "Is Remote": person.isRemote ? "Yes" : "No",
    "Course Count (current semester)": person.courseCount || 0,
    "Courses Taught (current semester)":
      person.courses && person.courses.length > 0
        ? person.courses
            .map((course) => `${course.courseCode} (${course.credits} cr) - ${course.courseTitle}`)
            .join("; ")
        : "",
  }));

  return rowsToCsv(headers, rows);
};
