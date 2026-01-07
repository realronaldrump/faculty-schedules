/**
 * PeopleContext - Specialized context for Person/Directory data management
 * 
 * Responsibilities:
 * - Loading and caching people/directory data
 * - CRUD operations for people
 * - Adapting people data for different views (Faculty, Staff, etc.)
 */

import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { adaptPeopleToFaculty, adaptPeopleToStaff } from '../utils/dataAdapter';
import { logCreate, logUpdate, logDelete } from '../utils/changeLogger';

const PeopleContext = createContext(null);

export const PeopleProvider = ({ children }) => {
    const [rawPeople, setRawPeople] = useState([]);
    const [loading, setLoading] = useState(false); // Start false, load on demand
    const [error, setError] = useState(null);
    const [loaded, setLoaded] = useState(false);

    // Fetch all people (Directory Load)
    const loadPeople = useCallback(async ({ force = false } = {}) => {
        if (loaded && !force) return;

        setLoading(true);
        setError(null);
        try {
            console.log('👥 Loading People Directory...');
            const snapshot = await getDocs(collection(db, 'people'));
            const people = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRawPeople(people);
            setLoaded(true);
            console.log(`✅ Loaded ${people.length} people.`);
        } catch (err) {
            console.error('❌ Error loading people:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [loaded]);

    // CRUD Operations
    const addPerson = useCallback(async (personData) => {
        try {
            // Optimistic upate? Maybe later. For now standard async.
            const docRef = await addDoc(collection(db, 'people'), {
                ...personData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            const newPerson = { id: docRef.id, ...personData };
            setRawPeople(prev => [...prev, newPerson]);

            await logCreate(
                `Person - ${personData.firstName} ${personData.lastName}`,
                'people',
                docRef.id,
                personData,
                'PeopleContext'
            );
            return docRef.id;
        } catch (e) {
            console.error('Error adding person:', e);
            throw e;
        }
    }, []);

    const updatePerson = useCallback(async (id, updates) => {
        try {
            const personRef = doc(db, 'people', id);
            const payload = {
                ...updates,
                updatedAt: new Date().toISOString()
            };
            await updateDoc(personRef, payload);

            setRawPeople(prev => prev.map(p => p.id === id ? { ...p, ...payload } : p));

            // Log logic should ideally be here, but for brevity/perf we catch errors
            const currentPerson = rawPeople.find(p => p.id === id);
            logUpdate(
                `Person - ${currentPerson?.firstName || ''} ${currentPerson?.lastName || ''}`,
                'people',
                id,
                updates,
                currentPerson,
                'PeopleContext'
            ).catch(() => { });

        } catch (e) {
            console.error('Error updating person:', e);
            throw e;
        }
    }, [rawPeople]);

    const deletePerson = useCallback(async (id) => {
        try {
            await deleteDoc(doc(db, 'people', id));
            const currentPerson = rawPeople.find(p => p.id === id);
            setRawPeople(prev => prev.filter(p => p.id !== id));

            logDelete(
                `Person - ${currentPerson?.firstName || ''} ${currentPerson?.lastName || ''}`,
                'people',
                id,
                currentPerson,
                'PeopleContext'
            ).catch(() => { });
        } catch (e) {
            console.error('Error deleting person:', e);
            throw e;
        }
    }, [rawPeople]);

    // Derived Data Helpers
    const facultyData = useMemo(() => {
        // Note: adaptPeopleToFaculty traditionally took schedule/program data to calculate load.
        // For the pure "Directory" view, we might not have schedules yet.
        // This adapter might need to be resilient to missing schedule data if we are decoupling tightly.
        // For now, pass empty arrays if we don't have them in this context. 
        // Ideally, "Load" calculation happens in a "ReportingContext" or similar that consumes both.
        return adaptPeopleToFaculty(rawPeople, [], []);
    }, [rawPeople]);

    const staffData = useMemo(() => adaptPeopleToStaff(rawPeople, [], []), [rawPeople]);

    const studentData = useMemo(() => {
        // Re-implement student filter logic from DataContext
        return rawPeople.filter(person => {
            if (!person.roles) return false;
            if (Array.isArray(person.roles)) return person.roles.includes('student');
            if (typeof person.roles === 'object') return person.roles.student === true;
            return false;
        });
    }, [rawPeople]);

    const value = useMemo(() => ({
        people: rawPeople,
        loading,
        error,
        loaded,
        loadPeople,
        addPerson,
        updatePerson,
        deletePerson,
        facultyData,
        staffData,
        studentData
    }), [rawPeople, loading, error, loaded, loadPeople, addPerson, updatePerson, deletePerson, facultyData, staffData, studentData]);

    return (
        <PeopleContext.Provider value={value}>
            {children}
        </PeopleContext.Provider>
    );
};

export const usePeople = () => {
    const context = useContext(PeopleContext);
    if (!context) throw new Error('usePeople must be used within a PeopleProvider');
    return context;
};

export default PeopleContext;
