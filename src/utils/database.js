// src/utils/database.js
import { db } from '../firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  writeBatch, 
  query, 
  where, 
  orderBy,
  limit 
} from 'firebase/firestore';

/**
 * Database utility functions for managing normalized data structure
 */

// Collection names
export const COLLECTIONS = {
  FACULTY: 'faculty',
  STAFF: 'staff',
  COURSES: 'courses',
  ROOMS: 'rooms',
  SCHEDULES: 'schedules',
  HISTORY: 'history'
};

// Generic CRUD operations
export const dbUtils = {
  // Create a new document
  async create(collectionName, data) {
    try {
      const docRef = await addDoc(collection(db, collectionName), {
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      return { id: docRef.id, ...data };
    } catch (error) {
      console.error(`Error creating document in ${collectionName}:`, error);
      throw error;
    }
  },

  // Read a document by ID
  async read(collectionName, id) {
    try {
      const docRef = doc(db, collectionName, id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      } else {
        return null;
      }
    } catch (error) {
      console.error(`Error reading document from ${collectionName}:`, error);
      throw error;
    }
  },

  // Read all documents in a collection
  async readAll(collectionName, orderByField = null) {
    try {
      let q = collection(db, collectionName);
      
      if (orderByField) {
        q = query(q, orderBy(orderByField));
      }
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error(`Error reading all documents from ${collectionName}:`, error);
      throw error;
    }
  },

  // Update a document
  async update(collectionName, id, data) {
    try {
      const docRef = doc(db, collectionName, id);
      const updateData = {
        ...data,
        updatedAt: new Date().toISOString()
      };
      
      await updateDoc(docRef, updateData);
      return { id, ...updateData };
    } catch (error) {
      console.error(`Error updating document in ${collectionName}:`, error);
      throw error;
    }
  },

  // Delete a document
  async delete(collectionName, id) {
    try {
      const docRef = doc(db, collectionName, id);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error(`Error deleting document from ${collectionName}:`, error);
      throw error;
    }
  },

  // Find documents by field value
  async findBy(collectionName, field, value, limitCount = null) {
    try {
      let q = query(collection(db, collectionName), where(field, '==', value));
      
      if (limitCount) {
        q = query(q, limit(limitCount));
      }
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error(`Error finding documents in ${collectionName}:`, error);
      throw error;
    }
  }
};

// Faculty-specific operations
export const facultyUtils = {
  async findByName(name) {
    const results = await dbUtils.findBy(COLLECTIONS.FACULTY, 'name', name, 1);
    return results.length > 0 ? results[0] : null;
  },

  async findByEmail(email) {
    const results = await dbUtils.findBy(COLLECTIONS.FACULTY, 'email', email, 1);
    return results.length > 0 ? results[0] : null;
  },

  async findOrCreate(facultyData) {
    // Try to find by email first
    if (facultyData.email) {
      const existing = await this.findByEmail(facultyData.email);
      if (existing) return existing;
    }

    // Try to find by name
    if (facultyData.name) {
      const existing = await this.findByName(facultyData.name);
      if (existing) return existing;
    }

    // Create new faculty member
    return await dbUtils.create(COLLECTIONS.FACULTY, {
      name: facultyData.name || '',
      email: facultyData.email || '',
      phone: facultyData.phone || '',
      office: facultyData.office || '',
      jobTitle: facultyData.jobTitle || '',
      isAdjunct: facultyData.isAdjunct || false,
      isAlsoStaff: facultyData.isAlsoStaff || false
    });
  },

  async getSchedules(facultyId) {
    return await dbUtils.findBy(COLLECTIONS.SCHEDULES, 'facultyId', facultyId);
  }
};

// Staff-specific operations
export const staffUtils = {
  async findByName(name) {
    const results = await dbUtils.findBy(COLLECTIONS.STAFF, 'name', name, 1);
    return results.length > 0 ? results[0] : null;
  },

  async findByEmail(email) {
    const results = await dbUtils.findBy(COLLECTIONS.STAFF, 'email', email, 1);
    return results.length > 0 ? results[0] : null;
  },

  async findOrCreate(staffData) {
    // Try to find by email first
    if (staffData.email) {
      const existing = await this.findByEmail(staffData.email);
      if (existing) return existing;
    }

    // Try to find by name
    if (staffData.name) {
      const existing = await this.findByName(staffData.name);
      if (existing) return existing;
    }

    // Create new staff member
    return await dbUtils.create(COLLECTIONS.STAFF, {
      name: staffData.name || '',
      email: staffData.email || '',
      phone: staffData.phone || '',
      office: staffData.office || '',
      jobTitle: staffData.jobTitle || '',
      isFullTime: staffData.isFullTime !== false,
      isAlsoFaculty: staffData.isAlsoFaculty || false
    });
  }
};

// Course-specific operations
export const courseUtils = {
  async findByCourseCode(courseCode) {
    const results = await dbUtils.findBy(COLLECTIONS.COURSES, 'courseCode', courseCode, 1);
    return results.length > 0 ? results[0] : null;
  },

  async findOrCreate(courseData) {
    // Try to find by course code
    if (courseData.courseCode) {
      const existing = await this.findByCourseCode(courseData.courseCode);
      if (existing) {
        // Update title if provided and different
        if (courseData.title && courseData.title !== existing.title && !existing.title) {
          const updated = await dbUtils.update(COLLECTIONS.COURSES, existing.id, {
            ...existing,
            title: courseData.title
          });
          return updated;
        }
        return existing;
      }
    }

    // Create new course
    return await dbUtils.create(COLLECTIONS.COURSES, {
      courseCode: courseData.courseCode || '',
      title: courseData.title || '',
      description: courseData.description || '',
      credits: courseData.credits || 3,
      department: courseData.department || 'HSD'
    });
  },

  async getSchedules(courseId) {
    return await dbUtils.findBy(COLLECTIONS.SCHEDULES, 'courseId', courseId);
  }
};

// Room-specific operations
export const roomUtils = {
  async findByName(name) {
    const results = await dbUtils.findBy(COLLECTIONS.ROOMS, 'name', name, 1);
    return results.length > 0 ? results[0] : null;
  },

  async findOrCreate(roomData) {
    // Try to find by name
    if (roomData.name) {
      const existing = await this.findByName(roomData.name);
      if (existing) return existing;
    }

    // Parse building and room number from name
    const nameParts = roomData.name ? roomData.name.split(' ') : ['Unknown'];
    const building = nameParts[0] || 'Unknown';
    const roomNumber = nameParts.slice(1).join(' ') || '';

    // Create new room
    return await dbUtils.create(COLLECTIONS.ROOMS, {
      name: roomData.name || '',
      building: roomData.building || building,
      roomNumber: roomData.roomNumber || roomNumber,
      capacity: roomData.capacity || null,
      equipment: roomData.equipment || []
    });
  },

  async getSchedules(roomId) {
    return await dbUtils.findBy(COLLECTIONS.SCHEDULES, 'roomId', roomId);
  }
};

// Schedule-specific operations
export const scheduleUtils = {
  async create(scheduleData) {
    const requiredFields = ['day', 'startTime', 'endTime'];
    for (const field of requiredFields) {
      if (!scheduleData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    return await dbUtils.create(COLLECTIONS.SCHEDULES, {
      facultyId: scheduleData.facultyId || null,
      courseId: scheduleData.courseId,
      roomId: scheduleData.roomId || null,
      day: scheduleData.day,
      startTime: scheduleData.startTime,
      endTime: scheduleData.endTime,
      semester: scheduleData.semester || 'Fall 2025'
    });
  },

  async getByFaculty(facultyId) {
    return await dbUtils.findBy(COLLECTIONS.SCHEDULES, 'facultyId', facultyId);
  },

  async getByCourse(courseId) {
    return await dbUtils.findBy(COLLECTIONS.SCHEDULES, 'courseId', courseId);
  },

  async getByRoom(roomId) {
    return await dbUtils.findBy(COLLECTIONS.SCHEDULES, 'roomId', roomId);
  },

  async getByDay(day) {
    return await dbUtils.findBy(COLLECTIONS.SCHEDULES, 'day', day);
  }
};

// History/audit operations
export const historyUtils = {
  async log(change) {
    return await dbUtils.create(COLLECTIONS.HISTORY, {
      ...change,
      timestamp: new Date().toISOString()
    });
  },

  async getBySchedule(scheduleId) {
    return await dbUtils.findBy(COLLECTIONS.HISTORY, 'rowId', scheduleId);
  },

  async getRecent(limitCount = 50) {
    try {
      const q = query(
        collection(db, COLLECTIONS.HISTORY), 
        orderBy('timestamp', 'desc'), 
        limit(limitCount)
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting recent history:', error);
      throw error;
    }
  }
};

// Data migration utilities
export const migrationUtils = {
  async migrateFromLegacySchedules(legacySchedules) {
    const batch = writeBatch(db);
    const results = {
      facultyCreated: 0,
      coursesCreated: 0,
      roomsCreated: 0,
      schedulesUpdated: 0,
      errors: []
    };

    try {
      for (const schedule of legacySchedules) {
        try {
          // Handle faculty
          let facultyId = null;
          if (schedule.Instructor && schedule.Instructor !== 'Staff') {
            const faculty = await facultyUtils.findOrCreate({ name: schedule.Instructor });
            facultyId = faculty.id;
            if (!schedule.facultyId) results.facultyCreated++;
          }

          // Handle course
          let courseId = null;
          if (schedule.Course) {
            const course = await courseUtils.findOrCreate({ 
              courseCode: schedule.Course, 
              title: schedule['Course Title'] || '' 
            });
            courseId = course.id;
            if (!schedule.courseId) results.coursesCreated++;
          }

          // Handle room
          let roomId = null;
          if (schedule.Room) {
            const room = await roomUtils.findOrCreate({ name: schedule.Room });
            roomId = room.id;
            if (!schedule.roomId) results.roomsCreated++;
          }

          // Update schedule with IDs
          if (facultyId || courseId || roomId) {
            const scheduleRef = doc(db, COLLECTIONS.SCHEDULES, schedule.id);
            const updateData = {};
            
            if (facultyId) updateData.facultyId = facultyId;
            if (courseId) updateData.courseId = courseId;
            if (roomId) updateData.roomId = roomId;
            
            batch.update(scheduleRef, updateData);
            results.schedulesUpdated++;
          }

        } catch (error) {
          results.errors.push(`Error processing schedule ${schedule.id}: ${error.message}`);
        }
      }

      await batch.commit();
      return results;

    } catch (error) {
      console.error('Migration error:', error);
      results.errors.push(`Batch commit error: ${error.message}`);
      return results;
    }
  },

  async validateDataIntegrity() {
    const issues = [];

    try {
      // Check for schedules with invalid faculty references
      const schedules = await dbUtils.readAll(COLLECTIONS.SCHEDULES);
      const faculty = await dbUtils.readAll(COLLECTIONS.FACULTY);
      const courses = await dbUtils.readAll(COLLECTIONS.COURSES);
      const rooms = await dbUtils.readAll(COLLECTIONS.ROOMS);

      const facultyIds = new Set(faculty.map(f => f.id));
      const courseIds = new Set(courses.map(c => c.id));
      const roomIds = new Set(rooms.map(r => r.id));

      for (const schedule of schedules) {
        if (schedule.facultyId && !facultyIds.has(schedule.facultyId)) {
          issues.push(`Schedule ${schedule.id} references non-existent faculty ${schedule.facultyId}`);
        }
        if (schedule.courseId && !courseIds.has(schedule.courseId)) {
          issues.push(`Schedule ${schedule.id} references non-existent course ${schedule.courseId}`);
        }
        if (schedule.roomId && !roomIds.has(schedule.roomId)) {
          issues.push(`Schedule ${schedule.id} references non-existent room ${schedule.roomId}`);
        }
      }

      return {
        isValid: issues.length === 0,
        issues,
        stats: {
          schedules: schedules.length,
          faculty: faculty.length,
          courses: courses.length,
          rooms: rooms.length
        }
      };

    } catch (error) {
      return {
        isValid: false,
        issues: [`Validation error: ${error.message}`],
        stats: {}
      };
    }
  }
};

// Lookup map generators
export const lookupUtils = {
  async generateLookupMaps() {
    try {
      const [faculty, staff, courses, rooms] = await Promise.all([
        dbUtils.readAll(COLLECTIONS.FACULTY),
        dbUtils.readAll(COLLECTIONS.STAFF),
        dbUtils.readAll(COLLECTIONS.COURSES),
        dbUtils.readAll(COLLECTIONS.ROOMS)
      ]);

      return {
        faculty: Object.fromEntries(faculty.map(f => [f.id, f])),
        staff: Object.fromEntries(staff.map(s => [s.id, s])),
        courses: Object.fromEntries(courses.map(c => [c.id, c])),
        rooms: Object.fromEntries(rooms.map(r => [r.id, r]))
      };
    } catch (error) {
      console.error('Error generating lookup maps:', error);
      return { faculty: {}, staff: {}, courses: {}, rooms: {} };
    }
  }
};

// Export commonly used functions directly
export {
  facultyUtils as Faculty,
  staffUtils as Staff,
  courseUtils as Course,
  roomUtils as Room,
  scheduleUtils as Schedule,
  historyUtils as History,
  migrationUtils as Migration,
  lookupUtils as Lookup
};