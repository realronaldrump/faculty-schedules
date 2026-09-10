import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

// Editable suggestions: the typed value remains valid without selecting an option.
const ComboboxDropdown = ({
  options,
  value = "",
  onChange,
  id,
  disabled = false,
  emptyMessage = "Type a new value.",
  ...inputProps
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const listboxId = `${inputId}-options`;
  const menuRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const filteredOptions = useMemo(() => {
    const query = value.trim().toLowerCase();
    return [...new Set(options)].filter((option) =>
      option.toLowerCase().includes(query),
    );
  }, [options, value]);
  const expanded = isOpen && !disabled;
  const activeOptionId =
    expanded && filteredOptions[activeIndex] !== undefined
      ? `${listboxId}-${activeIndex}`
      : undefined;

  useEffect(() => {
    if (activeOptionId) {
      menuRef.current
        ?.querySelector(`[id="${activeOptionId}"]`)
        ?.scrollIntoView?.({ block: "nearest" });
    }
  }, [activeOptionId]);

  const openMenu = () => {
    setIsOpen(true);
    setActiveIndex(-1);
  };

  const selectOption = (option) => {
    onChange(option);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (event.nativeEvent.isComposing) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      const lastIndex = filteredOptions.length - 1;
      setActiveIndex((current) => {
        if (!expanded || current < 0) {
          return event.key === "ArrowDown" ? Math.min(0, lastIndex) : lastIndex;
        }
        return event.key === "ArrowDown"
          ? Math.min(current + 1, lastIndex)
          : Math.max(current - 1, 0);
      });
    } else if (event.key === "Enter" && activeOptionId) {
      event.preventDefault();
      selectOption(filteredOptions[activeIndex]);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Tab") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className="relative min-w-0">
      <input
        {...inputProps}
        id={inputId}
        type="text"
        role="combobox"
        autoComplete="off"
        value={value}
        disabled={disabled}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        className="app-dropdown-input"
        onFocus={openMenu}
        onClick={openMenu}
        onBlur={() => {
          setIsOpen(false);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          onChange(event.target.value);
          openMenu();
        }}
      />
      <ChevronDown
        aria-hidden="true"
        className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}
      />
      {expanded && (
        <div
          id={listboxId}
          ref={menuRef}
          role="listbox"
          aria-label={inputProps["aria-label"] || inputProps.placeholder}
          className="app-dropdown-menu absolute mt-1 max-h-60 w-full overflow-y-auto py-2"
        >
          {filteredOptions.length === 0 ? (
            <div className="app-dropdown-empty">{emptyMessage}</div>
          ) : (
            filteredOptions.map((option, index) => (
              <button
                key={option}
                id={`${listboxId}-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={value === option}
                className={`app-dropdown-option flex items-center justify-between gap-3 ${value === option ? "app-dropdown-option-selected" : ""} ${activeIndex === index ? "bg-gray-100" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
              >
                <span className="min-w-0 break-words">{option}</span>
                {value === option && (
                  <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-baylor-green" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ComboboxDropdown;
