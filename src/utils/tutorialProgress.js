/**
 * tutorialProgress - Firestore persistence for per-user tutorial progress.
 *
 * One document per user at `tutorialProgress/{uid}`. The `tutorials` map is
 * keyed by tutorial id and tracks status (started | completed), the furthest
 * step reached, and timestamps. Identity fields are denormalized so the admin
 * User Activity console can render a completion matrix without extra reads.
 *
 * This collection is the single source of truth for completion state. The user
 * reads/writes their own doc (driving the progress ring and cross-device sync);
 * the activity owner can read every doc for administrative visibility. Access is
 * enforced by Firestore rules on the `tutorialProgress` collection.
 */

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";

export const TUTORIAL_PROGRESS_COLLECTION = "tutorialProgress";

const tutorialDocRef = (uid) => doc(db, TUTORIAL_PROGRESS_COLLECTION, uid);

const buildIdentity = (actor) => ({
  uid: actor.uid,
  email: actor.email || "",
  displayName: actor.displayName || "",
  role: actor.role || "unknown",
});

/**
 * Subscribe to a single user's progress document. Returns an unsubscribe fn.
 * The callback receives the `tutorials` map (keyed by tutorial id), or {}.
 */
export const subscribeTutorialProgress = (uid, onChange, onError) => {
  if (!uid) return () => {};
  return onSnapshot(
    tutorialDocRef(uid),
    (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : null;
      onChange(data?.tutorials || {});
    },
    (error) => {
      if (typeof onError === "function") onError(error);
    },
  );
};

/**
 * Record the first time a user opens a tutorial. Sets `startedAt`, so callers
 * must only invoke this when there is no existing progress for the tutorial.
 */
export const markTutorialStarted = async (
  actor,
  tutorialId,
  totalSteps,
  currentStepIndex = 0,
) => {
  if (!actor?.uid || !tutorialId) return;
  await setDoc(
    tutorialDocRef(actor.uid),
    {
      ...buildIdentity(actor),
      updatedAt: serverTimestamp(),
      tutorials: {
        [tutorialId]: {
          status: "started",
          currentStepIndex: currentStepIndex || 0,
          totalSteps: totalSteps || 0,
          startedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      },
    },
    { merge: true },
  );
};

/**
 * Persist the furthest step reached. Does not touch `status` or `startedAt`, so
 * a merge keeps a tutorial's existing state while advancing the step pointer.
 */
export const updateTutorialStep = async (
  actor,
  tutorialId,
  currentStepIndex,
  totalSteps,
) => {
  if (!actor?.uid || !tutorialId) return;
  await setDoc(
    tutorialDocRef(actor.uid),
    {
      ...buildIdentity(actor),
      updatedAt: serverTimestamp(),
      tutorials: {
        [tutorialId]: {
          currentStepIndex: currentStepIndex || 0,
          totalSteps: totalSteps || 0,
          updatedAt: serverTimestamp(),
        },
      },
    },
    { merge: true },
  );
};

/** Mark a tutorial completed (terminal state). */
export const markTutorialCompleted = async (actor, tutorialId, totalSteps) => {
  if (!actor?.uid || !tutorialId) return;
  await setDoc(
    tutorialDocRef(actor.uid),
    {
      ...buildIdentity(actor),
      updatedAt: serverTimestamp(),
      tutorials: {
        [tutorialId]: {
          status: "completed",
          currentStepIndex: Math.max(0, (totalSteps || 1) - 1),
          totalSteps: totalSteps || 0,
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      },
    },
    { merge: true },
  );
};

/** Clear all of a user's tutorial progress. */
export const resetTutorialProgress = async (actor) => {
  if (!actor?.uid) return;
  await setDoc(
    tutorialDocRef(actor.uid),
    {
      ...buildIdentity(actor),
      updatedAt: serverTimestamp(),
      tutorials: {},
    },
    { merge: false },
  );
};

/** Admin-only: read every user's progress document. */
export const fetchAllTutorialProgress = async () => {
  const snapshot = await getDocs(collection(db, TUTORIAL_PROGRESS_COLLECTION));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};
