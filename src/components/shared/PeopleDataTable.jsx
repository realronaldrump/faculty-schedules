import React, { useCallback, useMemo } from 'react';
import * as ReactWindow from 'react-window';
const List = ReactWindow.FixedSizeList || ReactWindow.default.FixedSizeList;
import * as AutoSizerModule from 'react-virtualized-auto-sizer';
const AutoSizer = AutoSizerModule.default || AutoSizerModule;
import SortableHeader from './SortableHeader';

/**
 * Generic data table for people directories (Faculty, Staff, Adjunct, Students).
 * Handles display, sorting, and edit/create inline modes via column definitions.
 * Virtualized using react-window for performance with large datasets.
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
    rowKeyField = 'id',
    rowHeight = 60, // Default row height
    listHeight = 600 // Default list height if AutoSizer fails or is constrained
}) => {

    // Row renderer for react-window
    const Row = ({ index, style, data: itemData }) => {
        const { items, columns, editingId, editFormData, rowKeyField, onRowClick, renderActions } = itemData;
        const record = items[index];
        const rowId = record[rowKeyField];
        const isEditing = editingId === rowId;

        // Strip "top" style to let flex layout handle vertical alignment if needed, 
        // but react-window uses absolute positioning. We must preserve 'style'.
        // However, we want cells to align.

        return (
            <div
                style={style}
                className={`flex items-center border-b border-gray-100 hover:bg-gray-50 transition-colors ${isEditing ? 'bg-baylor-gold/5' : ''}`}
            >
                {columns.map((col) => (
                    <div
                        key={col.key}
                        className={`px-4 py-2 flex-1 min-w-0 overflow-hidden text-sm ${col.className || ''} ${onRowClick && !isEditing ? 'cursor-pointer' : ''}`}
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
                    <div className="px-4 py-2 w-28 text-right flex-none flex items-center justify-end">
                        {renderActions(record, isEditing)}
                    </div>
                )}
            </div>
        );
    };

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
        <div className="w-full bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col h-[75vh] min-h-[500px]">
            {/* Header */}
            <div className="flex bg-baylor-green/5 border-b border-gray-200 shrink-0">
                {columns.map((col) => (
                    <SortableHeader
                        as="div"
                        key={col.key}
                        label={col.label}
                        columnKey={col.key}
                        sortConfig={sortConfig}
                        onSort={onSort}
                        className={`flex-1 px-4 py-3 text-sm min-w-0 ${col.headerClassName || ''}`}
                    />
                ))}
                {renderActions && (
                    <div className="px-4 py-3 w-28 flex-none"></div>
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
                    <AutoSizer>
                        {({ height, width }) => (
                            <List
                                height={height}
                                width={width}
                                itemCount={data.length}
                                itemSize={rowHeight} // We use a fixed height. If rows need variable height, we'd use VariableSizeList
                                itemData={itemData}
                                overscanCount={5}
                            >
                                {Row}
                            </List>
                        )}
                    </AutoSizer>
                )}
            </div>
        </div>
    );
};

export default PeopleDataTable;
