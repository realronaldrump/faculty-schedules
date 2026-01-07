import React, { useCallback, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import SortableHeader from './SortableHeader';

/**
 * Generic data table for people directories (Faculty, Staff, Adjunct, Students).
 * Handles display, sorting, and edit/create inline modes via column definitions.
 * Virtualized using react-window for performance with large datasets.
 */
const Row = ({ index, style, data: itemData }) => {
    const { items, columns, editingId, editFormData, rowKeyField, onRowClick, renderActions } = itemData;
    const record = items[index];
    const rowId = record[rowKeyField];
    const isEditing = editingId === rowId;

    return (
        <div
            style={style}
            className={`flex items-center border-b border-gray-200 hover:bg-gray-50/80 transition-colors ${isEditing ? 'bg-baylor-gold/5' : 'bg-white'}`}
        >
            {columns.map((col) => (
                <div
                    key={col.key}
                    className={`px-4 py-4 flex-1 min-w-0 overflow-hidden text-sm text-gray-900 ${col.className || ''} ${onRowClick && !isEditing ? 'cursor-pointer' : ''}`}
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
                </div>
            ))}
            {renderActions && (
                <div className="px-4 py-4 w-32 text-right flex-none flex items-center justify-end gap-1">
                    {renderActions(record, isEditing)}
                </div>
            )}
        </div>
    );
};

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
    rowKeyField = 'id',
    rowHeight = 72, // Default row height - increased for better readability
    listHeight = 600 // Default list height if AutoSizer fails or is constrained
}) => {
    console.log('PeopleDataTable render:', { dataLength: data.length });

    const itemData = useMemo(() => ({
        items: data,
        columns,
        editingId,
        editFormData,
        rowKeyField,
        onRowClick,
        renderActions
    }), [data, columns, editingId, editFormData, rowKeyField, onRowClick, renderActions]);

    return (
        <div className="w-full bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col h-[75vh] min-h-[500px] shadow-sm">
            {/* Header */}
            <div className="flex bg-gray-50 border-b border-gray-200 shrink-0">
                {columns.map((col) => (
                    <SortableHeader
                        as="div"
                        key={col.key}
                        label={col.label}
                        columnKey={col.key}
                        sortConfig={sortConfig}
                        onSort={onSort}
                        className={`flex-1 px-4 py-3.5 text-sm font-medium text-gray-700 min-w-0 ${col.headerClassName || ''}`}
                    />
                ))}
                {renderActions && (
                    <div className="px-4 py-3.5 w-32 flex-none text-sm font-medium text-gray-700">Actions</div>
                )}
            </div>

            {/* Create Row (Sticky Top if provided) */}
            {createRow && (
                <div className="bg-baylor-gold/5 border-b border-baylor-gold/20 shrink-0">
                    {/* CreateRow must now return a div compatible structure */}
                    {createRow}
                </div>
            )}

            {/* Virtual List */}
            <div className="flex-1 min-h-0">
                {data.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 italic">
                        {emptyMessage}
                    </div>
                ) : (
                    <AutoSizer
                        renderProp={({ height, width }) => {
                            console.log('AutoSizer', { height, width });
                            return (
                                <List
                                    height={height || listHeight}
                                    width={width || '100%'}
                                    itemCount={data.length}
                                    itemSize={rowHeight}
                                    itemData={itemData}
                                    overscanCount={5}
                                >
                                    {Row}
                                </List>
                            );
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default PeopleDataTable;
