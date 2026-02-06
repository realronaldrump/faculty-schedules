/**
 * PeopleContext - Specialized context for Person/Directory data management
 *
 * Responsibilities:
 * - Loading and caching people/directory data
 * - CRUD operations for people
 * - Adapting people data for different views (Faculty, Staff, etc.)
 */

import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
} from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  addDoc,
} from "firebase/firestore";
import { adaptPeopleToFaculty, adaptPeopleToStaff } from "../utils/dataAdapter";
import { buildPeopleIndex } from "../utils/peopleUtils";
import { deletePersonSafely } from "../utils/dataHygiene";
import { standardizePerson } from "../utils/hygieneCore";
import { logCreate, logUpdate, logDelete } from "../utils/changeLogger";

const PeopleContext = createContext(null);

export const PeopleProvider = ({ children }) => {
  const [rawPeople, setRawPeople] = useState([]);
  const [loading, setLoading] = useState(false); // Start false, load on demand
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Fetch all people (Directory Load)
  const loadPeople = useCallback(
    async ({ force = false } = {}) => {
      if (loaded && !force) return;

      setLoading(true);
      setError(null);
      try {
        console.log("👥 Loading People Directory...");
        const snapshot = await getDocs(collection(db, "people"));
        const people = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setRawPeople(people);
        setLoaded(true);
        console.log(`✅ Loaded ${people.length} people.`);
      } catch (err) {
        console.error("❌ Error loading people:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [loaded],
  );

  // CRUD Operations
  const addPerson = useCallback(async (personData) => {
    try {
      // Apply hygieneCore standardization for consistent data quality
      const standardizedData = standardizePerson(personData, {
        updateTimestamp: false,
      });
      const hasIdentifier = Boolean(
        (standardizedData.email || "").trim() ||
          (standardizedData.baylorId || "").trim() ||
          (standardizedData.externalIds?.clssInstructorId &&
            String(standardizedData.externalIds.clssInstructorId).trim()) ||
          (standardizedData.externalIds?.baylorId &&
            String(standardizedData.externalIds.baylorId).trim()),
      );
      if (!hasIdentifier) {
        throw new Error(
          "Person must have an identifier (email, Baylor ID, or CLSS ID).",
        );
      }
      const docRef = await addDoc(collection(db, "people"), {
        ...standardizedData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const newPerson = { id: docRef.id, ...standardizedData };
      setRawPeople((prev) => [...prev, newPerson]);

      await logCreate(
        `Person - ${standardizedData.firstName} ${standardizedData.lastName}`,
        "people",
        docRef.id,
        standardizedData,
        "PeopleContext",
      );
      return docRef.id;
    } catch (e) {
      console.error("Error adding person:", e);
      throw e;
    }
  }, []);

  const updatePerson = useCallback(
    async (id, updates) => {
      try {
        const personRef = doc(db, "people", id);
        // Apply hygieneCore standardization for consistent data quality
        const standardizedUpdates = standardizePerson(updates, {
          updateTimestamp: false,
        });
        const payload = {
          ...standardizedUpdates,
          updatedAt: new Date().toISOString(),
        };
        await updateDoc(personRef, payload);

        setRawPeople((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...payload } : p)),
        );

        // Log logic should ideally be here, but for brevity/perf we catch errors
        const currentPerson = rawPeople.find((p) => p.id === id);
        logUpdate(
          `Person - ${currentPerson?.firstName || ""} ${currentPerson?.lastName || ""}`,
          "people",
          id,
          standardizedUpdates,
          currentPerson,
          "PeopleContext",
        ).catch(() => {});
      } catch (e) {
        console.error("Error updating person:", e);
        throw e;
      }
    },
    [rawPeople],
  );

  const deletePerson = useCallback(
    async (id) => {
      try {
        await deletePersonSafely(id);
        const currentPerson = rawPeople.find((p) => p.id === id);
        setRawPeople((prev) => prev.filter((p) => p.id !== id));

        logDelete(
          `Person - ${currentPerson?.firstName || ""} ${currentPerson?.lastName || ""}`,
          "people",
          id,
          currentPerson,
          "PeopleContext",
        ).catch(() => {});
      } catch (e) {
        console.error("Error deleting person:", e);
        throw e;
      }
    },
    [rawPeople],
  );

  const peopleIndex = useMemo(() => buildPeopleIndex(rawPeople), [rawPeople]);
  const canonicalPeople = useMemo(
    () => peopleIndex.canonicalPeople,
    [peopleIndex],
  );

  // Derived Data Helpers
  const facultyData = useMemo(() => {
    // Note: adaptPeopleToFaculty traditionally took schedule/program data to calculate load.
    // For the pure "Directory" view, we might not have schedules yet.
    // This adapter might need to be resilient to missing schedule data if we are decoupling tightly.
    // For now, pass empty arrays if we don't have them in this context.
    // Ideally, "Load" calculation happens in a "ReportingContext" or similar that consumes both.
    return adaptPeopleToFaculty(canonicalPeople, [], [], { includeInactive: false });
  }, [canonicalPeople]);

  const staffData = useMemo(
    () => adaptPeopleToStaff(canonicalPeople, [], [], { includeInactive: false }),
    [canonicalPeople],
  );

  const studentData = useMemo(() => {
    // Re-implement student filter logic from DataContext
    return canonicalPeople.filter((person) => {
      if (!person.roles) return false;
      if (Array.isArray(person.roles)) return person.roles.includes("student");
      if (typeof person.roles === "object")
        return person.roles.student === true;
      return false;
    });
  }, [canonicalPeople]);

  const value = useMemo(
    () => ({
      people: canonicalPeople,
      allPeople: rawPeople,
      peopleIndex,
      loading,
      error,
      loaded,
      loadPeople,
      addPerson,
      updatePerson,
      deletePerson,
      facultyData,
      staffData,
      studentData,
    }),
    [
      canonicalPeople,
      rawPeople,
      peopleIndex,
      loading,
      error,
      loaded,
      loadPeople,
      addPerson,
      updatePerson,
      deletePerson,
      facultyData,
      staffData,
      studentData,
    ],
  );

  return (
    <PeopleContext.Provider value={value}>{children}</PeopleContext.Provider>
  );
};

export const usePeople = () => {
  const context = useContext(PeopleContext);
  if (!context)
    throw new Error("usePeople must be used within a PeopleProvider");
  return context;
};

export default PeopleContext;
