import React, { useEffect, useMemo, useRef, useState, useId } from "react";
import { Check, ChevronDown, X } from "lucide-react";

const normalizeLabel = (value) => String(value || "").trim();

const buildOptions = (options = []) => {
  const seen = new Set();
  return options
    .map((option) => ({
      id: option?.id || "",
      label: normalizeLabel(option?.label),
    }))
    .filter((option) => option.id && option.label)
    .filter((option) => {
      if (seen.has(option.id)) return false;
      seen.add(option.id);
      return true;
    })
    .sort((a, b) => a.label.localeCompare(b.label));
};

const SupervisorSelect = ({
  label,
  value,
  onChange,
  options = [],
  placeholder = "",
  required = false,
  helperText = "",
  allowClear = true,
  fallbackLabel = "",
}) => {
  const inputId = useId();
  const dropdownRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const normalizedOptions = useMemo(() => buildOptions(options), [options]);

  const selectedOption = useMemo(
    () => normalizedOptions.find((option) => option.id === value) || null,
    [normalizedOptions, value],
  );

  const displayValue = selectedOption?.label || fallbackLabel || "";

  useEffect(() => {
    setQuery(displayValue);
  }, [displayValue]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setQuery(displayValue);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [displayValue]);

  const lowerQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!lowerQuery) return normalizedOptions;
    return normalizedOptions.filter((option) =>
      option.label.toLowerCase().includes(lowerQuery),
    );
  }, [normalizedOptions, lowerQuery]);

  const handleSelect = (option) => {
    setQuery(option.label);
    onChange(option.id);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setQuery("");
    setIsOpen(false);
  };

  const handleInputChange = (event) => {
    const nextValue = event.target.value;
    setQuery(nextValue);
    setIsOpen(true);
    if (allowClear && nextValue.trim() === "") {
      onChange("");
    }
  };

  const showUnlinked = !selectedOption && !!fallbackLabel;
  const resolvedHelperText = showUnlinked
    ? helperText
      ? `${helperText} (Currently "${fallbackLabel}" not linked)`
      : `Currently "${fallbackLabel}" (not linked)`
    : helperText;

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
              Select a supervisor
            </div>
            <div className="max-h-52 overflow-y-auto">
              {allowClear && value && (
                <button
                  type="button"
                  className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-gray-600 hover:bg-gray-100 border-b border-gray-100"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleClear();
                  }}
                >
                  <X size={14} />
                  Clear selection
                </button>
              )}
              {filteredOptions.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-500">
                  No supervisors found.
                </div>
              )}
              {filteredOptions.map((option) => {
                const isSelected = option.id === value;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`w-full px-3 py-2 text-sm text-left flex items-center justify-between hover:bg-baylor-green/10 ${isSelected ? "bg-baylor-green/5 text-baylor-green" : "text-gray-700"}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleSelect(option);
                    }}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected && <Check size={14} className="text-baylor-green" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {resolvedHelperText && (
        <p className="text-xs text-gray-500">{resolvedHelperText}</p>
      )}
    </div>
  );
};

export default SupervisorSelect;
