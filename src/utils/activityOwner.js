// Client source of truth for the owner UID. The same value is duplicated in
// firestore.rules (isActivityOwner) and functions/index.js (ACTIVITY_OWNER_UID)
// because rules/functions cannot import this module — update all three together.
const ACTIVITY_OWNER_UID = "fjQuh4iAMFYi8URf35Yv5RRijKw2";
const ACTIVITY_OWNER_PAGE_ID = "admin/user-activity";

export const isActivityOwnerUid = (uid) =>
  typeof uid === "string" && uid === ACTIVITY_OWNER_UID;

export const isOwnerOnlyPageId = (pageId) => pageId === ACTIVITY_OWNER_PAGE_ID;
