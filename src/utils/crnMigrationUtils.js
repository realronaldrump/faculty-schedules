import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
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
