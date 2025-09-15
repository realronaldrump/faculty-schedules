// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, enableNetwork, disableNetwork, enableIndexedDbPersistence, enableMultiTabIndexedDbPersistence } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAhfG2PP_ewf0tC_lSwN8ca5wlWQV-_lPM",
  authDomain: "faculty-schedules-be0e9.firebaseapp.com",
  projectId: "faculty-schedules-be0e9",
  storageBucket: "faculty-schedules-be0e9.firebasestorage.app",
  messagingSenderId: "714558284379",
  appId: "1:714558284379:web:44a476b2058b8a950e557e",
  measurementId: "G-PHSBFLLYSL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

// Development environment setup
const isDevelopment = import.meta.env.DEV;
const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

if (isDevelopment && useEmulators) {
  // Connect to Firestore emulator
  try {
    connectFirestoreEmulator(db, 'localhost', 8080);
    console.log('🔧 Connected to Firestore Emulator');
  } catch (error) {
    console.warn('⚠️  Could not connect to Firestore Emulator:', error.message);
  }

  // Connect to Auth emulator
  try {
    connectAuthEmulator(auth, 'http://localhost:9099');
    console.log('🔧 Connected to Auth Emulator');
  } catch (error) {
    console.warn('⚠️  Could not connect to Auth Emulator:', error.message);
  }
}

// Connection management utilities
export const firestoreUtils = {
  // Enable offline persistence
  async enableOffline() {
    try {
      try {
        await enableIndexedDbPersistence(db);
        console.log('📦 IndexedDB persistence enabled');
      } catch (err) {
        if (err && err.code === 'failed-precondition') {
          // Fallback for multi-tab environments
          await enableMultiTabIndexedDbPersistence(db);
          console.log('📦 Multi-tab IndexedDB persistence enabled');
        } else if (err && err.code === 'unimplemented') {
          console.warn('⚠️  Persistence not available in this environment');
        } else {
          throw err;
        }
      }
      return true;
    } catch (error) {
      console.error('❌ Could not enable offline persistence:', error);
      return false;
    }
  },

  // Disable network (offline mode)
  async goOffline() {
    try {
      await disableNetwork(db);
      console.log('📴 Firestore offline mode enabled');
      return true;
    } catch (error) {
      console.error('❌ Could not enable offline mode:', error);
      return false;
    }
  },

  // Enable network (online mode)
  async goOnline() {
    try {
      await enableNetwork(db);
      console.log('🌐 Firestore online mode enabled');
      return true;
    } catch (error) {
      console.error('❌ Could not enable online mode:', error);
      return false;
    }
  }
};

// Error handling utilities
export const firebaseErrorHandler = {
  // Parse Firebase error codes into user-friendly messages
  parseError(error) {
    const errorMessages = {
      'permission-denied': 'You do not have permission to perform this action. Please contact your administrator.',
      'not-found': 'The requested data was not found. It may have been deleted or moved.',
      'already-exists': 'This data already exists. Please use a different identifier.',
      'failed-precondition': 'The operation failed due to a system constraint. Please try again.',
      'cancelled': 'The operation was cancelled. Please try again.',
      'unknown': 'An unexpected error occurred. Please try again later.',
      'invalid-argument': 'Invalid data provided. Please check your input and try again.',
      'deadline-exceeded': 'The operation took too long. Please check your connection and try again.',
      'resource-exhausted': 'System resources are temporarily exhausted. Please try again later.',
      'unauthenticated': 'You must be logged in to perform this action.',
      'unavailable': 'The service is temporarily unavailable. Please try again later.',
      'data-loss': 'Data loss detected. Please contact support immediately.'
    };

    const code = error.code || 'unknown';
    const friendlyMessage = errorMessages[code] || errorMessages['unknown'];
    
    return {
      code,
      message: error.message,
      friendlyMessage,
      isNetworkError: code === 'unavailable' || code === 'deadline-exceeded',
      isPermissionError: code === 'permission-denied' || code === 'unauthenticated',
      isDataError: code === 'not-found' || code === 'already-exists' || code === 'invalid-argument'
    };
  },

  // Handle errors with user notification
  handleError(error, context = 'operation') {
    const parsed = this.parseError(error);
    
    console.error(`Firebase error in ${context}:`, {
      code: parsed.code,
      message: parsed.message,
      context
    });

    // For development, show detailed errors
    if (isDevelopment) {
      console.error('Full error details:', error);
    }

    return parsed;
  }
};

// Collection names for consistency
export const COLLECTIONS = {
  PEOPLE: 'people',
  SCHEDULES: 'schedules',
  ROOMS: 'rooms',
  HISTORY: 'history',
  PROGRAMS: 'programs',
  COURSES: 'courses',
  TERMS: 'terms',
  DEPARTMENTS: 'departments'
};

// Data validation utilities
export const validationUtils = {
  // Validate required fields
  validateRequired(data, requiredFields) {
    const missing = requiredFields.filter(field => !data[field]);
    return {
      isValid: missing.length === 0,
      missingFields: missing
    };
  },

  // Validate email format
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return {
      isValid: emailRegex.test(email),
      message: emailRegex.test(email) ? '' : 'Invalid email format'
    };
  },

  // Validate phone number (10 digits)
  validatePhone(phone) {
    const phoneRegex = /^\d{10}$/;
    const cleanPhone = (phone || '').replace(/\D/g, '');
    return {
      isValid: phoneRegex.test(cleanPhone),
      message: phoneRegex.test(cleanPhone) ? '' : 'Phone number must be 10 digits',
      cleanPhone
    };
  },

  // Validate time format
  validateTime(timeStr) {
    if (!timeStr) return { isValid: false, message: 'Time is required' };
    
    const timeRegex = /^(1[0-2]|0?[1-9]):([0-5][0-9])\s?(AM|PM)$/i;
    return {
      isValid: timeRegex.test(timeStr),
      message: timeRegex.test(timeStr) ? '' : 'Time must be in format "9:00 AM" or "2:30 PM"'
    };
  },

  // Validate day code
  validateDay(day) {
    const validDays = ['M', 'T', 'W', 'R', 'F'];
    return {
      isValid: validDays.includes(day),
      message: validDays.includes(day) ? '' : 'Day must be M, T, W, R, or F'
    };
  }
};

// Performance monitoring
export const performanceMonitor = {
  // Track operation timing
  timer: null,

  start(operation) {
    this.timer = {
      operation,
      startTime: performance.now()
    };
  },

  end() {
    if (!this.timer) return null;
    
    const duration = performance.now() - this.timer.startTime;
    const result = {
      operation: this.timer.operation,
      duration: Math.round(duration),
      timestamp: new Date().toISOString()
    };
    
    // Log slow operations in development
    if (isDevelopment && duration > 1000) {
      console.warn(`🐌 Slow operation detected: ${result.operation} took ${result.duration}ms`);
    }
    
    this.timer = null;
    return result;
  }
};

// Export the initialized app for any additional services
export { app };

// Development utilities
if (isDevelopment) {
  // Add global helpers for debugging
  window.firebaseUtils = {
    db,
    auth,
    COLLECTIONS,
    errorHandler: firebaseErrorHandler,
    performanceMonitor
  };

  console.log('🔥 Firebase initialized for development');
  console.log('Available utils: window.firebaseUtils');
}