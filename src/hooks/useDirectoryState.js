import { useState, useCallback } from 'react';

/**
 * Shared state management hook for directory components.
 * Encapsulates common state patterns used across Faculty, Staff, Adjunct, and Student directories.
 * 
 * @param {Object} options Configuration options
 * @param {Object} options.defaultSort Default sort configuration { key: string, direction: 'ascending'|'descending' }
 * @param {Object} options.defaultFilters Default filter state object
 * @param {Function} options.createEmptyRecord Function returning an empty record for creation mode
 * @returns {Object} State values and setters
 */
export function useDirectoryState({
    defaultSort = { key: 'name', direction: 'ascending' },
    defaultFilters = {},
    createEmptyRecord = () => ({})
} = {}) {
    // Edit state
    const [editingId, setEditingId] = useState(null);
    const [editFormData, setEditFormData] = useState({});
    const [errors, setErrors] = useState({});

    // Create state
    const [isCreating, setIsCreating] = useState(false);
    const [newRecord, setNewRecord] = useState(createEmptyRecord);

    // Filter state
    const [filterText, setFilterText] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState(defaultFilters);

    // Sort state
    const [sortConfig, setSortConfig] = useState(defaultSort);
    const [nameSort, setNameSort] = useState('firstName');

    // Delete confirmation state
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [recordToDelete, setRecordToDelete] = useState(null);

    // Change history (for undo)
    const [changeHistory, setChangeHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);

    // Selected record for contact card
    const [selectedRecord, setSelectedRecord] = useState(null);

    // Reset functions
    const resetEditState = useCallback(() => {
        setEditingId(null);
        setEditFormData({});
        setErrors({});
    }, []);

    const resetCreateState = useCallback(() => {
        setIsCreating(false);
        setNewRecord(createEmptyRecord());
        setErrors({});
    }, [createEmptyRecord]);

    const resetFilters = useCallback(() => {
        setFilters(defaultFilters);
        setFilterText('');
    }, [defaultFilters]);

    return {
        // Edit state
        editingId,
        setEditingId,
        editFormData,
        setEditFormData,
        errors,
        setErrors,

        // Create state
        isCreating,
        setIsCreating,
        newRecord,
        setNewRecord,

        // Filter state
        filterText,
        setFilterText,
        showFilters,
        setShowFilters,
        filters,
        setFilters,

        // Sort state
        sortConfig,
        setSortConfig,
        nameSort,
        setNameSort,

        // Delete state
        showDeleteConfirm,
        setShowDeleteConfirm,
        recordToDelete,
        setRecordToDelete,

        // History state
        changeHistory,
        setChangeHistory,
        showHistory,
        setShowHistory,

        // Selected record
        selectedRecord,
        setSelectedRecord,

        // Reset functions
        resetEditState,
        resetCreateState,
        resetFilters
    };
}

export default useDirectoryState;
