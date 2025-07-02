/**
 * Migration Script: Convert Program Override to Program ID References
 * 
 * This script migrates faculty records from the old programOverride system
 * to the new programId system that references the programs collection.
 * 
 * IMPORTANT: Run this script AFTER creating the programs collection in Firebase!
 * 
 * Usage: node migration-script.js
 */

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  writeBatch
} from 'firebase/firestore';

// Firebase configuration - replace with your config
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
const db = getFirestore(app);

// Program mapping for migration
const PROGRAM_NAME_TO_ID_MAPPING = {
  'Nutrition': 'nutrition',
  'Apparel': 'apparel',
  'Interior Design': 'interior-design',
  'Child & Family Studies': 'child-family-studies'
};

// Course prefix to program ID mapping
const COURSE_PREFIX_TO_PROGRAM_ID = {
  'NUTR': 'nutrition',
  'ADM': 'apparel',
  'ID': 'interior-design',
  'CFS': 'child-family-studies'
};

/**
 * Determine program ID from course codes
 */
function determineProgramIdFromCourses(scheduleData, facultyName) {
  if (!scheduleData || !facultyName) return null;
  
  // Find all courses taught by this faculty member
  const facultyCourses = scheduleData.filter(schedule => {
    const instructorName = schedule.instructorName || '';
    return instructorName.toLowerCase().includes(facultyName.toLowerCase()) ||
           facultyName.toLowerCase().includes(instructorName.toLowerCase());
  });
  
  // Extract course code prefixes
  const prefixes = new Set();
  facultyCourses.forEach(schedule => {
    const courseCode = schedule.courseCode || '';
    const match = courseCode.match(/^([A-Z]{2,4})\s*\d/);
    if (match) {
      prefixes.add(match[1]);
    }
  });
  
  // Return the first valid program ID we find
  for (const prefix of prefixes) {
    if (COURSE_PREFIX_TO_PROGRAM_ID[prefix]) {
      return COURSE_PREFIX_TO_PROGRAM_ID[prefix];
    }
  }
  
  return null;
}

/**
 * Determine program ID from job title (fallback method)
 */
function determineProgramIdFromJobTitle(jobTitle) {
  if (!jobTitle) return null;
  
  const title = jobTitle.toLowerCase();
  
  if (title.includes('apparel') || title.includes('design') || title.includes('adm')) {
    return 'apparel';
  } else if (title.includes('nutrition') || title.includes('nutr')) {
    return 'nutrition';
  } else if (title.includes('interior') || title.includes('id')) {
    return 'interior-design';
  } else if (title.includes('child') || title.includes('family') || title.includes('cfs')) {
    return 'child-family-studies';
  }
  
  return null;
}

/**
 * Main migration function
 */
async function migrateProgramData() {
  console.log('🚀 Starting program data migration...');
  
  try {
    // Load all data
    console.log('📡 Loading data from Firebase...');
    const [peopleSnapshot, schedulesSnapshot, programsSnapshot] = await Promise.all([
      getDocs(collection(db, 'people')),
      getDocs(collection(db, 'schedules')),
      getDocs(collection(db, 'programs'))
    ]);
    
    const people = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const schedules = schedulesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const programs = programsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log(`📊 Found ${people.length} people, ${schedules.length} schedules, ${programs.length} programs`);
    
    if (programs.length === 0) {
      console.error('❌ No programs found! Please create the programs collection first.');
      return;
    }
    
    // Create a mapping of program names to IDs for lookup
    const programNameToIdMap = {};
    programs.forEach(program => {
      programNameToIdMap[program.name] = program.id;
    });
    
    console.log('🔄 Processing faculty members...');
    
    let updatedCount = 0;
    let skippedCount = 0;
    let updProgramUpdates = {};
    
    // Use batched writes for efficiency
    const batch = writeBatch(db);
    let batchSize = 0;
    const MAX_BATCH_SIZE = 500;
    
    for (const person of people) {
      // Only process faculty
      const roles = Array.isArray(person.roles) ? person.roles : 
                   (person.roles && typeof person.roles === 'object') ? 
                   Object.keys(person.roles).filter(k => person.roles[k]) : [];
      
      if (!roles.includes('faculty')) {
        continue;
      }
      
      const facultyName = `${person.firstName || ''} ${person.lastName || ''}`.trim();
      let programId = null;
      let migrationMethod = '';
      
      // Step 1: Check for programOverride (highest priority)
      if (person.programOverride && person.programOverride.trim() !== '') {
        const overrideProgramName = person.programOverride.trim();
        programId = programNameToIdMap[overrideProgramName];
        migrationMethod = 'programOverride';
        
        if (!programId) {
          console.warn(`⚠️  No program found for override "${overrideProgramName}" for ${facultyName}`);
        }
      }
      
      // Step 2: Determine from schedule data if no override
      if (!programId) {
        programId = determineProgramIdFromCourses(schedules, facultyName);
        migrationMethod = 'schedule';
      }
      
      // Step 3: Fallback to job title analysis
      if (!programId && person.jobTitle) {
        programId = determineProgramIdFromJobTitle(person.jobTitle);
        migrationMethod = 'jobTitle';
      }
      
      // Prepare updates
      const updates = {
        updatedAt: new Date().toISOString(),
        // Add migration metadata
        migratedAt: new Date().toISOString(),
        migrationMethod: migrationMethod
      };
      
      // Set programId if determined
      if (programId) {
        updates.programId = programId;
      }
      
      // Track UPD program assignments for later processing
      if (person.isUPD && person.updProgram) {
        const updProgramId = programNameToIdMap[person.updProgram];
        if (updProgramId) {
          updProgramUpdates[updProgramId] = person.id;
        }
      }
      
      // Remove obsolete fields
      updates.programOverride = null;
      updates.updProgram = null;
      
      // Add to batch
      const personRef = doc(db, 'people', person.id);
      batch.update(personRef, updates);
      batchSize++;
      updatedCount++;
      
      console.log(`✅ ${facultyName}: ${programId ? `assigned to ${programId}` : 'no program assigned'} (via ${migrationMethod})`);
      
      // Commit batch if it's getting large
      if (batchSize >= MAX_BATCH_SIZE) {
        await batch.commit();
        console.log(`📦 Committed batch of ${batchSize} updates`);
        batchSize = 0;
      }
    }
    
    // Commit remaining updates
    if (batchSize > 0) {
      await batch.commit();
      console.log(`📦 Committed final batch of ${batchSize} updates`);
    }
    
    // Update programs collection with UPD assignments
    console.log('🔄 Updating UPD assignments in programs collection...');
    for (const [programId, facultyId] of Object.entries(updProgramUpdates)) {
      const programRef = doc(db, 'programs', programId);
      await updateDoc(programRef, {
        updId: facultyId,
        updatedAt: new Date().toISOString()
      });
      console.log(`👨‍🏫 Set UPD for ${programId}: ${facultyId}`);
    }
    
    console.log('✅ Migration completed successfully!');
    console.log(`📊 Migration Summary:`);
    console.log(`   - Updated: ${updatedCount} faculty members`);
    console.log(`   - UPD assignments: ${Object.keys(updProgramUpdates).length}`);
    console.log(`   - Skipped: ${skippedCount} non-faculty records`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Verification function to check migration results
 */
async function verifyMigration() {
  console.log('🔍 Verifying migration results...');
  
  try {
    const [peopleSnapshot, programsSnapshot] = await Promise.all([
      getDocs(collection(db, 'people')),
      getDocs(collection(db, 'programs'))
    ]);
    
    const people = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const programs = programsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const faculty = people.filter(person => {
      const roles = Array.isArray(person.roles) ? person.roles : 
                   (person.roles && typeof person.roles === 'object') ? 
                   Object.keys(person.roles).filter(k => person.roles[k]) : [];
      return roles.includes('faculty');
    });
    
    const facultyWithPrograms = faculty.filter(f => f.programId);
    const facultyWithoutPrograms = faculty.filter(f => !f.programId);
    
    console.log(`📊 Verification Results:`);
    console.log(`   - Total faculty: ${faculty.length}`);
    console.log(`   - Faculty with programs: ${facultyWithPrograms.length}`);
    console.log(`   - Faculty without programs: ${facultyWithoutPrograms.length}`);
    
    // Show faculty without programs
    if (facultyWithoutPrograms.length > 0) {
      console.log(`\n⚠️  Faculty without programs:`);
      facultyWithoutPrograms.forEach(f => {
        console.log(`   - ${f.firstName} ${f.lastName} (${f.jobTitle || 'No job title'})`);
      });
    }
    
    // Show program assignments
    console.log(`\n📋 Program assignments:`);
    const programCounts = {};
    facultyWithPrograms.forEach(f => {
      programCounts[f.programId] = (programCounts[f.programId] || 0) + 1;
    });
    
    Object.entries(programCounts).forEach(([programId, count]) => {
      const program = programs.find(p => p.id === programId);
      console.log(`   - ${program?.name || programId}: ${count} faculty`);
    });
    
    // Check UPD assignments
    console.log(`\n👨‍🏫 UPD assignments:`);
    programs.forEach(program => {
      if (program.updId) {
        const updFaculty = people.find(p => p.id === program.updId);
        console.log(`   - ${program.name}: ${updFaculty?.firstName} ${updFaculty?.lastName}`);
      } else {
        console.log(`   - ${program.name}: No UPD assigned`);
      }
    });
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

// Main execution
async function main() {
  try {
    await migrateProgramData();
    await verifyMigration();
    console.log('\n🎉 Migration and verification completed!');
    process.exit(0);
  } catch (error) {
    console.error('\n💥 Migration failed:', error);
    process.exit(1);
  }
}

// Check if this script is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
} 