/**
 * ScheduleContext - Specialized context for Schedule data management
 * 
 * Responsibilities:
 * - Loading and caching schedules (per term)
 * - CRUD operations for schedules
 * - Managing available semesters
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { fetchSchedulesByTerm } from '../utils/dataImportUtils';
import { fetchTermOptions } from '../utils/termDataUtils';
import { normalizeTermLabel, parseTermDate } from '../utils/termUtils';

const ScheduleContext = createContext(null);

export const ScheduleProvider = ({ children }) => {
    const [rawScheduleData, setRawScheduleData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Semester state
    const [selectedSemester, setSelectedSemester] = useState(() => {
        return localStorage.getItem('selectedSemester') || '';
    });
    const [adminDefaultTerm, setAdminDefaultTerm] = useState('');
    const [includeArchived, setIncludeArchived] = useState(false);
    const [termOptions, setTermOptions] = useState([]);

    // Persist selected semester
    useEffect(() => {
        if (!selectedSemester) return;
        const normalized = normalizeTermLabel(selectedSemester);
        localStorage.setItem('selectedSemester', normalized || selectedSemester);
        if (normalized && normalized !== selectedSemester) {
            setSelectedSemester(normalized);
        }
    }, [selectedSemester]);

    // Load admin default term
    useEffect(() => {
        const loadDefault = async () => {
            try {
                const settingsRef = doc(db, 'settings', 'app');
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    const defaultTerm = settingsSnap.data()?.defaultTerm || '';
                    setAdminDefaultTerm(normalizeTermLabel(defaultTerm));
                }
            } catch (e) {
                console.error('Failed to load default term', e);
            }
        };
        loadDefault();
    }, []); // Run once on mount

    const refreshTerms = useCallback(async () => {
        try {
            const terms = await fetchTermOptions({ includeArchived: true });
            setTermOptions(terms);
            return terms;
        } catch (e) {
            console.error('Failed to load terms', e);
            setTermOptions([]);
            return [];
        }
    }, []);

    // Load terms on mount
    useEffect(() => {
        refreshTerms();
    }, [refreshTerms]);

    const visibleTerms = useMemo(() => {
        if (includeArchived) return termOptions;
        return termOptions.filter(term => term.status !== 'archived');
    }, [includeArchived, termOptions]);

    const activeTermByDate = useMemo(() => {
        if (!visibleTerms || visibleTerms.length === 0) return '';
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const matches = visibleTerms
            .map((term) => {
                const start = parseTermDate(term.startDate);
                const end = parseTermDate(term.endDate);
                if (!start || !end) return null;
                if (today < start || today > end) return null;
                return { term: term.term, start };
            })
            .filter(Boolean)
            .sort((a, b) => b.start - a.start);
        return matches[0]?.term || '';
    }, [visibleTerms]);

    const availableSemesters = useMemo(() => (
        visibleTerms.map(term => term.term).filter(Boolean)
    ), [visibleTerms]);

    const getTermByLabel = useCallback((label) => {
        if (!label) return null;
        const normalized = normalizeTermLabel(label) || label;
        return termOptions.find(term =>
            term.term === normalized || term.termCode === normalized
        ) || null;
    }, [termOptions]);

    const selectedTermMeta = useMemo(() => (
        getTermByLabel(selectedSemester)
    ), [getTermByLabel, selectedSemester]);

    const isSelectedTermLocked = useMemo(() => {
        if (!selectedTermMeta) return false;
        return selectedTermMeta.locked === true || selectedTermMeta.status === 'archived';
    }, [selectedTermMeta]);

    const isTermLocked = useCallback((label) => {
        const meta = getTermByLabel(label);
        return meta ? (meta.locked === true || meta.status === 'archived') : false;
    }, [getTermByLabel]);

    // Ensure selection stays valid when terms change
    useEffect(() => {
        if (availableSemesters.length === 0) return;
        const normalizedSelected = normalizeTermLabel(selectedSemester) || selectedSemester;
        if (normalizedSelected && availableSemesters.includes(normalizedSelected)) {
            if (normalizedSelected !== selectedSemester) {
                setSelectedSemester(normalizedSelected);
            }
            return;
        }
        const normalizedDefault = normalizeTermLabel(adminDefaultTerm);
        const fallback = normalizedDefault && availableSemesters.includes(normalizedDefault)
            ? normalizedDefault
            : (activeTermByDate && availableSemesters.includes(activeTermByDate)
                ? activeTermByDate
                : availableSemesters[0]);
        if (fallback && fallback !== selectedSemester) {
            setSelectedSemester(fallback);
        }
    }, [availableSemesters, activeTermByDate, adminDefaultTerm, selectedSemester]);
    // Load schedules when selectedSemester changes
    const loadSchedules = useCallback(async (termLabel) => {
        if (!termLabel) return;
        setLoading(true);
        setError(null);
        try {
            const termMeta = getTermByLabel(termLabel);
            console.log(`📅 Loading schedules for ${termLabel}...`);
            const { schedules } = await fetchSchedulesByTerm({
                term: termLabel,
                termCode: termMeta?.termCode || ''
            });
            setRawScheduleData(schedules);
            console.log(`✅ Loaded ${schedules.length} schedules.`);
        } catch (err) {
            console.error('❌ Error loading schedules:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [getTermByLabel]);

    useEffect(() => {
        if (selectedSemester) {
            loadSchedules(selectedSemester);
        }
    }, [selectedSemester, loadSchedules]);


    const value = useMemo(() => ({
        rawScheduleData,
        loading,
        error,
        selectedSemester,
        setSelectedSemester,
        availableSemesters,
        termOptions,
        includeArchived,
        setIncludeArchived,
        selectedTermMeta,
        isSelectedTermLocked,
        isTermLocked,
        getTermByLabel,
        refreshSchedules: () => loadSchedules(selectedSemester),
        refreshTerms
    }), [
        rawScheduleData,
        loading,
        error,
        selectedSemester,
        availableSemesters,
        termOptions,
        includeArchived,
        selectedTermMeta,
        isSelectedTermLocked,
        isTermLocked,
        getTermByLabel,
        loadSchedules,
        refreshTerms
    ]);

    return (
        <ScheduleContext.Provider value={value}>
            {children}
        </ScheduleContext.Provider>
    );
};

export const useSchedules = () => {
    const context = useContext(ScheduleContext);
    if (!context) throw new Error('useSchedules must be used within a ScheduleProvider');
    return context;
};

export default ScheduleContext;
