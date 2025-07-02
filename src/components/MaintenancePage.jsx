import React from 'react';

// A simple full-screen message shown when the application is in maintenance mode.
export default function MaintenancePage({ message, until }) {
  const formattedUntil = until ? new Date(until).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }) : null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 text-center px-4">
      <h1 className="text-3xl md:text-5xl font-bold text-gray-800 mb-6">(sort of) Scheduled Maintenance</h1>
      {message && <p className="text-lg md:text-xl text-gray-700 max-w-2xl mb-4">{message}</p>}
      {formattedUntil && (
        <p className="text-md md:text-lg text-gray-600">
          Expected availability:&nbsp;
          <span className="font-semibold text-gray-800">{formattedUntil}</span>
        </p>
      )}
    </div>
  );
} 