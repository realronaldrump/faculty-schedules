import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

const joinClasses = (...classes) => classes.filter(Boolean).join(" ");

const getTextContent = (node) => {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(getTextContent).join("");
  }
  if (isValidElement(node)) {
    return getTextContent(node.props.children);
  }
  return "";
};

const collectOptions = (children) => {
  const options = [];

  const visit = (child) => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return;
    }

    if (Array.isArray(child)) {
      child.forEach(visit);
      return;
    }

    if (!isValidElement(child)) {
      return;
    }

    if (child.type === Fragment) {
      Children.toArray(child.props.children).forEach(visit);
      return;
    }

    if (child.type !== "option") {
      return;
    }

    if (child.props.hidden) {
      return;
    }

    const fallbackLabel = getTextContent(child.props.children).trim();
    const value =
      child.props.value !== undefined ? child.props.value : fallbackLabel;

    options.push({
      key: child.key ?? `${value}-${options.length}`,
      value: String(value ?? ""),
      label: String(child.props.label ?? fallbackLabel ?? ""),
      disabled: Boolean(child.props.disabled),
      children: child.props.children,
      props: child.props,
    });
  };

  Children.toArray(children).forEach(visit);
  return options;
};

const buildSelectedOptions = (options, selectedValues) =>
  selectedValues
    .map((selectedValue) =>
      options.find((option) => option.value === String(selectedValue)),
    )
    .filter(Boolean);

const SelectDropdown = ({
  children,
  value,
  defaultValue,
  onChange,
  className = "",
  buttonClassName = "",
  menuClassName = "",
  placeholder = "Select...",
  disabled = false,
  multiple = false,
  name,
  id,
  required = false,
  leadingIcon = null,
  selectedAdornment = null,
  beforeOptions = null,
  renderOption,
  renderValue,
  emptyMessage = "No options available.",
  menuPortal = true,
  menuMaxHeight = 240,
  menuMinWidth,
  ...rest
}) => {
  const generatedId = useId();
  const controlId = id || generatedId;
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const [internalValue, setInternalValue] = useState(
    value !== undefined
      ? value
      : defaultValue !== undefined
        ? defaultValue
        : multiple
          ? []
          : "",
  );

  const options = useMemo(() => collectOptions(children), [children]);
  const isControlled = value !== undefined;
  const rawValue = isControlled ? value : internalValue;
  const selectedValues = useMemo(() => {
    if (multiple) {
      return Array.isArray(rawValue) ? rawValue.map(String) : [];
    }
    return [String(rawValue ?? "")];
  }, [multiple, rawValue]);
  const selectedOptions = useMemo(
    () => buildSelectedOptions(options, selectedValues),
    [options, selectedValues],
  );

  useEffect(() => {
    if (disabled && isOpen) {
      setIsOpen(false);
    }
  }, [disabled, isOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickedTrigger = triggerRef.current?.contains(event.target);
      const clickedMenu = menuRef.current?.contains(event.target);
      if (!clickedTrigger && !clickedMenu) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen || !menuPortal) return undefined;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const measuredHeight = Math.min(
        menuRef.current?.offsetHeight || menuMaxHeight,
        menuMaxHeight,
      );
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUp = spaceBelow < measuredHeight && spaceAbove > spaceBelow;

      setMenuStyle({
        position: "fixed",
        top: openUp
          ? Math.max(8, rect.top - measuredHeight - 4)
          : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 60,
      });
    };

    updatePosition();
    const raf = requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, menuPortal, menuMaxHeight, options.length]);

  const emitChange = (nextRawValue) => {
    const nextValues = Array.isArray(nextRawValue)
      ? nextRawValue.map(String)
      : [String(nextRawValue ?? "")];
    const nextSelectedOptions = buildSelectedOptions(options, nextValues);
    const selectedOptionPayload = nextSelectedOptions.map((option) => ({
      value: option.value,
      label: option.label,
      text: option.label,
      textContent: option.label,
    }));
    const eventTarget = {
      id: controlId,
      name,
      value: multiple ? nextValues[0] || "" : nextValues[0] || "",
      selectedOptions: selectedOptionPayload,
    };

    onChange?.({
      target: eventTarget,
      currentTarget: eventTarget,
    });
  };

  const setNextValue = (nextValue) => {
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    emitChange(nextValue);
  };

  const handleOptionSelect = (option) => {
    if (disabled || option.disabled) return;

    if (multiple) {
      const exists = selectedValues.includes(option.value);
      const nextValues = exists
        ? selectedValues.filter((selectedValue) => selectedValue !== option.value)
        : [...selectedValues, option.value];
      setNextValue(nextValues);
      return;
    }

    setNextValue(option.value);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event) => {
    if (disabled) return;
    if (["Enter", " ", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      setIsOpen(true);
    }
    if (event.key === "Escape") {
      setIsOpen(false);
    }
  };

  const selectedLabel = useMemo(() => {
    if (renderValue) {
      return renderValue({
        selectedOptions,
        selectedValues,
        placeholder,
      });
    }

    if (multiple) {
      if (selectedOptions.length === 0) return placeholder;
      if (selectedOptions.length === 1) return selectedOptions[0].label;
      return `${selectedOptions.length} selected`;
    }

    return selectedOptions[0]?.label || placeholder;
  }, [multiple, placeholder, renderValue, selectedOptions, selectedValues]);

  const menuInlineStyle = menuPortal
    ? {
        ...menuStyle,
        maxHeight: menuMaxHeight,
        ...(menuMinWidth ? { minWidth: menuMinWidth } : {}),
      }
    : {
        maxHeight: menuMaxHeight,
        ...(menuMinWidth ? { minWidth: menuMinWidth } : {}),
      };

  const menuContent = (
    <div
      ref={menuRef}
      style={menuInlineStyle}
      className={joinClasses(
        menuPortal ? "app-dropdown-menu" : "app-dropdown-menu absolute mt-1",
        menuClassName,
      )}
      role="listbox"
      aria-multiselectable={multiple || undefined}
    >
      {beforeOptions}
      <div className="max-h-full overflow-y-auto py-2">
        {options.length === 0 ? (
          <div className="app-dropdown-empty">{emptyMessage}</div>
        ) : (
          options.map((option) => {
            const isSelected = selectedValues.includes(option.value);

            return (
              <button
                key={option.key}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                className={joinClasses(
                  "app-dropdown-option",
                  isSelected && "app-dropdown-option-selected",
                  option.disabled && "app-dropdown-option-disabled",
                )}
                onClick={() => handleOptionSelect(option)}
              >
                {renderOption ? (
                  renderOption(option, { selected: isSelected })
                ) : (
                  <span className="flex min-w-0 items-center justify-between gap-3">
                    <span className="truncate">{option.children}</span>
                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-baylor-green" />
                    )}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="relative">
      <button
        {...rest}
        id={controlId}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-required={required || undefined}
        onClick={() => {
          if (!disabled) {
            setIsOpen((current) => !current);
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        className={joinClasses(
          "app-dropdown-trigger",
          className,
          buttonClassName,
          disabled && "app-dropdown-trigger-disabled",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {leadingIcon}
          <span
            className={joinClasses(
              "truncate",
              selectedOptions.length > 0 ? "text-gray-900" : "text-gray-500",
            )}
          >
            {selectedLabel}
          </span>
          {selectedAdornment}
        </span>
        <ChevronDown
          className={joinClasses(
            "h-4 w-4 shrink-0 text-gray-500 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {name && !multiple && (
        <input type="hidden" name={name} value={selectedValues[0] || ""} />
      )}
      {name &&
        multiple &&
        selectedValues.map((selectedValue) => (
          <input
            key={selectedValue}
            type="hidden"
            name={name}
            value={selectedValue}
          />
        ))}

      {isOpen &&
        (menuPortal ? createPortal(menuContent, document.body) : menuContent)}
    </div>
  );
};

export default SelectDropdown;
