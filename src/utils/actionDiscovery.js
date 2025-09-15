// Automatic action discovery system
// This utility scans the codebase to automatically register actions
// It analyzes Firebase operations and maps them to permission actions

import { registerActionKey } from './actionRegistry';
import { APP_ACTIONS } from './permissions';

// Action mapping based on Firebase collection and operation type
const ACTION_MAPPING = {
  // Collection to action prefix mapping
  'people': {
    prefix: 'directory',
    operations: {
      addDoc: (collection) => {
        // Determine person type based on context or data
        return [
          APP_ACTIONS.FACULTY_CREATE,
          APP_ACTIONS.STAFF_CREATE,
          APP_ACTIONS.ADJUNCT_CREATE,
          APP_ACTIONS.STUDENT_CREATE
        ];
      },
      updateDoc: () => [
        APP_ACTIONS.FACULTY_EDIT,
        APP_ACTIONS.STAFF_EDIT,
        APP_ACTIONS.ADJUNCT_EDIT,
        APP_ACTIONS.STUDENT_EDIT
      ],
      deleteDoc: () => [
        APP_ACTIONS.FACULTY_DELETE,
        APP_ACTIONS.STAFF_DELETE,
        APP_ACTIONS.ADJUNCT_DELETE,
        APP_ACTIONS.STUDENT_DELETE
      ]
    }
  },
  'schedules': {
    prefix: 'schedule',
    operations: {
      addDoc: () => [APP_ACTIONS.SCHEDULE_CREATE],
      updateDoc: () => [APP_ACTIONS.SCHEDULE_EDIT],
      deleteDoc: () => [APP_ACTIONS.SCHEDULE_DELETE]
    }
  },
  'rooms': {
    prefix: 'room',
    operations: {
      addDoc: () => [APP_ACTIONS.ROOM_CREATE],
      updateDoc: () => [APP_ACTIONS.ROOM_EDIT],
      deleteDoc: () => [APP_ACTIONS.ROOM_DELETE]
    }
  },
  'roomGrids': {
    prefix: 'roomGrids',
    operations: {
      addDoc: () => [APP_ACTIONS.ROOMGRIDS_SAVE],
      updateDoc: () => [APP_ACTIONS.ROOMGRIDS_EDIT],
      deleteDoc: () => [APP_ACTIONS.ROOMGRIDS_DELETE]
    }
  },
  'programs': {
    prefix: 'program',
    operations: {
      addDoc: () => [APP_ACTIONS.PROGRAM_CREATE],
      updateDoc: () => [APP_ACTIONS.PROGRAM_EDIT, APP_ACTIONS.PROGRAM_UPD_ASSIGN],
      deleteDoc: () => [APP_ACTIONS.PROGRAM_DELETE]
    }
  },
  'courses': {
    prefix: 'course',
    operations: {
      addDoc: () => [APP_ACTIONS.COURSE_CREATE],
      updateDoc: () => [APP_ACTIONS.COURSE_EDIT],
      deleteDoc: () => [APP_ACTIONS.COURSE_DELETE]
    }
  },
  'terms': {
    prefix: 'term',
    operations: {
      addDoc: () => [APP_ACTIONS.TERM_CREATE],
      updateDoc: () => [APP_ACTIONS.TERM_EDIT],
      deleteDoc: () => [APP_ACTIONS.TERM_DELETE]
    }
  },
  'departments': {
    prefix: 'department',
    operations: {
      addDoc: () => [APP_ACTIONS.DEPARTMENT_CREATE],
      updateDoc: () => [APP_ACTIONS.DEPARTMENT_EDIT],
      deleteDoc: () => [APP_ACTIONS.DEPARTMENT_DELETE]
    }
  },
  'users': {
    prefix: 'system',
    operations: {
      addDoc: () => [APP_ACTIONS.SYSTEM_USER_MANAGE],
      updateDoc: () => [APP_ACTIONS.SYSTEM_USER_MANAGE, APP_ACTIONS.SYSTEM_USER_DISABLE],
      deleteDoc: () => [APP_ACTIONS.SYSTEM_USER_DELETE]
    }
  },
  'settings': {
    prefix: 'system',
    operations: {
      updateDoc: () => [APP_ACTIONS.SYSTEM_ACCESS_CONTROL, APP_ACTIONS.SYSTEM_SETTINGS]
    }
  }
};

// Special operations that don't follow standard collection patterns
const SPECIAL_OPERATIONS = {
  // CRN operations
  'crn': [
    APP_ACTIONS.CRN_EDIT,
    APP_ACTIONS.CRN_UPDATE,
    APP_ACTIONS.CRN_QUALITY_CHECK,
    APP_ACTIONS.CRN_BULK_UPDATE
  ],

  // Missing data operations
  'missing': [
    APP_ACTIONS.MISSING_DATA_EDIT,
    APP_ACTIONS.MISSING_DATA_UPDATE,
    APP_ACTIONS.MISSING_DATA_REVIEW
  ],

  // Data management operations
  'data': [
    APP_ACTIONS.DATA_IMPORT,
    APP_ACTIONS.DATA_EXPORT,
    APP_ACTIONS.DATA_HYGIENE,
    APP_ACTIONS.DATA_DEDUPLICATION,
    APP_ACTIONS.DATA_MIGRATION,
    APP_ACTIONS.DATA_BACKUP
  ],

  // Analytics operations
  'analytics': [
    APP_ACTIONS.ANALYTICS_VIEW,
    APP_ACTIONS.ANALYTICS_EDIT,
    APP_ACTIONS.ANALYTICS_EXPORT,
    APP_ACTIONS.ANALYTICS_DEPARTMENT,
    APP_ACTIONS.ANALYTICS_COURSE
  ],

  // System operations
  'system': [
    APP_ACTIONS.SYSTEM_SETTINGS,
    APP_ACTIONS.SYSTEM_ACCESS_CONTROL,
    APP_ACTIONS.SYSTEM_ACTIVITY_MONITOR,
    APP_ACTIONS.SYSTEM_MAINTENANCE
  ]
};

// Function to discover actions from Firebase operations
export function discoverActionsFromOperations(operations) {
  const discoveredActions = new Set();

  operations.forEach(operation => {
    const { collection, operation: opType, context } = operation;

    // Handle standard collection operations
    if (ACTION_MAPPING[collection]) {
      const mapping = ACTION_MAPPING[collection];
      if (mapping.operations[opType]) {
        const actions = mapping.operations[opType](collection);
        actions.forEach(action => discoveredActions.add(action));
      }
    }

    // Handle special operations based on context
    Object.entries(SPECIAL_OPERATIONS).forEach(([key, actions]) => {
      if (context && context.toLowerCase().includes(key)) {
        actions.forEach(action => discoveredActions.add(action));
      }
    });
  });

  return Array.from(discoveredActions);
}

// Function to register actions based on component analysis
export function registerComponentActions(componentName, operations) {
  const actions = discoverActionsFromOperations(operations);

  console.log(`🔍 Discovered ${actions.length} actions for ${componentName}:`, actions);

  actions.forEach(action => {
    registerActionKey(action);
  });

  return actions;
}

// Function to analyze a component and extract its operations
export function analyzeComponentForActions(componentCode, componentName) {
  const operations = [];

  // Extract Firebase operations from component code
  const firebasePatterns = [
    /addDoc\(collection\(db,\s*['"]([^'"]+)['"]\)/g,
    /updateDoc\(doc\(db,\s*['"]([^'"]+)['"]/g,
    /deleteDoc\(doc\(db,\s*['"]([^'"]+)['"]/g,
    /setDoc\(doc\(db,\s*['"]([^'"]+)['"]/g
  ];

  firebasePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(componentCode)) !== null) {
      const collection = match[1];
      let operation;

      if (pattern.source.includes('addDoc')) operation = 'addDoc';
      else if (pattern.source.includes('updateDoc')) operation = 'updateDoc';
      else if (pattern.source.includes('deleteDoc')) operation = 'deleteDoc';
      else if (pattern.source.includes('setDoc')) operation = 'setDoc';

      operations.push({
        collection,
        operation,
        context: componentName
      });
    }
  });

  return registerComponentActions(componentName, operations);
}

// Function to analyze the entire app and register all actions
export function analyzeAppForActions() {
  console.log('🔍 Starting comprehensive app action analysis...');

  // This would typically scan all component files
  // For now, we'll manually register based on our knowledge
  const allKnownActions = Object.values(APP_ACTIONS);

  console.log(`📋 Registering ${allKnownActions.length} total app actions`);

  allKnownActions.forEach(action => {
    registerActionKey(action);
  });

  return allKnownActions;
}

// Auto-analyze on module load
analyzeAppForActions();
