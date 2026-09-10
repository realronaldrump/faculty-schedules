const keyFor = (uid) => `activity-console:v1:${uid || "owner"}`;
export const readActivityPreferences = (uid) => {
  try {
    const data = JSON.parse(localStorage.getItem(keyFor(uid)) || "{}");
    return {
      lastVisit: typeof data.lastVisit === "string" ? data.lastVisit : "",
      excludeOwner: data.excludeOwner !== false,
      reviewed:
        data.reviewed && typeof data.reviewed === "object" ? data.reviewed : {},
    };
  } catch {
    return { lastVisit: "", excludeOwner: true, reviewed: {} };
  }
};
export const saveActivityPreferences = (uid, patch) => {
  try {
    localStorage.setItem(
      keyFor(uid),
      JSON.stringify({ ...readActivityPreferences(uid), ...patch }),
    );
    return true;
  } catch {
    return false;
  }
};
