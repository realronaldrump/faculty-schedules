import React from 'react';
import SortableHeader from './SortableHeader';

/**
 * Standard HTML table component for directory views.
 * Matches the styling of StudentDirectory and EmailLists tables.
 * Used as a replacement for PeopleDataTable when virtualization is not needed.
 */
const DirectoryTable = ({
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
            <table className="university-table">
                <thead>
                    <tr>
                        {columns.map((col) => (
                            <SortableHeader
                                key={col.key}
                                label={col.label}
                                columnKey={col.key}
                                sortConfig={sortConfig}
                                onSort={onSort}
                                className={`whitespace-nowrap ${col.headerClassName || ''}`}
                            />
                        ))}
                        {renderActions && (
                            <th className="table-header-cell whitespace-nowrap text-right">
                                Actions
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {/* Create row at top if present */}
                    {createRow && (
                        <tr className="bg-baylor-gold/5">
                            {createRow}
                        </tr>
                    )}

                    {data.length === 0 && !createRow ? (
                        <tr>
                            <td colSpan={columns.length + (renderActions ? 1 : 0)} className="px-4 py-12 text-center text-gray-500">
                                {emptyMessage}
                            </td>
                        </tr>
                    ) : (
                        data.map((record) => {
                            const rowId = record[rowKeyField];
                            const isEditing = editingId === rowId;

                            return (
                                <tr
                                    key={rowId}
                                    className={`${isEditing ? 'bg-baylor-gold/5' : ''} transition-colors`}
                                >
                                    {columns.map((col) => (
                                        <td
                                            key={col.key}
                                            className={`px-4 py-3 whitespace-nowrap ${col.className || ''} ${onRowClick && !isEditing ? 'cursor-pointer' : ''}`}
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
                                        <td className="px-4 py-3 whitespace-nowrap text-right">
                                            <div className="flex justify-end gap-1">
                                                {renderActions(record, isEditing)}
                                            </div>
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

export default DirectoryTable;
