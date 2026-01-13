import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, writeBatch, query, where } from 'firebase/firestore';
import { normalizeTermLabel, termCodeFromLabel } from './termUtils';

const chunkItems = (items, size = 10) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const fetchSchedulesByTermFilter = async ({ terms = [], termCodes = [] } = {}) => {
  const normalizedTerms = Array.isArray(terms)
    ? terms.map((term) => normalizeTermLabel(term)).filter(Boolean)
    : [];
  const normalizedTermCodes = Array.isArray(termCodes)
    ? termCodes.map((code) => termCodeFromLabel(code)).filter(Boolean)
    : [];

  if (normalizedTerms.length === 0 && normalizedTermCodes.length === 0) {
    const schedulesSnapshot = await getDocs(collection(db, 'schedules'));
    return schedulesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  }

  const schedules = [];
  const seenIds = new Set();
  const queries = normalizedTermCodes.length > 0
    ? chunkItems(normalizedTermCodes).map((chunk) =>
      query(collection(db, 'schedules'), where('termCode', 'in', chunk))
    )
    : chunkItems(normalizedTerms).map((chunk) =>
      query(collection(db, 'schedules'), where('term', 'in', chunk))
    );

  for (const q of queries) {
    const snapshot = await getDocs(q);
    snapshot.docs.forEach((docSnap) => {
      if (!seenIds.has(docSnap.id)) {
        seenIds.add(docSnap.id);
        schedules.push({ id: docSnap.id, ...docSnap.data() });
      }
    });
  }

  return schedules;
};

/**
 * Utility to backfill CRN data for existing schedule records
 * IMPORTANT: We never generate placeholder CRNs. Only real CRNs from trusted
 * sources (e.g., CSV re-import) should be written. This avoids false duplicate
 * detection across unrelated schedules.
 */

/**
 * Extract CRN if explicitly present in a string (rare). We do NOT fabricate
 * CRNs. If not found, return null.
 */
const extractPotentialCRN = (courseCode) => {
  const crnPattern = /\b(\d{5,6})\b/;
  const match = courseCode?.match(crnPattern);
  return match ? match[1] : null;
};

/**
 * Analyze existing schedule data for CRN coverage
 */
export const analyzeCRNCoverage = async ({ terms = [], termCodes = [] } = {}) => {
  try {
    const schedules = await fetchSchedulesByTermFilter({ terms, termCodes });

    const analysis = {
      total: schedules.length,
      withCRN: 0,
      missingCRN: 0,
      emptyCRN: 0,
      uniqueCRNs: new Set(),
      duplicateCRNs: [],
      recordsNeedingCRN: []
    };

    // Track CRN occurrences for duplicate detection scoped by term
    const crnTermCounts = {};

    schedules.forEach(schedule => {
      if (schedule.crn && schedule.crn.trim() !== '') {
        analysis.withCRN++;
        const trimmedCRN = schedule.crn.trim();
        analysis.uniqueCRNs.add(trimmedCRN);

        // Track for duplicates within the same term
        const termKey = (schedule.term || '').toString();
        const key = `${trimmedCRN}__${termKey}`;
        if (!crnTermCounts[key]) {
          crnTermCounts[key] = [];
        }
        crnTermCounts[key].push(schedule);
      } else if (schedule.crn === '') {
        analysis.emptyCRN++;
        analysis.recordsNeedingCRN.push(schedule);
      } else {
        analysis.missingCRN++;
        analysis.recordsNeedingCRN.push(schedule);
      }
    });

    // Find duplicates by CRN within the same term only
    Object.entries(crnTermCounts).forEach(([key, records]) => {
      if (records.length > 1) {
        const [crn, term] = key.split('__');
        analysis.duplicateCRNs.push({
          crn,
          term,
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
export const backfillCRNData = async (csvData = null, dryRun = false, { terms = [], termCodes = [] } = {}) => {
  try {
    const results = {
      processed: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      changes: []
    };

    // Get existing schedules
    const existingSchedules = await fetchSchedulesByTermFilter({ terms, termCodes });

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

      // Method 1: Try to find CRN from provided CSV data (authoritative source)
      if (csvCRNMap) {
        const lookupKey = `${schedule.courseCode || ''}_${schedule.section || ''}_${schedule.term || ''}`.toLowerCase();
        newCRN = csvCRNMap.get(lookupKey);
      }

      // Method 2 (optional, conservative): extract only if an obvious 5–6 digit CRN
      // is embedded in courseCode text. We do NOT generate placeholders.
      if (!newCRN) {
        newCRN = extractPotentialCRN(schedule.courseCode);
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
