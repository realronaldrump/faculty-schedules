import React from 'react';
import { Trash2, X } from 'lucide-react';

/**
 * Delete confirmation dialog modal.
 * Displays a confirmation prompt before deleting a record.
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the dialog is visible
 * @param {Object} props.record - The record being deleted (for display)
 * @param {string} props.recordType - Type label (e.g., "faculty member", "staff member")
 * @param {Function} props.onConfirm - Handler called when delete is confirmed
 * @param {Function} props.onCancel - Handler called when dialog is cancelled
 * @param {Function} props.getDisplayName - Optional function to get display name from record
 */
const DeleteConfirmDialog = ({
    isOpen,
    record,
    recordType = 'record',
    onConfirm,
    onCancel,
    getDisplayName = (r) => r?.name || 'this record'
}) => {
    if (!isOpen) return null;

    const displayName = getDisplayName(record);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-red-100 rounded-full">
                        <Trash2 className="h-6 w-6 text-red-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">
                        Delete {recordType}?
                    </h3>
                </div>

                <p className="text-gray-600 mb-6">
                    Are you sure you want to delete <strong>{displayName}</strong>?
                    This action cannot be undone.
                </p>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
                    >
                        <X size={16} />
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                    >
                        <Trash2 size={16} />
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeleteConfirmDialog;
