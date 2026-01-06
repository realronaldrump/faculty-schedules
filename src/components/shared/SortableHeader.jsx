import React from 'react';
import { ArrowUpDown } from 'lucide-react';

/**
 * Reusable sortable table header component.
 * Displays column label with sort indicator and handles click to toggle sort.
 * 
 * @param {Object} props
 * @param {string} props.label - Column header label
 * @param {string} props.columnKey - Key used for sorting
 * @param {Object} props.sortConfig - Current sort config { key, direction }
 * @param {Function} props.onSort - Handler called with columnKey when clicked
 * @param {string} props.className - Optional additional classes
 */
const SortableHeader = ({
    label,
    columnKey,
    sortConfig,
    onSort,
    className = '',
    as: Component = 'th'
}) => {
    const isSorted = sortConfig?.key === columnKey;
    const directionIcon = isSorted
        ? (sortConfig.direction === 'ascending' ? '▲' : '▼')
        : <ArrowUpDown size={14} className="opacity-30" />;

    return (
        <Component className={`px-4 py-3 text-left font-serif font-semibold text-baylor-green ${className}`}>
            <button
                className="flex items-center gap-2 hover:text-baylor-green/80 transition-colors"
                onClick={() => onSort(columnKey)}
            >
                {label}
                <span className="text-xs">{directionIcon}</span>
            </button>
        </Component>
    );
};

export default SortableHeader;
