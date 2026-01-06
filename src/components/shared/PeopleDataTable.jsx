import React from 'react';
import SortableHeader from './SortableHeader';

/**
 * Generic data table for people directories (Faculty, Staff, Adjunct, Students).
 * Handles display, sorting, and edit/create inline modes via column definitions.
 * 
 * @param {Object} props
 * @param {Array} props.data - Array of records to display
 * @param {Array} props.columns - Column definitions (see below)
 * @param {Object} props.sortConfig - Current sort configuration { key, direction }
 * @param {Function} props.onSort - Sort handler (columnKey) => void
 * @param {string|null} props.editingId - ID of record currently being edited
 * @param {Object} props.editFormData - Form data for editing record
 * @param {Function} props.onRowClick - Handler when clicking a row (record) => void
 * @param {Function} props.renderActions - Render function for action buttons (record, isEditing) => ReactNode
 * @param {React.ReactNode} props.createRow - Optional row element for create mode
 * @param {string} props.emptyMessage - Message when no data
 * @param {string} props.rowKeyField - Field to use as row key (default: 'id')
 * 
 * Column definition shape:
 * {
 *   key: string,           // Column key for sorting
 *   label: string,         // Header label
 *   sortable: boolean,     // Whether column is sortable (default true)
 *   render: (record) => ReactNode,  // Render function for display mode
 *   renderEdit?: (record, formData, onChange, errors) => ReactNode, // Render for edit mode
 *   className?: string,    // Additional th/td classes
 * }
 */
const PeopleDataTable = ({
    data = [],
    columns = [],
    sortConfig = { key: 'name', direction: 'ascending' },
    onSort,
    editingId = null,
    editFormData = {},
    onRowClick,
    renderActions,
    createRow,
    emptyMessage = 'No records found.',
    rowKeyField = 'id'
}) => {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-baylor-green/5">
                        {columns.map((col) => (
                            col.sortable !== false ? (
                                <SortableHeader
                                    key={col.key}
                                    label={col.label}
                                    columnKey={col.key}
                                    sortConfig={sortConfig}
                                    onSort={onSort}
                                    className={col.headerClassName || ''}
                                />
                            ) : (
                                <th
                                    key={col.key}
                                    className={`px-4 py-3 text-left font-serif font-semibold text-baylor-green ${col.headerClassName || ''}`}
                                >
                                    {col.label}
                                </th>
                            )
                        ))}
                        {renderActions && (
                            <th className="px-4 py-3 w-24"></th>
                        )}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {/* Create row if provided */}
                    {createRow}

                    {/* Data rows */}
                    {data.length === 0 && !createRow ? (
                        <tr>
                            <td
                                colSpan={columns.length + (renderActions ? 1 : 0)}
                                className="px-4 py-8 text-center text-gray-500"
                            >
                                {emptyMessage}
                            </td>
                        </tr>
                    ) : (
                        data.map((record, index) => {
                            const isEditing = editingId === record[rowKeyField];
                            const rowKey = record[rowKeyField] || `row-${index}`;

                            return (
                                <tr
                                    key={rowKey}
                                    className={`hover:bg-gray-50 ${isEditing ? 'bg-baylor-gold/5' : ''}`}
                                >
                                    {columns.map((col) => (
                                        <td
                                            key={`${rowKey}-${col.key}`}
                                            className={`px-4 py-3 ${col.className || ''} ${onRowClick && !isEditing ? 'cursor-pointer' : ''
                                                }`}
                                            onClick={() => {
                                                if (onRowClick && !isEditing) {
                                                    onRowClick(record);
                                                }
                                            }}
                                        >
                                            {isEditing && col.renderEdit
                                                ? col.renderEdit(record, editFormData)
                                                : col.render(record)
                                            }
                                        </td>
                                    ))}
                                    {renderActions && (
                                        <td className="px-4 py-3 text-right">
                                            {renderActions(record, isEditing)}
                                        </td>
                                    )}
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default PeopleDataTable;
