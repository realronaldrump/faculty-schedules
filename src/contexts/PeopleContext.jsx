/**
 * PeopleContext - Specialized context for Person/Directory data management
 *
 * Responsibilities:
 * - Loading and caching people/directory data
 * - Exposing the canonical people index to consumers
 *
 * Person CRUD lives in usePeopleOperations.
 */

import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
} from "react";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import { buildPeopleIndex } from "../utils/peopleUtils";

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

  const peopleIndex = useMemo(() => buildPeopleIndex(rawPeople), [rawPeople]);
  const canonicalPeople = useMemo(
    () => peopleIndex.canonicalPeople,
    [peopleIndex],
  );

  const value = useMemo(
    () => ({
      people: canonicalPeople,
      allPeople: rawPeople,
      peopleIndex,
      loading,
      error,
      loaded,
      loadPeople,
    }),
    [
      canonicalPeople,
      rawPeople,
      peopleIndex,
      loading,
      error,
      loaded,
      loadPeople,
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
