import React, { useState, useEffect } from 'react';
import { X, Calendar } from 'lucide-react';

const ICSExportModal = ({
  isOpen,
  onClose,
  onConfirm,
  roomsCount = 0,
  selectedRoom = '',
  selectedBuilding = ''
}) => {
  if (!isOpen) return null;

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [perRoomFiles, setPerRoomFiles] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
  }, [startDate, endDate, perRoomFiles]);

  const handleConfirm = () => {
    // Basic validation
    if (!startDate || !endDate) {
      setError('Please select both start and end dates.');
      return;
    }
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    if (!(isFinite(start.getTime()) && isFinite(end.getTime()))) {
      setError('Invalid dates. Please use the date pickers to select valid dates.');
      return;
    }
    if (end < start) {
      setError('End date must be on or after the start date.');
      return;
    }

    onConfirm({ startDate, endDate, perRoom: perRoomFiles });
  };

  const showPerRoomToggle = !selectedRoom && roomsCount > 1;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-baylor-green" />
            <h3 className="text-lg font-semibold text-gray-900">Export to Calendar (.ics)</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            Choose the semester date range to generate weekly recurring events{selectedBuilding ? ` for ${selectedBuilding}` : ''}{selectedRoom ? ` for room ${selectedRoom}` : ''}.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Semester start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-baylor-green focus:border-baylor-green"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Semester end date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-baylor-green focus:border-baylor-green"
              />
            </div>
          </div>

          {showPerRoomToggle && (
            <div className="flex items-center justify-between bg-gray-50 rounded-lg border border-gray-200 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-gray-900">Create one file per room</div>
                <div className="text-xs text-gray-600">{roomsCount} rooms currently visible</div>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={perRoomFiles}
                  onChange={(e) => setPerRoomFiles(e.target.checked)}
                />
                <div className={`w-11 h-6 bg-gray-300 rounded-full peer peer-focus:outline-none peer-checked:bg-baylor-green relative transition-colors`}>
                  <div className={`absolute top-0.5 left-0.5 h-5 w-5 bg-white rounded-full transition-transform ${perRoomFiles ? 'translate-x-5' : ''}`}></div>
                </div>
              </label>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600">{error}</div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-baylor-green rounded-lg hover:bg-baylor-green/90"
          >
            Export ICS
          </button>
        </div>
      </div>
    </div>
  );
};

export default ICSExportModal;


