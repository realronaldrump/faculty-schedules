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
import { doc, updateDoc, addDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { fetchSchedulesByTerm, fetchAvailableSemesters } from '../utils/dataImportUtils';
import { logCreate, logUpdate, logDelete } from '../utils/changeLogger';
import { parseCourseCode } from '../utils/courseUtils';

const ScheduleContext = createContext(null);

// Helper to derive credits 
const deriveCreditsFromSchedule = (courseCode, credits) => {
    if (credits !== undefined && credits !== null && credits !== '') {
        const numericCredits = Number(credits);
        if (!Number.isNaN(numericCredits)) {
            return numericCredits;
        }
    }
    const parsed = parseCourseCode(courseCode || '');
    if (parsed && !parsed.error && parsed.credits !== undefined && parsed.credits !== null) {
        return parsed.credits;
    }
    return null;
};

export const ScheduleProvider = ({ children }) => {
    const [rawScheduleData, setRawScheduleData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Semester state
    const [selectedSemester, setSelectedSemester] = useState(() => {
        return localStorage.getItem('selectedSemester') || '';
    });
    const [availableSemesters, setAvailableSemesters] = useState([]);

    // Persist selected semester
    useEffect(() => {
        if (selectedSemester) {
            localStorage.setItem('selectedSemester', selectedSemester);
        }
    }, [selectedSemester]);

    // Load available semesters on mount
    useEffect(() => {
        const initSemesters = async () => {
            try {
                const list = await fetchAvailableSemesters();
                setAvailableSemesters(list);

                // If no selected semester, or invalid, try to pick default
                if (list.length > 0 && (!selectedSemester || !list.includes(selectedSemester))) {
                    // Try to get admin default
                    try {
                        const settingsRef = doc(db, 'settings', 'app');
                        const settingsSnap = await getDoc(settingsRef);
                        const adminDefault = settingsSnap.exists() ? settingsSnap.data()?.defaultTerm : null;

                        if (adminDefault && list.includes(adminDefault)) {
                            setSelectedSemester(adminDefault);
                        } else {
                            setSelectedSemester(list[0]);
                        }
                    } catch (e) {
                        setSelectedSemester(list[0]);
                    }
                }
            } catch (e) {
                console.error("Failed to load semesters", e);
            }
        };
        initSemesters();
    }, []); // Run once on mount

    // Load schedules when selectedSemester changes
    const loadSchedules = useCallback(async (term) => {
        if (!term) return;
        setLoading(true);
        setError(null);
        try {
            console.log(`📅 Loading schedules for ${term}...`);
            const { schedules } = await fetchSchedulesByTerm(term);
            setRawScheduleData(schedules);
            console.log(`✅ Loaded ${schedules.length} schedules.`);
        } catch (err) {
            console.error('❌ Error loading schedules:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (selectedSemester) {
            loadSchedules(selectedSemester);
        }
    }, [selectedSemester, loadSchedules]);


    // Computed schedule objects (flattened for UI)
    const scheduleData = useMemo(() => {
        if (!rawScheduleData || rawScheduleData.length === 0) return [];

        const flattened = [];
        rawScheduleData.forEach(schedule => {
            if (!schedule || !schedule.id) return;

            // Helper to create reliable display strings
            const getRoomDisplay = (s) => {
                if (s.isOnline) return 'Online';
                if (Array.isArray(s.roomNames)) return s.roomNames.join('; ');
                return s.roomName || '';
            };

            const commonProps = {
                Course: schedule.courseCode || '',
                'Course Title': schedule.courseTitle || '',
                Instructor: schedule.instructorName || '',
                // Note: In strict mode we'd resolve ID -> Name via PeopleContext,
                // but ScheduleContext shouldn't strictly depend on PeopleContext to avoid circularity if possible.
                // For now, backing on denormalized name or doing lookup at UI layer is safer.
                Section: schedule.section || '',
                Credits: deriveCreditsFromSchedule(schedule.courseCode, schedule.credits),
                Program: schedule.program || '',
                Term: schedule.term || '',
                Status: schedule.status || 'Active',
                ...schedule,
                _originalId: schedule.id
            };

            if (schedule.meetingPatterns && schedule.meetingPatterns.length > 0) {
                schedule.meetingPatterns.forEach((pattern, idx) => {
                    flattened.push({
                        ...commonProps,
                        id: `${schedule.id}-${idx}`,
                        Day: pattern.day,
                        'Start Time': pattern.startTime,
                        'End Time': pattern.endTime,
                        Room: getRoomDisplay(schedule)
                    });
                });
            } else {
                flattened.push({
                    ...commonProps,
                    id: schedule.id,
                    Room: getRoomDisplay(schedule)
                });
            }
        });
        return flattened;
    }, [rawScheduleData]);

    const value = useMemo(() => ({
        rawScheduleData,
        scheduleData,
        loading,
        error,
        selectedSemester,
        setSelectedSemester,
        availableSemesters,
        refreshSchedules: () => loadSchedules(selectedSemester)
    }), [rawScheduleData, scheduleData, loading, error, selectedSemester, availableSemesters, loadSchedules]);

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
