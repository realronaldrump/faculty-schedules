// Client source of truth for the owner (developer) UID. The same value is
// duplicated in firestore.rules (isOwner) because rules cannot import this module.
const OWNER_UID = "fjQuh4iAMFYi8URf35Yv5RRijKw2";
const OWNER_ONLY_PAGE_IDS = new Set(["admin/user-activity", "admin/accounts"]);

export const isOwnerUid = (uid) => typeof uid === "string" && uid === OWNER_UID;

export const isOwnerOnlyPageId = (pageId) => OWNER_ONLY_PAGE_IDS.has(pageId);
