const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  hasSerializedValueChanged,
  isValidBaylorId,
  normalizeBaylorId,
  scrubRemovedBaylorId,
} = require("./baylorId");

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

// Callable functions v2 require explicit CORS config when invoked from non-Firebase
// origins (for example, a Vercel-hosted SPA).
const ALLOWED_CALLABLE_ORIGINS = [
  "https://faculty-schedules.vercel.app",
  // Local dev
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  // Vercel preview deployments
  /^https:\/\/faculty-schedules(?:-[a-z0-9-]+)?\.vercel\.app$/,
];

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

const assertAdminCaller = async (callerUid) => {
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const callerSnap = await db.doc(`users/${callerUid}`).get();
  if (!callerSnap.exists) {
    throw new HttpsError("permission-denied", "Caller profile not found.");
  }

  const callerRoles = normalizeRoleList(callerSnap.data()?.roles);
  if (!callerRoles.includes("admin")) {
    throw new HttpsError("permission-denied", "Admin role required.");
  }

  return callerSnap.data() || {};
};

const getPersonDisplayName = (person = {}, fallbackId = "") => {
  const explicitName = (person.name || "").toString().trim();
  if (explicitName) return explicitName;
  const fullName = `${person.firstName || ""} ${person.lastName || ""}`.trim();
  return fullName || person.email || fallbackId || "Unknown";
};

const buildBaylorIdRemovalPersonUpdate = (personData = {}, removedBaylorId) => {
  const removedIdentityKey = removedBaylorId ? `baylor:${removedBaylorId}` : "";
  const existingIdentityKeys = Array.isArray(personData.identityKeys)
    ? personData.identityKeys.filter((key) => key !== removedIdentityKey)
    : [];
  const currentIdentityKey =
    typeof personData.identityKey === "string" ? personData.identityKey : "";
  const nextIdentityKey =
    currentIdentityKey === removedIdentityKey
      ? existingIdentityKeys[0] || null
      : currentIdentityKey || existingIdentityKeys[0] || null;
  const nextIdentitySource = nextIdentityKey
    ? nextIdentityKey.split(":")[0] || null
    : personData.identitySource === "baylor"
      ? null
      : personData.identitySource || null;

  return {
    baylorId: null,
    "externalIds.baylorId": null,
    identityKey: nextIdentityKey,
    identityKeys: existingIdentityKeys,
    identitySource: nextIdentitySource,
  };
};

exports.deleteUser = onCall(
  {
    region: "us-central1",
    cors: ALLOWED_CALLABLE_ORIGINS,
    // Callable functions must be reachable from browsers; auth is enforced via Firebase Auth tokens,
    // not Cloud Run IAM.
    invoker: "public",
  },
  async (request) => {
  const callerUid = request.auth?.uid;
  await assertAdminCaller(callerUid);

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
  },
);

exports.updateBaylorId = onCall(
  {
    region: "us-central1",
    cors: ALLOWED_CALLABLE_ORIGINS,
    invoker: "public",
  },
  async (request) => {
    const callerUid = request.auth?.uid;
    const callerProfile = await assertAdminCaller(callerUid);

    const personId =
      typeof request.data?.personId === "string"
        ? request.data.personId.trim()
        : "";
    if (!personId) {
      throw new HttpsError("invalid-argument", "A valid personId is required.");
    }

    const explicitRemove = request.data?.remove === true;
    const rawBaylorId = request.data?.baylorId;
    const blankBaylorIdSubmission =
      rawBaylorId === null ||
      (typeof rawBaylorId === "string" && rawBaylorId.trim() === "");
    const requestedBaylorId = normalizeBaylorId(rawBaylorId);
    const shouldRemove = explicitRemove || blankBaylorIdSubmission;

    if (!shouldRemove && !isValidBaylorId(requestedBaylorId)) {
      throw new HttpsError(
        "invalid-argument",
        "Baylor ID must be exactly 9 digits.",
      );
    }

    const now = new Date().toISOString();
    const actor = {
      uid: callerUid,
      email: callerProfile.email || null,
      displayName: callerProfile.displayName || null,
    };

    return db.runTransaction(async (transaction) => {
      const personRef = db.collection("people").doc(personId);
      const personSnap = await transaction.get(personRef);

      if (!personSnap.exists) {
        throw new HttpsError("not-found", "Person record not found.");
      }

      const personData = personSnap.data() || {};
      const currentBaylorId =
        normalizeBaylorId(personData.baylorId) ||
        normalizeBaylorId(personData.externalIds?.baylorId);
      const personName = getPersonDisplayName(personData, personId);

      if (!shouldRemove) {
        const duplicateQueries = [
          db.collection("people").where("baylorId", "==", requestedBaylorId),
          db
            .collection("people")
            .where("externalIds.baylorId", "==", requestedBaylorId),
        ];
        const duplicateSnaps = [];
        for (const duplicateQuery of duplicateQueries) {
          duplicateSnaps.push(await transaction.get(duplicateQuery));
        }

        const duplicateDoc = duplicateSnaps
          .flatMap((snapshot) => snapshot.docs)
          .find((docSnap) => docSnap.id !== personId);
        if (duplicateDoc) {
          throw new HttpsError(
            "already-exists",
            "Another person already has that Baylor ID.",
          );
        }

        transaction.update(personRef, {
          baylorId: requestedBaylorId,
          "externalIds.baylorId": requestedBaylorId,
          updatedAt: now,
        });

        const auditRef = db.collection("changeLog").doc();
        transaction.set(auditRef, {
          timestamp: now,
          action: "BAYLOR_ID_UPDATED",
          entity: `Person - ${personName}`,
          collection: "people",
          documentId: personId,
          changes: {
            baylorIdAssigned: true,
          },
          originalData: null,
          source: "functions.updateBaylorId",
          metadata: {
            fields: ["baylorId", "externalIds.baylorId"],
          },
          userId: callerUid,
          actor,
        });

        return {
          success: true,
          action: "updated",
          personId,
          baylorIdPresent: true,
        };
      }

      const historyCollections = ["changeLog", "editHistory"];
      const historySnapshots = [];
      for (const collectionName of historyCollections) {
        historySnapshots.push({
          collectionName,
          snapshot: await transaction.get(
            db
              .collection(collectionName)
              .where("collection", "==", "people")
              .where("documentId", "==", personId),
          ),
        });
      }
      const duplicatePeopleSnapshots = currentBaylorId
        ? [
            await transaction.get(
              db.collection("people").where("baylorId", "==", currentBaylorId),
            ),
            await transaction.get(
              db
                .collection("people")
                .where("externalIds.baylorId", "==", currentBaylorId),
            ),
          ]
        : [];
      const scheduleBaylorIdSnap = currentBaylorId
        ? await transaction.get(
            db
              .collection("schedules")
              .where("instructorBaylorId", "==", currentBaylorId),
          )
        : null;
      const importTransactionsSnap = await transaction.get(
        db.collection("importTransactions"),
      );

      transaction.update(personRef, {
        ...buildBaylorIdRemovalPersonUpdate(personData, currentBaylorId),
        updatedAt: now,
      });

      let scrubbedHistoryDocs = 0;
      let scrubbedImportTransactions = 0;
      let scrubbedPeopleDocs = 1;
      let scrubbedScheduleDocs = 0;

      if (currentBaylorId) {
        const duplicatePersonDocs = new Map();
        duplicatePeopleSnapshots.forEach((snapshot) => {
          snapshot.docs.forEach((docSnap) => {
            if (docSnap.id !== personId) duplicatePersonDocs.set(docSnap.id, docSnap);
          });
        });
        duplicatePersonDocs.forEach((docSnap) => {
          transaction.update(docSnap.ref, {
            ...buildBaylorIdRemovalPersonUpdate(docSnap.data() || {}, currentBaylorId),
            updatedAt: now,
          });
          scrubbedPeopleDocs += 1;
        });

        scheduleBaylorIdSnap?.docs.forEach((docSnap) => {
          const before = docSnap.data() || {};
          const scrubbed = scrubRemovedBaylorId(before, currentBaylorId);
          if (hasSerializedValueChanged(before, scrubbed)) {
            transaction.update(docSnap.ref, {
              ...scrubbed,
              updatedAt: now,
            });
            scrubbedScheduleDocs += 1;
          }
        });

        historySnapshots.forEach(({ snapshot }) => {
          snapshot.docs.forEach((docSnap) => {
            const before = docSnap.data() || {};
            const scrubbed = scrubRemovedBaylorId(before, currentBaylorId);
            if (hasSerializedValueChanged(before, scrubbed)) {
              transaction.update(docSnap.ref, scrubbed);
              scrubbedHistoryDocs += 1;
            }
          });
        });

        importTransactionsSnap.docs.forEach((docSnap) => {
          const before = docSnap.data() || {};
          const scrubbed = scrubRemovedBaylorId(before, currentBaylorId);
          if (hasSerializedValueChanged(before, scrubbed)) {
            transaction.update(docSnap.ref, {
              ...scrubbed,
              lastModified: now,
            });
            scrubbedImportTransactions += 1;
          }
        });
      }

      const auditRef = db.collection("changeLog").doc();
      transaction.set(auditRef, {
        timestamp: now,
        action: "BAYLOR_ID_REMOVED",
        entity: `Person - ${personName}`,
        collection: "people",
        documentId: personId,
        changes: {
          baylorId: null,
          externalIds: { baylorId: null },
        },
        originalData: null,
        source: "functions.updateBaylorId",
        metadata: {
          fields: ["baylorId", "externalIds.baylorId"],
          scrubbedPeopleDocs,
          scrubbedScheduleDocs,
          scrubbedHistoryDocs,
          scrubbedImportTransactions,
        },
        userId: callerUid,
        actor,
      });

      return {
        success: true,
        action: "removed",
        personId,
        baylorIdPresent: false,
        scrubbedPeopleDocs,
        scrubbedScheduleDocs,
        scrubbedHistoryDocs,
        scrubbedImportTransactions,
      };
    });
  },
);
