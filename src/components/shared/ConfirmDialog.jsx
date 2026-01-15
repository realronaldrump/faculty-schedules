import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * General-purpose confirmation dialog modal.
 * Replaces browser's native window.confirm() with a styled modal that
 * matches the application's design system.
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the dialog is visible
 * @param {string} props.title - Dialog title
 * @param {string} props.message - Main message to display
 * @param {Function} props.onConfirm - Handler called when action is confirmed
 * @param {Function} props.onCancel - Handler called when dialog is cancelled
 * @param {string} props.confirmText - Text for confirm button (default: "Confirm")
 * @param {string} props.cancelText - Text for cancel button (default: "Cancel")
 * @param {string} props.variant - Visual variant: 'default' | 'danger' | 'warning' (default: 'default')
 * @param {React.ReactNode} props.icon - Custom icon component (optional)
 */
const ConfirmDialog = ({
    isOpen,
    title = 'Confirm Action',
    message,
    onConfirm,
    onCancel,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'default',
    icon: CustomIcon
}) => {
    if (!isOpen) return null;

    const variantStyles = {
        default: {
            iconBg: 'bg-baylor-green/10',
            iconColor: 'text-baylor-green',
            confirmBg: 'bg-baylor-green hover:bg-baylor-green/90',
            confirmText: 'text-white'
        },
        danger: {
            iconBg: 'bg-red-100',
            iconColor: 'text-red-600',
            confirmBg: 'bg-red-600 hover:bg-red-700',
            confirmText: 'text-white'
        },
        warning: {
            iconBg: 'bg-baylor-gold/20',
            iconColor: 'text-baylor-green',
            confirmBg: 'bg-baylor-gold hover:bg-baylor-gold/90',
            confirmText: 'text-baylor-green'
        }
    };

    const styles = variantStyles[variant] || variantStyles.default;
    const IconComponent = CustomIcon || AlertTriangle;

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div
                className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 rounded-full ${styles.iconBg}`}>
                        <IconComponent className={`h-6 w-6 ${styles.iconColor}`} />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">
                        {title}
                    </h3>
                </div>

                <p className="text-gray-600 mb-6">
                    {message}
                </p>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
                    >
                        <X size={16} />
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${styles.confirmBg} ${styles.confirmText}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;
