// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// --- IMPORTANT ---

const firebaseConfig = {
    apiKey: "AIzaSyDryC4uMuNiSCZQbzfhJ1ojQdEkf5NyWlo",
    authDomain: "faculty-schedules.firebaseapp.com",
    projectId: "faculty-schedules",
    storageBucket: "faculty-schedules.firebasestorage.app",
    messagingSenderId: "333819937822",
    appId: "1:333819937822:web:00624640dd9c3228035a0f",
    measurementId: "G-4MGCPSBD84"
  };
// -----------------

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);