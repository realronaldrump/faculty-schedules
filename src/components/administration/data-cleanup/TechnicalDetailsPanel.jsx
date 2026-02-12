import React from "react";

const humanizeLabel = (value) =>
  String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());

const isPrimitive = (value) =>
  value === null ||
  value === undefined ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const formatPrimitive = (value) => {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const summarizeValue = (value) => {
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).length;
    return `${keys} field${keys === 1 ? "" : "s"}`;
  }
  return formatPrimitive(value);
};

const renderValue = (value, depth = 0) => {
  if (isPrimitive(value)) {
    return <span className="text-gray-900">{formatPrimitive(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-gray-500">None</span>;
    }

    if (value.every(isPrimitive)) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {value.slice(0, 10).map((item, index) => (
            <span
              key={`primitive:${index}`}
              className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700"
            >
              {formatPrimitive(item)}
            </span>
          ))}
          {value.length > 10 ? (
            <span className="text-xs text-gray-500">+{value.length - 10} more</span>
          ) : null}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="text-xs text-gray-500">
          {value.length} item{value.length === 1 ? "" : "s"}
        </div>
        {value.slice(0, 4).map((item, index) => (
          <div key={`complex:${index}`} className="rounded-md border border-gray-200 bg-white p-2">
            {renderValue(item, depth + 1)}
          </div>
        ))}
        {value.length > 4 ? (
          <div className="text-xs text-gray-500">+{value.length - 4} more items</div>
        ) : null}
      </div>
    );
  }

  const entries = Object.entries(value || {}).filter(([, entryValue]) => entryValue !== undefined);
  if (entries.length === 0) {
    return <span className="text-gray-500">No details available</span>;
  }

  if (depth >= 2) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {entries.slice(0, 4).map(([key, entryValue]) => (
          <span
            key={`summary:${key}`}
            className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700"
          >
            {humanizeLabel(key)}: {summarizeValue(entryValue)}
          </span>
        ))}
        {entries.length > 4 ? (
          <span className="text-xs text-gray-500">+{entries.length - 4} more</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {entries.slice(0, 10).map(([key, entryValue]) => (
        <div key={key} className="rounded-md border border-gray-200 bg-white p-2">
          <div className="text-xs font-medium text-gray-500">{humanizeLabel(key)}</div>
          <div className="mt-1 text-sm text-gray-800">{renderValue(entryValue, depth + 1)}</div>
        </div>
      ))}
      {entries.length > 10 ? (
        <div className="rounded-md border border-dashed border-gray-300 bg-white p-2 text-xs text-gray-500">
          +{entries.length - 10} more fields
        </div>
      ) : null}
    </div>
  );
};

const TechnicalDetailsPanel = ({ title = "Technical details", data, defaultOpen = false }) => {
  if (!data) return null;

  return (
    <details
      className="rounded-lg border border-gray-200 bg-gray-50 p-3"
      open={defaultOpen}
      data-testid="technical-details"
    >
      <summary className="cursor-pointer text-sm font-medium text-gray-700">
        {title}
      </summary>
      <div className="mt-2 text-xs text-gray-500">
        Optional details for troubleshooting. You can ignore this during normal use.
      </div>
      <div className="mt-2">{renderValue(data)}</div>
    </details>
  );
};

export default TechnicalDetailsPanel;
