import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, writeBatch } from 'firebase/firestore';

/**
 * Utility to backfill CRN data for existing schedule records
 * This helps maintain data consistency when CRN field was added later
 */

/**
 * Extract potential CRN from course code patterns
 * Some institutions include CRN-like numbers in course codes
 */
const extractPotentialCRN = (courseCode, section) => {
  // If courseCode contains numbers that could be CRN (5-6 digits)
  const crnPattern = /\b(\d{5,6})\b/;
  const match = courseCode?.match(crnPattern);
  if (match) {
    return match[1];
  }
  
  // Generate a placeholder CRN based on course code and section
  // This is for records where CRN is completely missing
  if (courseCode && section) {
    const courseHash = courseCode.replace(/[^A-Z0-9]/g, '');
    const sectionHash = section.replace(/[^A-Z0-9]/g, '');
    // Create a consistent 5-digit number based on course and section
    const combined = courseHash + sectionHash;
    const hash = combined.split('').reduce((acc, char) => {
      return acc + char.charCodeAt(0);
    }, 0);
    return String(hash % 90000 + 10000); // Ensure 5-digit number
  }
  
  return null;
};

/**
 * Analyze existing schedule data for CRN coverage
 */
export const analyzeCRNCoverage = async () => {
  try {
    const schedulesSnapshot = await getDocs(collection(db, 'schedules'));
    const schedules = schedulesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const analysis = {
      total: schedules.length,
      withCRN: 0,
      missingCRN: 0,
      emptyCRN: 0,
      uniqueCRNs: new Set(),
      duplicateCRNs: [],
      recordsNeedingCRN: []
    };

    // Track CRN occurrences for duplicate detection
    const crnCounts = {};

    schedules.forEach(schedule => {
      if (schedule.crn && schedule.crn.trim() !== '') {
        analysis.withCRN++;
        const trimmedCRN = schedule.crn.trim();
        analysis.uniqueCRNs.add(trimmedCRN);
        
        // Track for duplicates
        if (!crnCounts[trimmedCRN]) {
          crnCounts[trimmedCRN] = [];
        }
        crnCounts[trimmedCRN].push(schedule);
      } else if (schedule.crn === '') {
        analysis.emptyCRN++;
        analysis.recordsNeedingCRN.push(schedule);
      } else {
        analysis.missingCRN++;
        analysis.recordsNeedingCRN.push(schedule);
      }
    });

    // Find duplicates
    Object.entries(crnCounts).forEach(([crn, records]) => {
      if (records.length > 1) {
        analysis.duplicateCRNs.push({
          crn,
          count: records.length,
          records: records.map(r => ({
            id: r.id,
            courseCode: r.courseCode,
            section: r.section,
            term: r.term
          }))
        });
      }
    });

    return {
      ...analysis,
      uniqueCRNs: Array.from(analysis.uniqueCRNs),
      coveragePercentage: Math.round((analysis.withCRN / analysis.total) * 100)
    };
  } catch (error) {
    console.error('Error analyzing CRN coverage:', error);
    throw error;
  }
};

/**
 * Backfill CRN data for records missing it
 */
export const backfillCRNData = async (csvData = null, dryRun = false) => {
  try {
    const results = {
      processed: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      changes: []
    };

    // Get existing schedules
    const schedulesSnapshot = await getDocs(collection(db, 'schedules'));
    const existingSchedules = schedulesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Create a map of CSV data for CRN lookup if provided
    let csvCRNMap = null;
    if (csvData && Array.isArray(csvData)) {
      csvCRNMap = new Map();
      csvData.forEach(row => {
        const key = `${row.Course || ''}_${row['Section #'] || ''}_${row.Term || ''}`.toLowerCase();
        if (row.CRN) {
          csvCRNMap.set(key, row.CRN);
        }
      });
    }

    // Process schedules that need CRN
    const batch = writeBatch(db);
    let batchCount = 0;

    for (const schedule of existingSchedules) {
      results.processed++;

      // Skip if CRN already exists
      if (schedule.crn && schedule.crn.trim() !== '') {
        results.skipped++;
        continue;
      }

      let newCRN = null;

      // Method 1: Try to find CRN from CSV data
      if (csvCRNMap) {
        const lookupKey = `${schedule.courseCode || ''}_${schedule.section || ''}_${schedule.term || ''}`.toLowerCase();
        newCRN = csvCRNMap.get(lookupKey);
      }

      // Method 2: Extract potential CRN from existing data
      if (!newCRN) {
        newCRN = extractPotentialCRN(schedule.courseCode, schedule.section);
      }

      if (newCRN) {
        const change = {
          id: schedule.id,
          courseCode: schedule.courseCode,
          section: schedule.section,
          term: schedule.term,
          oldCRN: schedule.crn || 'MISSING',
          newCRN: newCRN
        };

        results.changes.push(change);

        if (!dryRun) {
          try {
            const scheduleRef = doc(db, 'schedules', schedule.id);
            batch.update(scheduleRef, {
              crn: newCRN,
              updatedAt: new Date().toISOString()
            });

            batchCount++;
            results.updated++;

            // Commit batch every 500 operations to avoid limits
            if (batchCount >= 500) {
              await batch.commit();
              batchCount = 0;
            }
          } catch (error) {
            results.errors.push(`Failed to update schedule ${schedule.id}: ${error.message}`);
          }
        } else {
          results.updated++;
        }
      }
    }

    // Commit remaining batch operations
    if (!dryRun && batchCount > 0) {
      await batch.commit();
    }

    return results;
  } catch (error) {
    console.error('Error during CRN backfill:', error);
    throw error;
  }
};

/**
 * Re-import CRN data from original CSV files
 * This is the most accurate method if you have the original import files
 */
export const reimportCRNFromCSV = async (csvData, selectedTerm = null) => {
  try {
    const results = {
      processed: 0,
      matched: 0,
      updated: 0,
      notFound: 0,
      errors: []
    };

    // Get existing schedules
    const schedulesSnapshot = await getDocs(collection(db, 'schedules'));
    const existingSchedules = schedulesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Filter schedules by term if specified
    const targetSchedules = selectedTerm 
      ? existingSchedules.filter(s => s.term === selectedTerm)
      : existingSchedules;

    const batch = writeBatch(db);
    let batchCount = 0;

    for (const schedule of targetSchedules) {
      results.processed++;

      // Find matching CSV row
      const matchingRow = csvData.find(row => {
        const csvCourse = (row.Course || '').trim();
        const csvSection = (row['Section #'] || '').trim();
        const csvTerm = (row.Term || '').trim();
        
        return csvCourse === schedule.courseCode &&
               csvSection === schedule.section &&
               csvTerm === schedule.term;
      });

      if (matchingRow && matchingRow.CRN) {
        results.matched++;
        
        // Update only if CRN is different or missing
        if (schedule.crn !== matchingRow.CRN) {
          try {
            const scheduleRef = doc(db, 'schedules', schedule.id);
            batch.update(scheduleRef, {
              crn: matchingRow.CRN,
              updatedAt: new Date().toISOString()
            });

            batchCount++;
            results.updated++;

            // Commit batch every 500 operations
            if (batchCount >= 500) {
              await batch.commit();
              batchCount = 0;
            }
          } catch (error) {
            results.errors.push(`Failed to update schedule ${schedule.id}: ${error.message}`);
          }
        }
      } else {
        results.notFound++;
      }
    }

    // Commit remaining operations
    if (batchCount > 0) {
      await batch.commit();
    }

    return results;
  } catch (error) {
    console.error('Error during CRN re-import:', error);
    throw error;
  }
}; 