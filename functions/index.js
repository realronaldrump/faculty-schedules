const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

const normalizeRoleList = (roles) => {
  if (Array.isArray(roles)) {
    return roles.filter(Boolean);
  }
  if (roles && typeof roles === "object") {
    return Object.keys(roles).filter((key) => roles[key]);
  }
  if (typeof roles === "string" && roles.trim()) {
    return [roles.trim()];
  }
  return [];
};

exports.deleteUser = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const targetUid = request.data?.uid;
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "A valid uid is required.");
  }

  if (targetUid === callerUid) {
    throw new HttpsError(
      "failed-precondition",
      "You cannot delete your own account.",
    );
  }

  const callerSnap = await db.doc(`users/${callerUid}`).get();
  if (!callerSnap.exists) {
    throw new HttpsError("permission-denied", "Caller profile not found.");
  }
  const callerRoles = normalizeRoleList(callerSnap.data()?.roles);
  if (!callerRoles.includes("admin")) {
    throw new HttpsError("permission-denied", "Admin role required.");
  }

  const targetRef = db.doc(`users/${targetUid}`);
  const targetSnap = await targetRef.get();
  const targetData = targetSnap.exists ? targetSnap.data() : null;

  let authDeleted = false;
  try {
    await auth.deleteUser(targetUid);
    authDeleted = true;
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      throw new HttpsError("internal", "Failed to delete auth account.");
    }
  }

  try {
    await targetRef.delete();
  } catch (error) {
    throw new HttpsError("internal", "Failed to delete user profile.");
  }

  await db.collection("changeLog").add({
    timestamp: new Date().toISOString(),
    action: "DELETE",
    entity: `User Profile - ${targetData?.email || targetUid}`,
    collection: "users",
    documentId: targetUid,
    originalData: targetData || null,
    source: "functions.deleteUser",
    metadata: {
      authDeleted,
      profileExisted: targetSnap.exists,
    },
    userId: callerUid,
  });

  return {
    success: true,
    authDeleted,
    profileDeleted: targetSnap.exists,
  };
});
