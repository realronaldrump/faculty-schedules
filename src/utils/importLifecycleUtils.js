/**
 * Import Lifecycle Utils
 *
 * Comprehensive functions for managing the lifecycle of imports,
 * including semester deletion with proper cleanup of orphaned entities.
 */

import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  writeBatch,
  query,
  where,
  updateDoc,
  orderBy
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';
import { logBulkUpdate, logDelete } from './changeLogger';

/**
 * Delete all data associated with a semester import
 *
 * @param {string} termCode - The term code to delete (e.g., "202610")
 * @param {Object} options
 * @param {boolean} options.cleanupOrphanedRooms - Remove rooms only used by this semester (default: true)
 * @param {boolean} options.cleanupOrphanedPeople - Remove people only associated with this semester (default: false)
 * @param {boolean} options.deleteTransactions - Mark related import transactions as deleted (default: true)
 * @param {boolean} options.dryRun - Preview what would be deleted without actually deleting (default: false)
 * @returns {Object} Report of what was/would be deleted
 */
export const deleteSemesterImport = async (termCode, options = {}) => {
  const {
    cleanupOrphanedRooms = true,
    cleanupOrphanedPeople = false, // Always false by default - preserve faculty records
    deleteTransactions = true,
    dryRun = false
  } = options;

  if (!termCode) {
    throw new Error('termCode is required');
  }

  const report = {
    termCode,
    dryRun,
    schedulesDeleted: 0,
    schedulesToDelete: [],
    roomsCleaned: 0,
    roomsToClean: [],
    peopleCleaned: 0,
    peopleToClean: [],
    transactionsMarked: 0,
    transactionsToMark: [],
    termDocDeleted: false,
    errors: []
  };

  try {
    // 1. Find all schedules for this term
    const schedulesQuery = query(
      collection(db, COLLECTIONS.SCHEDULES),
      where('termCode', '==', termCode)
    );
    const schedulesSnapshot = await getDocs(schedulesQuery);

    const schedules = schedulesSnapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    report.schedulesToDelete = schedules.map(s => ({
      id: s.id,
      courseCode: s.courseCode,
      section: s.section
    }));
    report.schedulesDeleted = schedules.length;

    // 2. Collect spaceIds and instructorIds used by these schedules
    const usedSpaceIds = new Set();
    const usedPersonIds = new Set();

    schedules.forEach(schedule => {
      (schedule.spaceIds || []).forEach(id => usedSpaceIds.add(id));
      (schedule.instructorIds || []).forEach(id => usedPersonIds.add(id));
      if (schedule.instructorId) {
        usedPersonIds.add(schedule.instructorId);
      }
    });

    // 3. Find orphaned rooms (rooms only used by this semester)
    if (cleanupOrphanedRooms && usedSpaceIds.size > 0) {
      const orphanedRooms = await findOrphanedRooms(usedSpaceIds, termCode);
      report.roomsToClean = orphanedRooms.map(r => ({
        id: r.id,
        spaceKey: r.spaceKey,
        displayName: r.displayName
      }));
      report.roomsCleaned = orphanedRooms.length;
    }

    // 4. Find orphaned people (optional, conservative)
    if (cleanupOrphanedPeople && usedPersonIds.size > 0) {
      const orphanedPeople = await findOrphanedPeople(usedPersonIds, termCode);
      report.peopleToClean = orphanedPeople.map(p => ({
        id: p.id,
        name: `${p.firstName || ''} ${p.lastName || ''}`.trim()
      }));
      report.peopleCleaned = orphanedPeople.length;
    }

    // 5. Find related import transactions
    if (deleteTransactions) {
      const transactions = await findTransactionsForSemester(termCode);
      report.transactionsToMark = transactions.map(t => ({
        id: t.id,
        type: t.type,
        timestamp: t.timestamp
      }));
      report.transactionsMarked = transactions.length;
    }

    // 6. Check if term document exists
    const termRef = doc(db, COLLECTIONS.TERMS, termCode);
    try {
      const termDoc = await getDocs(query(
        collection(db, COLLECTIONS.TERMS),
        where('termCode', '==', termCode)
      ));
      report.termDocDeleted = termDoc.docs.length > 0;
    } catch {
      // Term document check failed, but we can continue
    }

    // 7. Execute deletion (unless dryRun)
    if (!dryRun) {
      await executeDeleteSemester(report);
    }

    return report;
  } catch (error) {
    console.error('Error in deleteSemesterImport:', error);
    report.errors.push({
      phase: 'general',
      message: error.message
    });
    throw error;
  }
};

/**
 * Find rooms not referenced by any other semester
 *
 * @param {Set<string>} usedSpaceIds - Space IDs used by the semester being deleted
 * @param {string} excludeTermCode - The term code being deleted
 * @returns {Array} List of orphaned room records
 */
const findOrphanedRooms = async (usedSpaceIds, excludeTermCode) => {
  if (!usedSpaceIds || usedSpaceIds.size === 0) {
    return [];
  }

  const spaceIdArray = Array.from(usedSpaceIds);
  const orphanedRooms = [];

  // Get all schedules NOT in this term that reference these rooms
  // We need to check each spaceId against all other schedules
  const otherSchedulesQuery = query(
    collection(db, COLLECTIONS.SCHEDULES),
    where('termCode', '!=', excludeTermCode),
    orderBy('termCode')
  );

  const otherSchedulesSnapshot = await getDocs(otherSchedulesQuery);
  const referencedByOtherTerms = new Set();

  otherSchedulesSnapshot.docs.forEach(docSnap => {
    const schedule = docSnap.data();
    (schedule.spaceIds || []).forEach(id => referencedByOtherTerms.add(id));
  });

  // Also check if rooms are used as offices by people
  const peopleSnapshot = await getDocs(collection(db, COLLECTIONS.PEOPLE));
  const usedAsOffices = new Set();

  peopleSnapshot.docs.forEach(docSnap => {
    const person = docSnap.data();
    if (person.officeSpaceId) {
      usedAsOffices.add(person.officeSpaceId);
    }
    (person.officeSpaceIds || []).forEach(id => usedAsOffices.add(id));
  });

  // Find rooms that are:
  // - Used by the semester being deleted
  // - NOT referenced by any other semester
  // - NOT used as an office
  for (const spaceId of spaceIdArray) {
    if (!referencedByOtherTerms.has(spaceId) && !usedAsOffices.has(spaceId)) {
      // This room is orphaned - get its data
      try {
        const roomsQuery = query(
          collection(db, COLLECTIONS.ROOMS),
          where('spaceKey', '==', spaceId)
        );
        const roomSnapshot = await getDocs(roomsQuery);

        if (!roomSnapshot.empty) {
          roomSnapshot.docs.forEach(docSnap => {
            orphanedRooms.push({
              id: docSnap.id,
              ...docSnap.data()
            });
          });
        }
      } catch (err) {
        console.warn(`Could not check room ${spaceId}:`, err.message);
      }
    }
  }

  return orphanedRooms;
};

/**
 * Find people not referenced by any other semester
 * This is conservative - only returns people with no references outside this term
 *
 * @param {Set<string>} usedPersonIds - Person IDs used by the semester being deleted
 * @param {string} excludeTermCode - The term code being deleted
 * @returns {Array} List of orphaned person records
 */
const findOrphanedPeople = async (usedPersonIds, excludeTermCode) => {
  if (!usedPersonIds || usedPersonIds.size === 0) {
    return [];
  }

  const personIdArray = Array.from(usedPersonIds);
  const orphanedPeople = [];

  // Get all schedules NOT in this term
  const otherSchedulesQuery = query(
    collection(db, COLLECTIONS.SCHEDULES),
    where('termCode', '!=', excludeTermCode),
    orderBy('termCode')
  );

  const otherSchedulesSnapshot = await getDocs(otherSchedulesQuery);
  const referencedByOtherTerms = new Set();

  otherSchedulesSnapshot.docs.forEach(docSnap => {
    const schedule = docSnap.data();
    if (schedule.instructorId) {
      referencedByOtherTerms.add(schedule.instructorId);
    }
    (schedule.instructorIds || []).forEach(id => referencedByOtherTerms.add(id));
  });

  // Find people that are:
  // - Used by the semester being deleted
  // - NOT referenced by any other semester
  for (const personId of personIdArray) {
    if (!referencedByOtherTerms.has(personId)) {
      // This person might be orphaned - get their data and check for other references
      try {
        const personDoc = doc(db, COLLECTIONS.PEOPLE, personId);
        const personSnapshot = await getDocs(query(
          collection(db, COLLECTIONS.PEOPLE),
          where('__name__', '==', personId)
        ));

        if (!personSnapshot.empty) {
          const personData = personSnapshot.docs[0].data();

          // Additional safety checks - don't delete people with:
          // - Active status
          // - Job titles suggesting permanent roles
          // - Office assignments
          const hasOffice = personData.officeSpaceId || (personData.officeSpaceIds?.length > 0);
          const hasPermanentRole = personData.isTenured || personData.isFullTime;

          if (!hasOffice && !hasPermanentRole) {
            orphanedPeople.push({
              id: personSnapshot.docs[0].id,
              ...personData
            });
          }
        }
      } catch (err) {
        console.warn(`Could not check person ${personId}:`, err.message);
      }
    }
  }

  return orphanedPeople;
};

/**
 * Find import transactions for a semester
 *
 * @param {string} termCode - The term code
 * @returns {Array} List of transaction records
 */
const findTransactionsForSemester = async (termCode) => {
  const transactions = [];

  try {
    // Query importTransactions collection
    const transactionsQuery = query(
      collection(db, 'importTransactions'),
      where('semester', '==', termCode)
    );

    const snapshot = await getDocs(transactionsQuery);
    snapshot.docs.forEach(docSnap => {
      transactions.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    // Also try by term label variations
    const termLabelsToCheck = [
      termCode,
      // Could add term label conversions here if needed
    ];

    for (const label of termLabelsToCheck) {
      if (label === termCode) continue;
      const labelQuery = query(
        collection(db, 'importTransactions'),
        where('semester', '==', label)
      );
      const labelSnapshot = await getDocs(labelQuery);
      labelSnapshot.docs.forEach(docSnap => {
        if (!transactions.find(t => t.id === docSnap.id)) {
          transactions.push({
            id: docSnap.id,
            ...docSnap.data()
          });
        }
      });
    }
  } catch (err) {
    console.warn('Could not fetch import transactions:', err.message);
  }

  return transactions;
};

/**
 * Execute the actual deletion based on the report
 */
const executeDeleteSemester = async (report) => {
  const { termCode, schedulesToDelete, roomsToClean, peopleToClean, transactionsToMark } = report;

  // Use batch operations for efficiency
  // Firestore batches are limited to 500 operations
  const BATCH_SIZE = 450;

  // Helper to execute a batch of deletes
  const executeBatch = async (items, collectionName, getRef) => {
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = items.slice(i, i + BATCH_SIZE);

      for (const item of chunk) {
        const ref = getRef(item);
        batch.delete(ref);
      }

      await batch.commit();
    }
  };

  try {
    // 1. Delete schedules
    if (schedulesToDelete.length > 0) {
      await executeBatch(
        schedulesToDelete,
        COLLECTIONS.SCHEDULES,
        (item) => doc(db, COLLECTIONS.SCHEDULES, item.id)
      );

      await logBulkUpdate(
        `Deleted ${schedulesToDelete.length} schedules for semester ${termCode}`,
        COLLECTIONS.SCHEDULES,
        schedulesToDelete.length,
        'importLifecycleUtils.deleteSemesterImport',
        { action: 'delete_semester_schedules', termCode }
      );
    }

    // 2. Delete orphaned rooms
    if (roomsToClean.length > 0) {
      await executeBatch(
        roomsToClean,
        COLLECTIONS.ROOMS,
        (item) => doc(db, COLLECTIONS.ROOMS, item.id)
      );

      await logBulkUpdate(
        `Cleaned up ${roomsToClean.length} orphaned rooms for semester ${termCode}`,
        COLLECTIONS.ROOMS,
        roomsToClean.length,
        'importLifecycleUtils.deleteSemesterImport',
        { action: 'cleanup_orphaned_rooms', termCode }
      );
    }

    // 3. Delete orphaned people (if enabled and found)
    if (peopleToClean.length > 0) {
      await executeBatch(
        peopleToClean,
        COLLECTIONS.PEOPLE,
        (item) => doc(db, COLLECTIONS.PEOPLE, item.id)
      );

      await logBulkUpdate(
        `Cleaned up ${peopleToClean.length} orphaned people for semester ${termCode}`,
        COLLECTIONS.PEOPLE,
        peopleToClean.length,
        'importLifecycleUtils.deleteSemesterImport',
        { action: 'cleanup_orphaned_people', termCode }
      );
    }

    // 4. Mark transactions as deleted
    if (transactionsToMark.length > 0) {
      for (const transaction of transactionsToMark) {
        try {
          await updateDoc(doc(db, 'importTransactions', transaction.id), {
            status: 'semester_deleted',
            deletedAt: new Date().toISOString(),
            deletedTermCode: termCode
          });
        } catch (err) {
          console.warn(`Could not update transaction ${transaction.id}:`, err.message);
        }
      }
    }

    // 5. Delete term document
    if (report.termDocDeleted) {
      try {
        await deleteDoc(doc(db, COLLECTIONS.TERMS, termCode));

        await logDelete(
          `Deleted semester ${termCode}`,
          COLLECTIONS.TERMS,
          termCode,
          { termCode },
          'importLifecycleUtils.deleteSemesterImport'
        );
      } catch (err) {
        console.warn(`Could not delete term document ${termCode}:`, err.message);
      }
    }

    return true;
  } catch (error) {
    console.error('Error executing semester deletion:', error);
    report.errors.push({
      phase: 'execution',
      message: error.message
    });
    throw error;
  }
};

/**
 * Preview what would be deleted without actually deleting
 * Convenience wrapper for deleteSemesterImport with dryRun=true
 *
 * @param {string} termCode - The term code to preview deletion for
 * @param {Object} options - Same options as deleteSemesterImport (dryRun is forced true)
 * @returns {Object} Report of what would be deleted
 */
export const previewSemesterDeletion = async (termCode, options = {}) => {
  return deleteSemesterImport(termCode, { ...options, dryRun: true });
};

/**
 * Get summary of semester data for deletion confirmation UI
 *
 * @param {string} termCode - The term code
 * @returns {Object} Summary of data for this semester
 */
export const getSemesterDeletionSummary = async (termCode) => {
  if (!termCode) {
    return { error: 'termCode is required' };
  }

  const summary = {
    termCode,
    scheduleCount: 0,
    instructorCount: 0,
    roomCount: 0,
    uniqueInstructors: [],
    uniqueRooms: []
  };

  try {
    const schedulesQuery = query(
      collection(db, COLLECTIONS.SCHEDULES),
      where('termCode', '==', termCode)
    );
    const schedulesSnapshot = await getDocs(schedulesQuery);

    summary.scheduleCount = schedulesSnapshot.docs.length;

    const instructorIds = new Set();
    const spaceIds = new Set();

    schedulesSnapshot.docs.forEach(docSnap => {
      const schedule = docSnap.data();
      if (schedule.instructorId) instructorIds.add(schedule.instructorId);
      (schedule.instructorIds || []).forEach(id => instructorIds.add(id));
      (schedule.spaceIds || []).forEach(id => spaceIds.add(id));
    });

    summary.instructorCount = instructorIds.size;
    summary.roomCount = spaceIds.size;
    summary.uniqueInstructors = Array.from(instructorIds);
    summary.uniqueRooms = Array.from(spaceIds);

    return summary;
  } catch (error) {
    console.error('Error getting semester summary:', error);
    return { ...summary, error: error.message };
  }
};
