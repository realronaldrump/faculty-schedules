import { formatDirectorAssignmentList } from "../../../utils/directorAssignments";
import { buildCSVContent } from "../../../utils/csvUtils";

const rowsToCsv = (headers, rows) => {
  return buildCSVContent(
    headers,
    rows.map((row) => headers.map((header) => row[header] ?? "")),
  );
};

const getUniqueEmailContacts = (peopleData = []) => {
  const seen = new Set();
  return peopleData.flatMap((person) => {
    const email = String(person?.email || "").trim();
    if (!email) return [];
    const key = email.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...person, email }];
  });
};

const quoteEmailDisplayName = (value) =>
  `"${String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')}"`;

export const buildOutlookEmailFormat = (peopleData = []) => {
  return getUniqueEmailContacts(peopleData)
    .map((person) => {
      const name = String(person?.name || "").trim();
      return name ? `${quoteEmailDisplayName(name)} <${person.email}>` : person.email;
    })
    .join("; ");
};

export const buildGmailEmailFormat = (peopleData = [], mode = "new") => {
  const emails = getUniqueEmailContacts(peopleData).map((person) => person.email);
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
    "Director Roles",
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
    "Director Roles": formatDirectorAssignmentList(person.directorAssignments),
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
