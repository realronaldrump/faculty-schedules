// test-import.js
// Test script for validating smart import utilities

import { parseInstructorField, parseMeetingPatterns, parseFullName, determineRoles, normalizeTime } from './src/utils/dataImportUtils.js';

console.log('🧪 Testing Smart Import Utilities\n');

// Test instructor parsing
console.log('1. Testing Instructor Field Parsing:');
const instructorTests = [
  'Dragoo, Sheri (892564540) [Primary, 100%]',
  'Yoo, Jeongju (891178020) [Primary, 100%]',
  'Staff [Primary, 100%]',
  'Brunson, Rochelle (889369334) [Primary, 100%]'
];

instructorTests.forEach(test => {
  const result = parseInstructorField(test);
  console.log(`  Input: ${test}`);
  console.log(`  Output:`, result);
  console.log('');
});

// Test meeting pattern parsing
console.log('2. Testing Meeting Pattern Parsing:');
const meetingTests = [
  'T 9am-10:40am; S 2pm-4pm',
  'TR 2pm-3:15pm; T 2pm-4pm',
  'MW 8:30am-11am; MW 8:30am-11am; S 4:30pm-6:30pm',
  'Does Not Meet',
  'MWF 9:05am-9:55am; T 9am-11am'
];

meetingTests.forEach(test => {
  const result = parseMeetingPatterns(test);
  console.log(`  Input: ${test}`);
  console.log(`  Output:`, result);
  console.log('');
});

// Test name parsing
console.log('3. Testing Name Parsing:');
const nameTests = [
  'Dr. Sheri L. Dragoo',
  'Ms. Allison L. Abel',
  'Mrs. Amber D. Arnold',
  'John Smith',
  'Mary Johnson-Smith'
];

nameTests.forEach(test => {
  const result = parseFullName(test);
  console.log(`  Input: ${test}`);
  console.log(`  Output:`, result);
  console.log('');
});

// Test role determination
console.log('4. Testing Role Determination:');
const jobTitleTests = [
  'Professor',
  'Lecturer', 
  'Clinical Assistant Professor',
  'Administrative Associate',
  'Lab Coordinator',
  'Senior Lecturer',
  'Associate Professor',
  'Postdoc Research Associate'
];

jobTitleTests.forEach(test => {
  const result = determineRoles(test);
  console.log(`  Input: ${test}`);
  console.log(`  Output:`, result);
  console.log('');
});

// Test time normalization
console.log('5. Testing Time Normalization:');
const timeTests = [
  '9am',
  '2:15pm', 
  '11:50am',
  '4:30pm',
  '12pm'
];

timeTests.forEach(test => {
  const result = normalizeTime(test);
  console.log(`  Input: ${test}`);
  console.log(`  Output: ${result}`);
  console.log('');
});

console.log('✅ All tests completed!'); 