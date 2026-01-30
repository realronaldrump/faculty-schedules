import React, { useEffect, useMemo, useRef, useState, useId } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";

const normalizeOption = (value) => String(value || "").trim();

const dedupeOptions = (options = []) => {
  const seen = new Set();
  return options
    .map((option) => normalizeOption(option))
    .filter((option) => option.length > 0)
    .filter((option) => {
      const key = option.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.localeCompare(b));
};

const SuggestionInput = ({
  label,
  value,
  onChange,
  options = [],
  placeholder = "",
  required = false,
  helperText = "",
}) => {
  const inputId = useId();
  const dropdownRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value || "");

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const normalizedOptions = useMemo(() => dedupeOptions(options), [options]);
  const lowerQuery = query.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!lowerQuery) return normalizedOptions;
    return normalizedOptions.filter((option) =>
      option.toLowerCase().includes(lowerQuery),
    );
  }, [normalizedOptions, lowerQuery]);

  const hasExactMatch = normalizedOptions.some(
    (option) => option.toLowerCase() === lowerQuery,
  );
  const showAddOption = lowerQuery.length > 0 && !hasExactMatch;

  const handleSelect = (nextValue) => {
    setQuery(nextValue);
    onChange(nextValue);
    setIsOpen(false);
  };

  const handleInputChange = (event) => {
    const nextValue = event.target.value;
    setQuery(nextValue);
    onChange(nextValue);
    setIsOpen(true);
  };

  return (
    <div className="space-y-1" ref={dropdownRef}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          id={inputId}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-baylor-green focus:border-baylor-green pr-9"
          autoComplete="off"
        />
        <ChevronDown
          size={16}
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
        {isOpen && (
          <div className="absolute z-20 mt-2 w-full rounded-md border border-gray-200 bg-white shadow-lg overflow-hidden">
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-100">
              Existing options
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredOptions.length === 0 && !showAddOption && (
                <div className="px-3 py-2 text-sm text-gray-500">
                  No matches yet.
                </div>
              )}
              {filteredOptions.map((option) => {
                const isSelected = option.toLowerCase() === lowerQuery;
                return (
                  <button
                    key={option}
                    type="button"
                    className={`w-full px-3 py-2 text-sm text-left flex items-center justify-between hover:bg-baylor-green/10 ${isSelected ? "bg-baylor-green/5 text-baylor-green" : "text-gray-700"}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleSelect(option);
                    }}
                  >
                    <span className="truncate">{option}</span>
                    {isSelected && <Check size={14} className="text-baylor-green" />}
                  </button>
                );
              })}
              {showAddOption && (
                <button
                  type="button"
                  className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-baylor-green hover:bg-baylor-green/10 border-t border-gray-100"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSelect(query.trim());
                  }}
                >
                  <Plus size={14} />
                  Add "{query.trim()}"
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {helperText && <p className="text-xs text-gray-500">{helperText}</p>}
    </div>
  );
};

export default SuggestionInput;
