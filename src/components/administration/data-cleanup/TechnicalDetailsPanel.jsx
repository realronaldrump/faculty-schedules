import React from "react";

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
      <pre className="mt-2 overflow-x-auto text-xs text-gray-700">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
};

export default TechnicalDetailsPanel;
