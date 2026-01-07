import { useState, useEffect, useCallback } from 'react';
import {
    collection,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp,
    query,
    orderBy
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook to manage email list presets stored in Firestore.
 * Presets are universal (shared across all users).
 */
export const useEmailListPresets = () => {
    const [presets, setPresets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { user } = useAuth();

    // Subscribe to presets collection
    useEffect(() => {
        setLoading(true);
        const presetsRef = collection(db, COLLECTIONS.EMAIL_LIST_PRESETS);
        const q = query(presetsRef, orderBy('name', 'asc'));

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const loadedPresets = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setPresets(loadedPresets);
                setLoading(false);
                setError(null);
            },
            (err) => {
                console.error('Error loading email list presets:', err);
                setError(err.message);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    /**
     * Create a new preset with the given name and person IDs
     * @param {string} name - Display name for the preset
     * @param {string[]} personIds - Array of person IDs to include in the preset
     * @returns {Promise<string>} - The ID of the created preset
     */
    const createPreset = useCallback(async (name, personIds) => {
        if (!name || !name.trim()) {
            throw new Error('Preset name is required');
        }
        if (!personIds || personIds.length === 0) {
            throw new Error('At least one person must be selected');
        }

        const presetsRef = collection(db, COLLECTIONS.EMAIL_LIST_PRESETS);
        const newPreset = {
            name: name.trim(),
            personIds: personIds,
            createdBy: user?.email || 'unknown',
            createdAt: serverTimestamp(),
            updatedBy: user?.email || 'unknown',
            updatedAt: serverTimestamp()
        };

        const docRef = await addDoc(presetsRef, newPreset);
        return docRef.id;
    }, [user]);

    /**
     * Update an existing preset
     * @param {string} presetId - ID of the preset to update
     * @param {string} name - New display name
     * @param {string[]} personIds - New array of person IDs
     */
    const updatePreset = useCallback(async (presetId, name, personIds) => {
        if (!presetId) {
            throw new Error('Preset ID is required');
        }
        if (!name || !name.trim()) {
            throw new Error('Preset name is required');
        }
        if (!personIds || personIds.length === 0) {
            throw new Error('At least one person must be selected');
        }

        const presetRef = doc(db, COLLECTIONS.EMAIL_LIST_PRESETS, presetId);
        await updateDoc(presetRef, {
            name: name.trim(),
            personIds: personIds,
            updatedBy: user?.email || 'unknown',
            updatedAt: serverTimestamp()
        });
    }, [user]);

    /**
     * Delete a preset (caller should verify admin permissions)
     * @param {string} presetId - ID of the preset to delete
     */
    const deletePreset = useCallback(async (presetId) => {
        if (!presetId) {
            throw new Error('Preset ID is required');
        }

        const presetRef = doc(db, COLLECTIONS.EMAIL_LIST_PRESETS, presetId);
        await deleteDoc(presetRef);
    }, []);

    return {
        presets,
        loading,
        error,
        createPreset,
        updatePreset,
        deletePreset
    };
};

export default useEmailListPresets;
