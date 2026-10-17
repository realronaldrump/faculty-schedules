import PeopleDataTable from './PeopleDataTable';
import DirectoryTable from './DirectoryTable';
import { DirectorySearchBar, DirectoryFiltersPanel, NameSortToggle } from './DirectoryFilters';

const UniversalDirectory = ({
  type = 'directory',
  countLabel,
  title,
  icon: Icon,
  data = [],
  columns = [],
  sortConfig,
  onSort,
  nameSort,
  onNameSortChange,
  filterText,
  onFilterTextChange,
  showFilters,
  onToggleFilters,
  onClearFilters,
  filterOptions = {},
  filterContent,
  leadingActions,
  trailingActions,
  searchNode,
  searchPlaceholder = 'Search directory…',
  renderBody,
  bodyTop,
  bodyBottom,
  tableProps = {},
  useHtmlTable = false, // Use standard HTML table instead of virtualized PeopleDataTable
  children
}) => {
  const count = Array.isArray(data) ? data.length : 0;
  const showNameToggle = sortConfig && sortConfig.key === 'name' && onNameSortChange;
  const showSearch = typeof onFilterTextChange === 'function' && typeof onToggleFilters === 'function';

  const pluralCountLabel = countLabel !== undefined
    ? countLabel
    : (type === 'people' ? 'members' : 'records');
  const resolvedCountLabel = count === 1 ? pluralCountLabel.replace(/s$/, '') : pluralCountLabel;

  // A search or filter that matches nothing gets a one-click way back.
  const isNarrowed = Boolean(filterText) || Boolean(showFilters);
  const clearSearchAndFilters = () => {
    onFilterTextChange?.('');
    onClearFilters?.();
  };
  const emptyAction = count === 0 && isNarrowed && (onFilterTextChange || onClearFilters) ? (
    <button
      type="button"
      onClick={clearSearchAndFilters}
      className="text-sm font-medium text-baylor-green hover:underline"
    >
      Clear Search and Filters
    </button>
  ) : null;

  const TableComponent = useHtmlTable ? DirectoryTable : PeopleDataTable;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <div className="flex flex-wrap justify-between items-center gap-x-4 gap-y-3 mb-4 pb-2 border-b border-gray-200">
          <h2 className="text-xl font-serif font-semibold text-baylor-green flex items-center whitespace-nowrap">
            {Icon && <Icon className="mr-2 text-baylor-gold" size={20} />}
            {title || `${type[0].toUpperCase()}${type.slice(1)} Directory`} ({count}{resolvedCountLabel ? ` ${resolvedCountLabel}` : ''})
          </h2>
          <div className="flex flex-wrap items-center justify-end gap-4">
            {leadingActions}
            {showNameToggle && (
              <NameSortToggle
                show={showNameToggle}
                nameSort={nameSort}
                onNameSortChange={onNameSortChange}
              />
            )}
            {searchNode || (showSearch && (
              <DirectorySearchBar
                filterText={filterText}
                onFilterTextChange={onFilterTextChange}
                showFilters={showFilters}
                onToggleFilters={onToggleFilters}
                placeholder={searchPlaceholder}
              />
            ))}
            {trailingActions}
          </div>
        </div>

        <DirectoryFiltersPanel isOpen={!!showFilters} onClearAll={onClearFilters}>
          {typeof filterContent === 'function' ? filterContent({ filterOptions }) : filterContent}
        </DirectoryFiltersPanel>

        {renderBody
          ? renderBody({ filterOptions })
          : (
            <>
              {bodyTop}
              <TableComponent
                data={data}
                columns={columns}
                sortConfig={sortConfig}
                onSort={onSort}
                emptyAction={emptyAction}
                {...tableProps}
              />
              {bodyBottom}
            </>
          )}

        {children}
      </div>
    </div>
  );
};

export default UniversalDirectory;

