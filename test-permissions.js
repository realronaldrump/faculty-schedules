// Simple test to verify the permission system is working
// This can be run in the browser console to test the permission system

import { DIRECTORY_ACTIONS, usePermissions } from './src/utils/permissions.js';
import { getAllRegisteredActionKeys } from './src/utils/actionRegistry.js';

// Test that all directory actions are registered
console.log('=== ACTION REGISTRY TEST ===');
const registeredKeys = getAllRegisteredActionKeys();
console.log('Registered action keys:', registeredKeys);
console.log('Total registered actions:', registeredKeys.length);

// Test the DIRECTORY_ACTIONS constants
console.log('\n=== DIRECTORY ACTIONS CONSTANTS ===');
console.log('Faculty actions:', {
  edit: DIRECTORY_ACTIONS.FACULTY_EDIT,
  create: DIRECTORY_ACTIONS.FACULTY_CREATE,
  delete: DIRECTORY_ACTIONS.FACULTY_DELETE,
  view: DIRECTORY_ACTIONS.FACULTY_VIEW
});

console.log('Staff actions:', {
  edit: DIRECTORY_ACTIONS.STAFF_EDIT,
  create: DIRECTORY_ACTIONS.STAFF_CREATE,
  delete: DIRECTORY_ACTIONS.STAFF_DELETE,
  view: DIRECTORY_ACTIONS.STAFF_VIEW
});

console.log('Student actions:', {
  edit: DIRECTORY_ACTIONS.STUDENT_EDIT,
  create: DIRECTORY_ACTIONS.STUDENT_CREATE,
  delete: DIRECTORY_ACTIONS.STUDENT_DELETE,
  view: DIRECTORY_ACTIONS.STUDENT_VIEW
});

console.log('Adjunct actions:', {
  edit: DIRECTORY_ACTIONS.ADJUNCT_EDIT,
  create: DIRECTORY_ACTIONS.ADJUNCT_CREATE,
  delete: DIRECTORY_ACTIONS.ADJUNCT_DELETE,
  view: DIRECTORY_ACTIONS.ADJUNCT_VIEW
});

// Test that all actions are in the registry
const expectedActions = Object.values(DIRECTORY_ACTIONS);
const missingActions = expectedActions.filter(action => !registeredKeys.includes(action));

console.log('\n=== REGISTRY VERIFICATION ===');
if (missingActions.length === 0) {
  console.log('✅ All directory actions are properly registered!');
} else {
  console.log('❌ Missing actions:', missingActions);
}

console.log('\n=== PERMISSION SYSTEM TEST ===');
// Note: This would need to be run in a React component context to test the usePermissions hook
console.log('To test the usePermissions hook, use it in a React component and check:');
console.log('- canEditFaculty()');
console.log('- canCreateStudent()');
console.log('- canDeleteStaff()');
console.log('- etc.');
