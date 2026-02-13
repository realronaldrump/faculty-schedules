export const ACTIVITY_OWNER_UID = "fjQuh4iAMFYi8URf35Yv5RRijKw2";
export const ACTIVITY_OWNER_PAGE_ID = "admin/user-activity";

export const isActivityOwnerUid = (uid) =>
  typeof uid === "string" && uid === ACTIVITY_OWNER_UID;

export const isOwnerOnlyPageId = (pageId) => pageId === ACTIVITY_OWNER_PAGE_ID;
