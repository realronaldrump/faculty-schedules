import { useCallback } from 'react';

/**
 * Shared handler logic for directory CRUD operations.
 * Provides common handlers used across Faculty, Staff, Adjunct, and Student directories.
 * 
 * @param {Object} options Configuration options
 * @param {Object} options.state State object from useDirectoryState
 * @param {Array} options.data Current data array
 * @param {Function} options.onUpdate Callback to save/update a record
 * @param {Function} options.onDelete Callback to delete a record
 * @param {Function} options.validate Validation function (data) => errors object
 * @param {Function} options.preparePayload Optional function to transform data before save
 * @param {Function} options.trackChange Optional function to track changes for undo
 * @returns {Object} Handler functions
 */
export function useDirectoryHandlers({
    state,
    data = [],
    onUpdate,
    onDelete,
    validate = () => ({}),
    preparePayload = (d) => d,
    trackChange
} = {}) {
    const {
        editingId,
        setEditingId,
        editFormData,
        setEditFormData,
        errors,
        setErrors,
        isCreating,
        setIsCreating,
        newRecord,
        setNewRecord,
        sortConfig,
        setSortConfig,
        showDeleteConfirm,
        setShowDeleteConfirm,
        recordToDelete,
        setRecordToDelete,
        changeHistory,
        setChangeHistory,
        resetEditState,
        resetCreateState,
        resetFilters
    } = state;

    // Edit handlers
    const handleEdit = useCallback((record) => {
        setErrors({});
        setEditingId(record.id);
        setEditFormData({ ...record });
    }, [setErrors, setEditingId, setEditFormData]);

    const handleCancel = useCallback(() => {
        resetEditState();
    }, [resetEditState]);

    const handleSave = useCallback(async () => {
        const validationErrors = validate(editFormData);
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            return false;
        }

        const originalData = data.find(r => r.id === editingId);
        const payload = preparePayload(editFormData);

        // Track change for undo if tracker provided
        if (trackChange && originalData) {
            trackChange(originalData, payload, 'update');
        }

        try {
            await onUpdate(payload, originalData);
            resetEditState();
            return true;
        } catch (error) {
            console.error('Error saving record:', error);
            setErrors({ general: 'Failed to save. Please try again.' });
            return false;
        }
    }, [editFormData, editingId, data, validate, preparePayload, onUpdate, resetEditState, setErrors, trackChange]);

    // Form change handler
    const handleChange = useCallback((e) => {
        const { name, value, type, checked } = e.target;
        let finalValue = type === 'checkbox' ? checked : value;

        // Phone number formatting
        if (name === 'phone') {
            finalValue = finalValue.replace(/\D/g, '');
        }

        // Baylor ID formatting (9 digits max)
        if (name === 'baylorId') {
            finalValue = finalValue.replace(/\D/g, '').slice(0, 9);
        }

        const newFormData = {
            ...editFormData,
            [name]: finalValue
        };

        setEditFormData(newFormData);

        // Live validation if errors exist
        if (Object.keys(errors).length > 0) {
            const newErrors = validate(newFormData);
            setErrors(newErrors);
        }
    }, [editFormData, setEditFormData, errors, validate, setErrors]);

    // Create handlers
    const handleCreate = useCallback(() => {
        setIsCreating(true);
        setErrors({});
    }, [setIsCreating, setErrors]);

    const handleCancelCreate = useCallback(() => {
        resetCreateState();
    }, [resetCreateState]);

    const handleCreateChange = useCallback((e) => {
        const { name, value, type, checked } = e.target;
        let finalValue = type === 'checkbox' ? checked : value;

        if (name === 'phone') {
            finalValue = finalValue.replace(/\D/g, '');
        }

        if (name === 'baylorId') {
            finalValue = finalValue.replace(/\D/g, '').slice(0, 9);
        }

        setNewRecord(prev => ({
            ...prev,
            [name]: finalValue
        }));

        if (Object.keys(errors).length > 0) {
            const newErrors = validate({ ...newRecord, [name]: finalValue });
            setErrors(newErrors);
        }
    }, [newRecord, setNewRecord, errors, validate, setErrors]);

    const handleCreateSave = useCallback(async () => {
        const validationErrors = validate(newRecord);
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            return false;
        }

        const payload = preparePayload(newRecord);

        // Track creation if tracker provided
        if (trackChange) {
            trackChange({}, payload, 'create');
        }

        try {
            await onUpdate(payload);
            resetCreateState();
            return true;
        } catch (error) {
            console.error('Error creating record:', error);
            setErrors({ general: 'Failed to create. Please try again.' });
            return false;
        }
    }, [newRecord, validate, preparePayload, onUpdate, resetCreateState, setErrors, trackChange]);

    // Sort handler
    const handleSort = useCallback((key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending'
        }));
    }, [setSortConfig]);

    // Delete handlers
    const handleDelete = useCallback((record) => {
        setRecordToDelete(record);
        setShowDeleteConfirm(true);
    }, [setRecordToDelete, setShowDeleteConfirm]);

    const confirmDelete = useCallback(async () => {
        if (!recordToDelete || !onDelete) return false;

        try {
            await onDelete(recordToDelete);
            setShowDeleteConfirm(false);
            setRecordToDelete(null);
            return true;
        } catch (error) {
            console.error('Error deleting record:', error);
            return false;
        }
    }, [recordToDelete, onDelete, setShowDeleteConfirm, setRecordToDelete]);

    const cancelDelete = useCallback(() => {
        setShowDeleteConfirm(false);
        setRecordToDelete(null);
    }, [setShowDeleteConfirm, setRecordToDelete]);

    // Clear filters
    const clearFilters = useCallback(() => {
        resetFilters();
    }, [resetFilters]);

    // Toggle phone/office state helpers
    const toggleEditPhoneState = useCallback(() => {
        const newHasNoPhone = !editFormData.hasNoPhone;
        setEditFormData(prev => ({
            ...prev,
            hasNoPhone: newHasNoPhone,
            phone: newHasNoPhone ? '' : prev.phone
        }));
    }, [editFormData.hasNoPhone, setEditFormData]);

    const toggleEditOfficeState = useCallback(() => {
        const newHasNoOffice = !editFormData.hasNoOffice;
        setEditFormData(prev => ({
            ...prev,
            hasNoOffice: newHasNoOffice,
            office: newHasNoOffice ? '' : prev.office
        }));
    }, [editFormData.hasNoOffice, setEditFormData]);

    const toggleCreatePhoneState = useCallback(() => {
        const newHasNoPhone = !newRecord.hasNoPhone;
        setNewRecord(prev => ({
            ...prev,
            hasNoPhone: newHasNoPhone,
            phone: newHasNoPhone ? '' : prev.phone
        }));
    }, [newRecord.hasNoPhone, setNewRecord]);

    const toggleCreateOfficeState = useCallback(() => {
        const newHasNoOffice = !newRecord.hasNoOffice;
        setNewRecord(prev => ({
            ...prev,
            hasNoOffice: newHasNoOffice,
            office: newHasNoOffice ? '' : prev.office
        }));
    }, [newRecord.hasNoOffice, setNewRecord]);

    // Input class helper
    const getInputClass = useCallback((fieldName) => {
        const baseClass = "w-full p-1 border rounded bg-baylor-gold/10";
        return errors[fieldName] ? `${baseClass} border-red-500` : `${baseClass} border-baylor-gold`;
    }, [errors]);

    return {
        // Edit handlers
        handleEdit,
        handleCancel,
        handleSave,
        handleChange,

        // Create handlers
        handleCreate,
        handleCancelCreate,
        handleCreateChange,
        handleCreateSave,

        // Sort handler
        handleSort,

        // Delete handlers
        handleDelete,
        confirmDelete,
        cancelDelete,

        // Filter handlers
        clearFilters,

        // Toggle helpers
        toggleEditPhoneState,
        toggleEditOfficeState,
        toggleCreatePhoneState,
        toggleCreateOfficeState,

        // Utility
        getInputClass
    };
}

export default useDirectoryHandlers;
