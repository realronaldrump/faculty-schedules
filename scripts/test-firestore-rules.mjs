import fs from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";

const projectId = "faculty-schedules-rules-test";
const rules = fs.readFileSync("firestore.rules", "utf8");

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: "127.0.0.1",
    port: 8080,
    rules,
  },
});

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, "settings", "accessControl"), {
      rolePermissions: {
        staff: { pages: { "scheduling/rooms": true } },
        faculty: { pages: { "scheduling/rooms": false, "*": false } },
      },
    });
    await setDoc(doc(firestore, "users", "room-manager"), {
      status: "active",
      disabled: false,
      roles: ["staff"],
      permissions: {},
    });
    await setDoc(doc(firestore, "users", "reader"), {
      status: "active",
      disabled: false,
      roles: ["faculty"],
      permissions: { "scheduling/rooms": false },
    });
    await setDoc(doc(firestore, "users", "direct-grant"), {
      status: "active",
      disabled: false,
      roles: ["faculty"],
      permissions: { "scheduling/rooms": true },
    });
    await setDoc(doc(firestore, "users", "direct-deny"), {
      status: "active",
      disabled: false,
      roles: ["staff"],
      permissions: { "scheduling/rooms": false },
    });
    await setDoc(doc(firestore, "users", "disabled-manager"), {
      status: "disabled",
      disabled: true,
      roles: ["staff"],
      permissions: {},
    });
    await setDoc(doc(firestore, "users", "admin-user"), {
      status: "active",
      disabled: false,
      roles: ["admin"],
      permissions: {},
    });
  });

  const sharedExceptionsPath = ["outlookExceptions", "rooms"];
  const unauthenticated = testEnv.unauthenticatedContext().firestore();
  const reader = testEnv.authenticatedContext("reader").firestore();
  const manager = testEnv.authenticatedContext("room-manager").firestore();
  const directGrant = testEnv.authenticatedContext("direct-grant").firestore();
  const directDeny = testEnv.authenticatedContext("direct-deny").firestore();
  const disabledManager = testEnv
    .authenticatedContext("disabled-manager")
    .firestore();
  const adminUser = testEnv.authenticatedContext("admin-user").firestore();

  await assertFails(getDoc(doc(unauthenticated, ...sharedExceptionsPath)));
  await assertSucceeds(getDoc(doc(reader, ...sharedExceptionsPath)));
  await assertFails(
    setDoc(doc(reader, ...sharedExceptionsPath), { termExceptions: {} }),
  );
  await assertFails(
    setDoc(doc(directDeny, "outlookExceptions", "direct-deny"), {
      termExceptions: {},
    }),
  );
  await assertFails(
    setDoc(doc(disabledManager, "outlookExceptions", "disabled"), {
      termExceptions: {},
    }),
  );
  await assertSucceeds(
    setDoc(doc(directGrant, "outlookExceptions", "direct-grant"), {
      termExceptions: {},
    }),
  );
  await assertSucceeds(
    setDoc(doc(adminUser, "outlookExceptions", "admin"), {
      termExceptions: {},
    }),
  );
  await assertSucceeds(
    setDoc(doc(manager, ...sharedExceptionsPath), {
      termExceptions: {
        "Fall 2026": [{ date: "2026-09-07", label: "Labor Day" }],
      },
      updatedAt: "2026-08-25T16:00:00.000Z",
    }),
  );
  await assertSucceeds(
    setDoc(
      doc(manager, ...sharedExceptionsPath),
      { updatedAt: "2026-08-25T16:01:00.000Z" },
      { merge: true },
    ),
  );
  await assertSucceeds(deleteDoc(doc(manager, ...sharedExceptionsPath)));
  await assertSucceeds(
    deleteDoc(doc(manager, "outlookExceptions", "direct-grant")),
  );
  await assertSucceeds(deleteDoc(doc(manager, "outlookExceptions", "admin")));
  await assertSucceeds(
    setDoc(doc(manager, "roomGrids", "rules-check"), { name: "Rules check" }),
  );
  await assertSucceeds(
    setDoc(doc(manager, "reservations", "rules-check"), {
      date: "2026-09-01",
    }),
  );
  await assertSucceeds(deleteDoc(doc(manager, "roomGrids", "rules-check")));
  await assertSucceeds(deleteDoc(doc(manager, "reservations", "rules-check")));

  console.log("Firestore rules regression checks passed.");
} finally {
  await testEnv.cleanup();
}
