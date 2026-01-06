import React from 'react';
import { Search, Filter } from 'lucide-react';

/**
 * Directory header with search and filter toggle.
 * Provides consistent UI for directory search/filter controls.
 * 
 * @param {Object} props
 * @param {string} props.filterText - Current search text
 * @param {Function} props.onFilterTextChange - Handler for search text changes
 * @param {boolean} props.showFilters - Whether advanced filters panel is open
 * @param {Function} props.onToggleFilters - Handler to toggle filters panel
 * @param {string} props.placeholder - Search input placeholder
 */
const DirectorySearchBar = ({
    filterText,
    onFilterTextChange,
    showFilters,
    onToggleFilters,
    placeholder = 'Filter directory...'
}) => {
    return (
        <div className="flex items-center gap-4">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                    type="text"
                    placeholder={placeholder}
                    value={filterText}
                    onChange={(e) => onFilterTextChange(e.target.value)}
                    className="w-full pl-10 p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
                />
            </div>
            <button
                onClick={onToggleFilters}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${showFilters
                        ? 'bg-baylor-green text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
            >
                <Filter size={16} />
                Filters
            </button>
        </div>
    );
};

/**
 * Advanced filters panel wrapper.
 * Provides consistent styling for filter panels with clear button.
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the panel is visible
 * @param {Function} props.onClearAll - Handler for clear all filters button
 * @param {React.ReactNode} props.children - Filter content
 */
const DirectoryFiltersPanel = ({
    isOpen,
    onClearAll,
    children
}) => {
    if (!isOpen) return null;

    return (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-gray-900">Advanced Filters</h3>
                <button
                    onClick={onClearAll}
                    className="text-sm text-baylor-green hover:text-baylor-green/80 font-medium"
                >
                    Clear All Filters
                </button>
            </div>
            <div className="space-y-4">
                {children}
            </div>
        </div>
    );
};

/**
 * Name sort toggle buttons (First Name / Last Name).
 * Displays when sorting by name column.
 * 
 * @param {Object} props
 * @param {boolean} props.show - Whether to display (typically when sortConfig.key === 'name')
 * @param {string} props.nameSort - Current name sort mode ('firstName' or 'lastName')
 * @param {Function} props.onNameSortChange - Handler for name sort change
 */
const NameSortToggle = ({
    show,
    nameSort,
    onNameSortChange
}) => {
    if (!show) return null;

    return (
        <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">Sort by:</span>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                    onClick={() => onNameSortChange('firstName')}
                    className={`px-3 py-1 text-xs ${nameSort === 'firstName'
                            ? 'bg-baylor-green text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                >
                    First Name
                </button>
                <button
                    onClick={() => onNameSortChange('lastName')}
                    className={`px-3 py-1 text-xs ${nameSort === 'lastName'
                            ? 'bg-baylor-green text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                >
                    Last Name
                </button>
            </div>
        </div>
    );
};

export { DirectorySearchBar, DirectoryFiltersPanel, NameSortToggle };
