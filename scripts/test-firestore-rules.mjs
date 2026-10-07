import fs from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const projectId = "faculty-schedules-rules-test";
const rules = fs.readFileSync("firestore.rules", "utf8");
const OWNER_UID = "fjQuh4iAMFYi8URf35Yv5RRijKw2";

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: { host: "127.0.0.1", port: 8080, rules },
});

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    const profile = (uid, extra) =>
      setDoc(doc(firestore, "users", uid), {
        uid,
        email: `${uid}@example.edu`,
        ...extra,
      });
    await profile("approved", { status: "active", disabled: false });
    await profile("editor", { status: "active", disabled: false });
    await profile("pending", { status: "pending", disabled: false });
    await profile("disabled", { status: "disabled", disabled: true });
    await profile("no-status", { roles: ["admin"] });
    // Regression: a person still carrying the retired isUPD flag must remain
    // editable (this blocked every save on 16 records in Oct 2026).
    await setDoc(doc(firestore, "people", "student"), {
      firstName: "Test",
      lastName: "Student",
      isUPD: false,
      baylorId: "123",
    });
    await setDoc(doc(firestore, "userActivityEvents", "event"), {
      uid: "approved",
      pageId: "dashboard",
    });
  });

  const db = (uid) =>
    uid
      ? testEnv
          .authenticatedContext(uid, { email: `${uid}@example.edu` })
          .firestore()
      : testEnv.unauthenticatedContext().firestore();
  const approved = db("approved");
  const owner = db(OWNER_UID);

  // App data: approved accounts (and the owner) read and write everything.
  await assertSucceeds(getDoc(doc(approved, "people", "student")));
  await assertSucceeds(
    updateDoc(doc(approved, "people", "student"), { jobs: [{ jobTitle: "Lab Tech" }] }),
  );
  for (const collection of ["changeLog", "editHistory", "settings", "reservations", "schedules"]) {
    await assertSucceeds(setDoc(doc(approved, collection, "rules-check"), { ok: true }));
    await assertSucceeds(deleteDoc(doc(approved, collection, "rules-check")));
  }
  await assertSucceeds(setDoc(doc(owner, "settings", "owner-check"), { ok: true }));

  // Everyone else is denied app data, and unknown collections stay closed.
  for (const uid of [null, "pending", "disabled", "no-status", "unknown"]) {
    await assertFails(getDoc(doc(db(uid), "people", "student")));
    await assertFails(setDoc(doc(db(uid), "people", "intruder"), { ok: true }));
  }
  await assertFails(setDoc(doc(approved, "unlisted", "x"), { ok: true }));

  // Accounts: self-registration as pending only; no self-approval.
  await assertSucceeds(
    setDoc(doc(db("newcomer"), "users", "newcomer"), {
      uid: "newcomer",
      email: "newcomer@example.edu",
      status: "pending",
      disabled: false,
    }),
  );
  await assertFails(
    setDoc(doc(db("sneaky"), "users", "sneaky"), {
      uid: "sneaky",
      email: "sneaky@example.edu",
      status: "active",
      disabled: false,
    }),
  );
  await assertFails(updateDoc(doc(db("pending"), "users", "pending"), { status: "active" }));
  await assertSucceeds(
    updateDoc(doc(db("pending"), "users", "pending"), { lastActiveAt: "now" }),
  );
  await assertFails(getDoc(doc(approved, "users", "pending")));
  await assertFails(updateDoc(doc(approved, "users", "pending"), { status: "active" }));
  await assertSucceeds(getDoc(doc(owner, "users", "pending")));
  await assertSucceeds(updateDoc(doc(owner, "users", "pending"), { status: "active" }));
  await assertSucceeds(
    updateDoc(doc(owner, "users", "approved"), { status: "disabled", disabled: true }),
  );
  await assertFails(getDoc(doc(db("approved"), "people", "student")));

  // Telemetry stays owner-only to read; users write only their own records.
  await assertFails(getDoc(doc(db("pending"), "userActivityEvents", "event")));
  await assertSucceeds(getDoc(doc(owner, "userActivityEvents", "event")));
  // "newcomer" registered above and is still pending.
  await assertFails(
    setDoc(doc(db("newcomer"), "tutorialProgress", "newcomer"), { uid: "newcomer" }),
  );
  await assertFails(
    setDoc(doc(db("newcomer"), "userActivityEvents", "newcomer-event"), {
      uid: "newcomer",
      pageId: "dashboard",
    }),
  );
  const editor = db("editor");
  await assertSucceeds(
    setDoc(doc(editor, "tutorialProgress", "editor"), { uid: "editor" }),
  );
  await assertFails(
    setDoc(doc(editor, "tutorialProgress", "someone-else"), { uid: "editor" }),
  );
  await assertSucceeds(
    setDoc(doc(editor, "userActivityEvents", "editor-event"), {
      uid: "editor",
      pageId: "dashboard",
    }),
  );
  await assertSucceeds(getDoc(doc(owner, "tutorialProgress", "editor")));

  console.log("Firestore rules regression checks passed.");
} finally {
  await testEnv.cleanup();
}
