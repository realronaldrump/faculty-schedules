import {
  getDirectorRoleAbbreviation,
  getDirectorRoleLabel,
  normalizeDirectorRole,
  DIRECTOR_ROLES,
} from "../../utils/directorAssignments";

/**
 * DirectorRoleBadge - the shared pill for program-director roles.
 *
 * Renders the role abbreviation (UPD/GPD) with a role-specific tone and a
 * tooltip carrying the full role name (plus the program when provided), so
 * every view labels director assignments the same way.
 */
const ROLE_TONES = {
  [DIRECTOR_ROLES.UPD]: "bg-amber-100 text-amber-800 border-amber-200",
  [DIRECTOR_ROLES.GPD]: "bg-sky-100 text-sky-800 border-sky-200",
};

const DirectorRoleBadge = ({ role, programName = "", className = "" }) => {
  const normalizedRole = normalizeDirectorRole(role);
  if (!normalizedRole) return null;

  const label = getDirectorRoleLabel(normalizedRole);
  const title = programName ? `${label} — ${programName}` : label;

  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium ${ROLE_TONES[normalizedRole]} ${className}`}
    >
      {getDirectorRoleAbbreviation(normalizedRole)}
    </span>
  );
};

export default DirectorRoleBadge;
