// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAhfG2PP_ewf0tC_lSwN8ca5wlWQV-_lPM",
  authDomain: "faculty-schedules-be0e9.firebaseapp.com",
  projectId: "faculty-schedules-be0e9",
  storageBucket: "faculty-schedules-be0e9.firebasestorage.app",
  messagingSenderId: "714558284379",
  appId: "1:714558284379:web:44a476b2058b8a950e557e",
  measurementId: "G-PHSBFLLYSL",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);


// Initialize Auth
export const auth = getAuth(app);

// Initialize Functions
export const functions = getFunctions(app);

// Development environment setup
const isDevelopment = import.meta.env.DEV;
const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";

if (isDevelopment && useEmulators) {
  // Connect to Firestore emulator
  try {
    connectFirestoreEmulator(db, "localhost", 8080);
    console.log("🔧 Connected to Firestore Emulator");
  } catch (error) {
    console.warn("⚠️  Could not connect to Firestore Emulator:", error.message);
  }

  // Connect to Auth emulator
  try {
    connectAuthEmulator(auth, "http://localhost:9099");
    console.log("🔧 Connected to Auth Emulator");
  } catch (error) {
    console.warn("⚠️  Could not connect to Auth Emulator:", error.message);
  }

  // Connect to Functions emulator
  try {
    connectFunctionsEmulator(functions, "localhost", 5001);
    console.log("🔧 Connected to Functions Emulator");
  } catch (error) {
    console.warn("⚠️  Could not connect to Functions Emulator:", error.message);
  }
}

// Collection names for consistency
export const COLLECTIONS = {
  PEOPLE: "people",
  SCHEDULES: "schedules",
  ROOMS: "rooms",
  HISTORY: "history",
  PROGRAMS: "programs",
  COURSES: "courses",
  TERMS: "terms",
  DEPARTMENTS: "departments",
  EMAIL_LIST_PRESETS: "emailListPresets",
  OUTLOOK_EXCEPTIONS: "outlookExceptions",
  RESERVATIONS: "reservations",
};

// Export the initialized app for any additional services
