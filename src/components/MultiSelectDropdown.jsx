import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

const MultiSelectDropdown = ({
  options,
  selected,
  onChange,
  placeholder,
  displayMap,
  showSelectedLabels = false,
  maxDisplayCount = 2,
  menuPortal = false,
  menuMaxHeight = 240,
  menuMinWidth,
  enableSearch = false,
  searchPlaceholder = 'Search...',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});

  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickedDropdown = dropdownRef.current?.contains(event.target);
      const clickedMenu = menuRef.current?.contains(event.target);
      if (!clickedDropdown && !clickedMenu) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen || !menuPortal) return;

    const updatePosition = () => {
      const rect = dropdownRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuHeight = menuRef.current?.offsetHeight || menuMaxHeight;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;
      const top = openUp
        ? Math.max(8, rect.top - menuHeight - 4)
        : rect.bottom + 4;
      setMenuStyle({
        position: 'fixed',
        top,
        left: rect.left,
        width: rect.width,
        zIndex: 60,
      });
    };

    updatePosition();
    const raf = requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, menuPortal, menuMaxHeight, options.length, selected.length]);

  useEffect(() => {
    if (!isOpen && searchQuery) {
      setSearchQuery('');
    }
  }, [isOpen, searchQuery]);

  useEffect(() => {
    if (disabled && isOpen) {
      setIsOpen(false);
    }
  }, [disabled, isOpen]);

  const handleSelect = (option) => {
    if (disabled) return;
    if (selected.includes(option)) {
      onChange(selected.filter(item => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const getDisplayValue = (option) => {
    return displayMap ? displayMap[option] || option : option;
  };

  const filteredOptions = useMemo(() => {
    const base = Array.isArray(options) ? options : [];
    if (!enableSearch) return base;
    const term = (searchQuery || '').toString().trim().toLowerCase();
    if (!term) return base;
    return base.filter((option) => {
      const raw = (option || '').toString().toLowerCase();
      const label = (getDisplayValue(option) || '').toString().toLowerCase();
      return raw.includes(term) || label.includes(term);
    });
  }, [options, enableSearch, searchQuery, displayMap]);

  const selectedLabel = useMemo(() => {
    if (!selected || selected.length === 0) return placeholder;
    if (!showSelectedLabels) return `${selected.length} selected`;
    const labels = selected.map(getDisplayValue).filter(Boolean);
    if (labels.length <= maxDisplayCount) {
      return labels.join('; ');
    }
    const visible = labels.slice(0, maxDisplayCount).join('; ');
    return `${visible} +${labels.length - maxDisplayCount} more`;
  }, [selected, showSelectedLabels, displayMap, placeholder, maxDisplayCount]);

  const menuInlineStyle = menuPortal
    ? {
        ...menuStyle,
        ...(menuMinWidth ? { minWidth: menuMinWidth } : {}),
      }
    : menuMinWidth
      ? { minWidth: menuMinWidth }
      : undefined;

  const menuContent = (
    <div
      ref={menuRef}
      style={menuInlineStyle}
      className={`absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto ${
        menuPortal ? '' : ''
      }`}
    >
      {enableSearch && (
        <div className="sticky top-0 bg-white p-2 border-b border-gray-100">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-baylor-green/30"
          />
        </div>
      )}

      {filteredOptions.length === 0 ? (
        <div className="px-4 py-3 text-sm text-gray-500">
          No matches found.
        </div>
      ) : (
        filteredOptions.map((option) => (
          <div
            key={option}
            className="flex items-center px-4 py-2 hover:bg-baylor-green/10"
          >
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => handleSelect(option)}
              className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
            />
            <label
              className="ml-3 text-sm text-gray-900 flex-1 cursor-pointer"
              onClick={() => handleSelect(option)}
            >
              {getDisplayValue(option)}
            </label>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          setIsOpen(!isOpen);
        }}
        disabled={disabled}
        className={`w-full p-2 border border-gray-300 rounded-lg bg-white text-left flex items-center justify-between ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <span className={selected?.length ? "text-gray-700" : "text-gray-500"}>
          {selectedLabel}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
      </button>

      {isOpen &&
        (menuPortal ? createPortal(menuContent, document.body) : menuContent)}
    </div>
  );
};

export default MultiSelectDropdown;
