import defaultClssProfile from "../../../config/import/clss/default-profile.json";

export const REQUIRED_CLSS_FIELDS = [
  "clss_id",
  "course_code",
  "section",
  "crn",
  "instructor",
  "term",
];

export const normalizeHeaderToken = (value) =>
  (value || "")
    .toString()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const ensureArray = (value) => (Array.isArray(value) ? value : []);

export const validateClssProfile = (profile = {}) => {
  const errors = [];
  if (!profile || typeof profile !== "object") {
    return { isValid: false, errors: ["CLSS profile must be an object"] };
  }

  if (!profile.id || typeof profile.id !== "string") {
    errors.push("CLSS profile requires string id");
  }
  if (!profile.version || typeof profile.version !== "string") {
    errors.push("CLSS profile requires string version");
  }

  const fields =
    profile.fields && typeof profile.fields === "object" ? profile.fields : {};

  const requiredFields = ensureArray(profile.requiredFields);
  if (requiredFields.length === 0) {
    errors.push("CLSS profile must define requiredFields");
  }

  REQUIRED_CLSS_FIELDS.forEach((field) => {
    if (!requiredFields.includes(field)) {
      errors.push(`Missing required field declaration: ${field}`);
    }
  });

  requiredFields.forEach((fieldId) => {
    const config = fields[fieldId];
    if (!config || typeof config !== "object") {
      errors.push(`Missing field config for ${fieldId}`);
      return;
    }
    const aliases = ensureArray(config.aliases);
    if (aliases.length === 0) {
      errors.push(`Field ${fieldId} must define at least one alias`);
    }
  });

  return { isValid: errors.length === 0, errors };
};

export const compileClssProfile = (profile = defaultClssProfile) => {
  const validation = validateClssProfile(profile);
  if (!validation.isValid) {
    throw new Error(
      `Invalid CLSS profile: ${validation.errors.join("; ")}`,
    );
  }

  const fields = Object.entries(profile.fields || {}).map(([fieldId, config]) => {
    const aliases = ensureArray(config.aliases);
    const normalizedAliases = Array.from(
      new Set(
        aliases
          .map((alias) => normalizeHeaderToken(alias))
          .filter(Boolean),
      ),
    );
    return {
      fieldId,
      aliases,
      normalizedAliases,
      required: ensureArray(profile.requiredFields).includes(fieldId),
    };
  });

  return {
    id: profile.id,
    version: profile.version,
    description: profile.description || "",
    requiredFields: [...ensureArray(profile.requiredFields)],
    fields,
  };
};

export const getDefaultClssProfile = () => compileClssProfile(defaultClssProfile);

export default {
  REQUIRED_CLSS_FIELDS,
  normalizeHeaderToken,
  validateClssProfile,
  compileClssProfile,
  getDefaultClssProfile,
};
