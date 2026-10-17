import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';

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
    const ascending = sortConfig?.direction === 'ascending';
    const DirectionIcon = !isSorted ? ChevronsUpDown : ascending ? ChevronUp : ChevronDown;
    const ariaSort = isSorted ? (ascending ? 'ascending' : 'descending') : 'none';

    return (
        <Component
            className={`table-header-cell ${className}`}
            scope={Component === 'th' ? 'col' : undefined}
            aria-sort={Component === 'th' ? ariaSort : undefined}
        >
            <button
                type="button"
                className="flex min-h-11 items-center gap-2 transition-colors hover:text-baylor-green/80 sm:min-h-0"
                onClick={() => onSort(columnKey)}
            >
                {label}
                <DirectionIcon
                    size={14}
                    aria-hidden="true"
                    className={isSorted ? 'text-baylor-green' : 'text-gray-400'}
                />
            </button>
        </Component>
    );
};

export default SortableHeader;
