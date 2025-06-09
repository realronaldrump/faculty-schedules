// src/utils/migration.js
import { db } from '../firebase';
import { 
  collection, 
  getDocs, 
  writeBatch, 
  doc, 
  addDoc,
  query,
  where,
  orderBy 
} from 'firebase/firestore';

/**
 * Data migration utilities to convert from flat structure to normalized structure
 */

export class DataMigration {
  constructor() {
    this.batch = null;
    this.results = {
      faculty: { created: 0, updated: 0, errors: [] },
      staff: { created: 0, updated: 0, errors: [] },
      courses: { created: 0, updated: 0, errors: [] },
      rooms: { created: 0, updated: 0, errors: [] },
      schedules: { updated: 0, errors: [] },
      summary: { startTime: null, endTime: null, totalOperations: 0 }
    };
    this.lookupMaps = {
      faculty: {},
      courses: {},
      rooms: {}
    };
  }

  /**
   * Main migration function - converts flat schedule data to normalized structure
   */
  async migrateToNormalizedStructure(options = {}) {
    const {
      dryRun = false,
      batchSize = 100,
      preserveOriginal = true,
      logProgress = true
    } = options;

    this.results.summary.startTime = new Date();
    
    if (logProgress) {
      console.log('🚀 Starting data migration to normalized structure...');
      console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE MIGRATION'}`);
    }

    try {
      // Step 1: Load existing data
      if (logProgress) console.log('📂 Loading existing data...');
      const existingData = await this.loadExistingData();
      
      // Step 2: Analyze current structure
      if (logProgress) console.log('🔍 Analyzing data structure...');
      const analysis = await this.analyzeDataStructure(existingData);
      
      if (logProgress) {
        console.log('📊 Data Analysis Results:');
        console.log(`  - Schedule entries: ${analysis.schedules.count}`);
        console.log(`  - Unique instructors: ${analysis.instructors.count}`);
        console.log(`  - Unique courses: ${analysis.courses.count}`);
        console.log(`  - Unique rooms: ${analysis.rooms.count}`);
        console.log(`  - Structure type: ${analysis.isNormalized ? 'Normalized' : 'Flat'}`);
      }

      // Skip migration if already normalized
      if (analysis.isNormalized) {
        if (logProgress) console.log('✅ Data is already normalized. Skipping migration.');
        return { ...this.results, alreadyNormalized: true };
      }

      // Step 3: Create entity lookup tables
      if (logProgress) console.log('🏗️  Creating entity lookup tables...');
      await this.createEntityMaps(existingData.schedules);

      // Step 4: Migrate data in batches
      if (!dryRun) {
        if (logProgress) console.log('💾 Migrating data...');
        await this.migrateBatches(existingData.schedules, batchSize);
        
        // Step 5: Validate migration
        if (logProgress) console.log('✅ Validating migration...');
        const validation = await this.validateMigration();
        this.results.validation = validation;
      }

      // Step 6: Backup original data if preserving
      if (preserveOriginal && !dryRun) {
        if (logProgress) console.log('💼 Backing up original data...');
        await this.backupOriginalData(existingData);
      }

      this.results.summary.endTime = new Date();
      this.results.summary.duration = this.results.summary.endTime - this.results.summary.startTime;

      if (logProgress) {
        console.log('🎉 Migration completed successfully!');
        this.printSummary();
      }

      return this.results;

    } catch (error) {
      console.error('❌ Migration failed:', error);
      this.results.summary.error = error.message;
      throw error;
    }
  }

  /**
   * Load existing data from Firestore
   */
  async loadExistingData() {
    const [schedulesSnap, facultySnap, staffSnap, coursesSnap, roomsSnap] = await Promise.all([
      getDocs(collection(db, 'schedules')),
      getDocs(collection(db, 'faculty')),
      getDocs(collection(db, 'staff')),
      getDocs(collection(db, 'courses')),
      getDocs(collection(db, 'rooms'))
    ]);

    return {
      schedules: schedulesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      faculty: facultySnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      staff: staffSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      courses: coursesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      rooms: roomsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    };
  }

  /**
   * Analyze the current data structure
   */
  async analyzeDataStructure(data) {
    const analysis = {
      schedules: { count: data.schedules.length },
      instructors: { count: 0, list: [] },
      courses: { count: 0, list: [] },
      rooms: { count: 0, list: [] },
      isNormalized: false
    };

    // Check if schedules have ID references (normalized) or string values (flat)
    const hasIdReferences = data.schedules.some(s => 
      s.facultyId || s.courseId || s.roomId
    );

    const hasStringReferences = data.schedules.some(s => 
      s.Instructor || s.Course || s.Room
    );

    analysis.isNormalized = hasIdReferences && !hasStringReferences;

    // Analyze unique values
    if (data.schedules.length > 0) {
      const instructors = new Set();
      const courses = new Set();
      const rooms = new Set();

      data.schedules.forEach(schedule => {
        const instructor = schedule.Instructor || schedule.instructor;
        const course = schedule.Course || schedule.course;
        const room = schedule.Room || schedule.room;

        if (instructor) instructors.add(instructor);
        if (course) courses.add(course);
        if (room) rooms.add(room);
      });

      analysis.instructors = { count: instructors.size, list: Array.from(instructors) };
      analysis.courses = { count: courses.size, list: Array.from(courses) };
      analysis.rooms = { count: rooms.size, list: Array.from(rooms) };
    }

    return analysis;
  }

  /**
   * Create entity maps for lookup
   */
  async createEntityMaps(schedules) {
    // Extract unique values
    const uniqueInstructors = new Set();
    const uniqueCourses = new Map(); // Map to store course code -> title
    const uniqueRooms = new Set();

    schedules.forEach(schedule => {
      const instructor = schedule.Instructor || schedule.instructor;
      const course = schedule.Course || schedule.course;
      const courseTitle = schedule['Course Title'] || schedule.courseTitle || '';
      const room = schedule.Room || schedule.room;

      if (instructor && instructor !== 'Staff') uniqueInstructors.add(instructor);
      if (course) uniqueCourses.set(course, courseTitle);
      if (room) uniqueRooms.add(room);
    });

    // Create faculty entities
    console.log(`Creating ${uniqueInstructors.size} faculty entities...`);
    for (const instructorName of uniqueInstructors) {
      try {
        const facultyData = {
          name: instructorName,
          email: '',
          phone: '',
          office: '',
          jobTitle: '',
          isAdjunct: false,
          isAlsoStaff: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          migratedFrom: 'legacy_schedules'
        };

        const docRef = await addDoc(collection(db, 'faculty'), facultyData);
        this.lookupMaps.faculty[instructorName] = docRef.id;
        this.results.faculty.created++;
      } catch (error) {
        console.error(`Error creating faculty ${instructorName}:`, error);
        this.results.faculty.errors.push(`${instructorName}: ${error.message}`);
      }
    }

    // Create course entities
    console.log(`Creating ${uniqueCourses.size} course entities...`);
    for (const [courseCode, courseTitle] of uniqueCourses) {
      try {
        const courseData = {
          courseCode,
          title: courseTitle,
          description: '',
          credits: 3,
          department: 'HSD',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          migratedFrom: 'legacy_schedules'
        };

        const docRef = await addDoc(collection(db, 'courses'), courseData);
        this.lookupMaps.courses[courseCode] = docRef.id;
        this.results.courses.created++;
      } catch (error) {
        console.error(`Error creating course ${courseCode}:`, error);
        this.results.courses.errors.push(`${courseCode}: ${error.message}`);
      }
    }

    // Create room entities
    console.log(`Creating ${uniqueRooms.size} room entities...`);
    for (const roomName of uniqueRooms) {
      try {
        const roomParts = roomName.split(' ');
        const building = roomParts[0] || 'Unknown';
        const roomNumber = roomParts.slice(1).join(' ') || '';

        const roomData = {
          name: roomName,
          building,
          roomNumber,
          capacity: null,
          equipment: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          migratedFrom: 'legacy_schedules'
        };

        const docRef = await addDoc(collection(db, 'rooms'), roomData);
        this.lookupMaps.rooms[roomName] = docRef.id;
        this.results.rooms.created++;
      } catch (error) {
        console.error(`Error creating room ${roomName}:`, error);
        this.results.rooms.errors.push(`${roomName}: ${error.message}`);
      }
    }
  }

  /**
   * Migrate data in batches
   */
  async migrateBatches(schedules, batchSize) {
    const totalBatches = Math.ceil(schedules.length / batchSize);
    
    for (let i = 0; i < totalBatches; i++) {
      const startIdx = i * batchSize;
      const endIdx = Math.min(startIdx + batchSize, schedules.length);
      const batch = schedules.slice(startIdx, endIdx);
      
      console.log(`Processing batch ${i + 1}/${totalBatches} (${batch.length} items)`);
      
      await this.migrateBatch(batch);
      this.results.summary.totalOperations += batch.length;
    }
  }

  /**
   * Migrate a single batch of schedules
   */
  async migrateBatch(schedules) {
    const batch = writeBatch(db);

    for (const schedule of schedules) {
      try {
        const updates = {};
        let hasUpdates = false;

        // Map instructor to faculty ID
        const instructor = schedule.Instructor || schedule.instructor;
        if (instructor && instructor !== 'Staff') {
          const facultyId = this.lookupMaps.faculty[instructor];
          if (facultyId) {
            updates.facultyId = facultyId;
            hasUpdates = true;
          }
        } else if (instructor === 'Staff') {
          updates.facultyId = null;
          hasUpdates = true;
        }

        // Map course to course ID
        const course = schedule.Course || schedule.course;
        if (course) {
          const courseId = this.lookupMaps.courses[course];
          if (courseId) {
            updates.courseId = courseId;
            hasUpdates = true;
          }
        }

        // Map room to room ID
        const room = schedule.Room || schedule.room;
        if (room) {
          const roomId = this.lookupMaps.rooms[room];
          if (roomId) {
            updates.roomId = roomId;
            hasUpdates = true;
          }
        }

        // Normalize time fields
        const startTime = schedule['Start Time'] || schedule.startTime;
        const endTime = schedule['End Time'] || schedule.endTime;
        const day = schedule.Day || schedule.day;

        if (startTime !== schedule.startTime) {
          updates.startTime = startTime;
          hasUpdates = true;
        }
        if (endTime !== schedule.endTime) {
          updates.endTime = endTime;
          hasUpdates = true;
        }
        if (day !== schedule.day) {
          updates.day = day;
          hasUpdates = true;
        }

        // Add migration metadata
        if (hasUpdates) {
          updates.updatedAt = new Date().toISOString();
          updates.migratedAt = new Date().toISOString();
          
          const scheduleRef = doc(db, 'schedules', schedule.id);
          batch.update(scheduleRef, updates);
          this.results.schedules.updated++;
        }

      } catch (error) {
        console.error(`Error processing schedule ${schedule.id}:`, error);
        this.results.schedules.errors.push(`${schedule.id}: ${error.message}`);
      }
    }

    await batch.commit();
  }

  /**
   * Validate the migration results
   */
  async validateMigration() {
    console.log('🔍 Validating migration...');
    
    const validation = {
      isValid: true,
      issues: [],
      stats: {}
    };

    try {
      // Load updated data
      const [schedules, faculty, courses, rooms] = await Promise.all([
        getDocs(collection(db, 'schedules')),
        getDocs(collection(db, 'faculty')),
        getDocs(collection(db, 'courses')),
        getDocs(collection(db, 'rooms'))
      ]);

      const scheduleData = schedules.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const facultyIds = new Set(faculty.docs.map(doc => doc.id));
      const courseIds = new Set(courses.docs.map(doc => doc.id));
      const roomIds = new Set(rooms.docs.map(doc => doc.id));

      validation.stats = {
        schedules: scheduleData.length,
        faculty: facultyIds.size,
        courses: courseIds.size,
        rooms: roomIds.size
      };

      // Check for orphaned references
      for (const schedule of scheduleData) {
        if (schedule.facultyId && !facultyIds.has(schedule.facultyId)) {
          validation.issues.push(`Schedule ${schedule.id} references non-existent faculty ${schedule.facultyId}`);
          validation.isValid = false;
        }
        if (schedule.courseId && !courseIds.has(schedule.courseId)) {
          validation.issues.push(`Schedule ${schedule.id} references non-existent course ${schedule.courseId}`);
          validation.isValid = false;
        }
        if (schedule.roomId && !roomIds.has(schedule.roomId)) {
          validation.issues.push(`Schedule ${schedule.id} references non-existent room ${schedule.roomId}`);
          validation.isValid = false;
        }
      }

      // Check for remaining flat references
      const flatReferences = scheduleData.filter(s => 
        s.Instructor || s.Course || s.Room || s['Course Title']
      );

      if (flatReferences.length > 0) {
        validation.issues.push(`${flatReferences.length} schedules still have flat references`);
        validation.isValid = false;
      }

    } catch (error) {
      validation.isValid = false;
      validation.issues.push(`Validation error: ${error.message}`);
    }

    return validation;
  }

  /**
   * Backup original data before migration
   */
  async backupOriginalData(data) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupCollection = `backup_${timestamp}`;

    console.log(`💾 Creating backup in collection: ${backupCollection}`);

    const batch = writeBatch(db);
    
    // Backup schedules
    data.schedules.forEach(schedule => {
      const backupRef = doc(collection(db, backupCollection), schedule.id);
      batch.set(backupRef, {
        ...schedule,
        originalCollection: 'schedules',
        backedUpAt: new Date().toISOString()
      });
    });

    await batch.commit();
    
    this.results.backup = {
      collection: backupCollection,
      itemsBackedUp: data.schedules.length
    };
  }

  /**
   * Print migration summary
   */
  printSummary() {
    const { results } = this;
    
    console.log('\n📊 Migration Summary:');
    console.log('='.repeat(50));
    console.log(`⏱️  Duration: ${Math.round(results.summary.duration / 1000)}s`);
    console.log(`📈 Total Operations: ${results.summary.totalOperations}`);
    console.log('');
    console.log('📁 Entities Created:');
    console.log(`  👤 Faculty: ${results.faculty.created} created`);
    console.log(`  📚 Courses: ${results.courses.created} created`);
    console.log(`  🏢 Rooms: ${results.rooms.created} created`);
    console.log(`  📅 Schedules: ${results.schedules.updated} updated`);
    
    if (results.validation) {
      console.log('');
      console.log('✅ Validation:');
      console.log(`  Status: ${results.validation.isValid ? 'PASSED' : 'FAILED'}`);
      if (results.validation.issues.length > 0) {
        console.log(`  Issues: ${results.validation.issues.length}`);
        results.validation.issues.slice(0, 5).forEach(issue => {
          console.log(`    - ${issue}`);
        });
      }
    }

    const totalErrors = results.faculty.errors.length + 
                       results.courses.errors.length + 
                       results.rooms.errors.length + 
                       results.schedules.errors.length;

    if (totalErrors > 0) {
      console.log('');
      console.log('⚠️  Errors:');
      console.log(`  Total: ${totalErrors}`);
      console.log(`  Faculty: ${results.faculty.errors.length}`);
      console.log(`  Courses: ${results.courses.errors.length}`);
      console.log(`  Rooms: ${results.rooms.errors.length}`);
      console.log(`  Schedules: ${results.schedules.errors.length}`);
    }

    console.log('='.repeat(50));
  }

  /**
   * Rollback migration (emergency use)
   */
  async rollbackMigration(backupCollection) {
    console.log('🔄 Rolling back migration...');
    
    try {
      // Load backup data
      const backupSnapshot = await getDocs(collection(db, backupCollection));
      const backupData = backupSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Restore schedules
      const batch = writeBatch(db);
      
      backupData.forEach(item => {
        if (item.originalCollection === 'schedules') {
          const { originalCollection, backedUpAt, ...originalData } = item;
          const scheduleRef = doc(db, 'schedules', item.id);
          batch.set(scheduleRef, originalData);
        }
      });

      await batch.commit();
      
      console.log(`✅ Rollback completed. Restored ${backupData.length} items.`);
      
      return { success: true, itemsRestored: backupData.length };
      
    } catch (error) {
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
}

// Convenience functions for direct use
export const migrateData = async (options = {}) => {
  const migration = new DataMigration();
  return await migration.migrateToNormalizedStructure(options);
};

export const validateDataIntegrity = async () => {
  const migration = new DataMigration();
  const existingData = await migration.loadExistingData();
  return await migration.validateMigration();
};

export const rollbackMigration = async (backupCollection) => {
  const migration = new DataMigration();
  return await migration.rollbackMigration(backupCollection);
};