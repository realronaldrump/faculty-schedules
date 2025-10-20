import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, CheckSquare, Download, Square, AlertCircle } from 'lucide-react';

const toDisplayTerm = (term) => term || '';

const normalizeRoomList = (rooms = []) => {
  return rooms
    .filter(Boolean)
    .map((room) => room.trim())
    .filter((room) => room.length > 0)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
};

const parseContentDispositionFilename = (headerValue) => {
  if (!headerValue || typeof headerValue !== 'string') return null;
  const match = headerValue.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  if (match) {
    return decodeURIComponent(match[1] || match[2] || '').trim();
  }
  return null;
};

const ICSExportPanel = ({
  availableTerms = [],
  defaultTerm = '',
  rooms = [],
  initialSelectedRooms = [],
  title = 'Export to Outlook (.ics)',
  description = 'Select a term and rooms to download calendar files that you can import into Outlook.',
  emptyMessage = 'No rooms are available to export.',
  onDownloadComplete,
  className = '',
}) => {
  const orderedRooms = useMemo(() => normalizeRoomList(rooms), [rooms]);
  const [selectedTerm, setSelectedTerm] = useState(() => defaultTerm || availableTerms[0] || '');
  const [selectedRooms, setSelectedRooms] = useState(() => {
    const normalizedInitial = normalizeRoomList(initialSelectedRooms);
    return normalizedInitial.length > 0 ? new Set(normalizedInitial) : new Set();
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!selectedTerm && availableTerms.length > 0) {
      setSelectedTerm(availableTerms[0]);
    }
  }, [selectedTerm, availableTerms]);

  useEffect(() => {
    const normalizedInitial = normalizeRoomList(initialSelectedRooms);
    if (normalizedInitial.length > 0) {
      setSelectedRooms(new Set(normalizedInitial));
    }
  }, [initialSelectedRooms]);

  useEffect(() => {
    if (orderedRooms.length === 0) {
      setSelectedRooms(new Set());
    } else if (selectedRooms.size > 0) {
      const next = new Set();
      orderedRooms.forEach((room) => {
        if (selectedRooms.has(room)) {
          next.add(room);
        }
      });
      if (next.size !== selectedRooms.size) {
        setSelectedRooms(next);
      }
    }
  }, [orderedRooms]);

  const toggleRoom = (room) => {
    setSelectedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(room)) {
        next.delete(room);
      } else {
        next.add(room);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selectedRooms.size === orderedRooms.length) {
      setSelectedRooms(new Set());
    } else {
      setSelectedRooms(new Set(orderedRooms));
    }
  };

  const handleDownload = async () => {
    if (isDownloading) return;
    if (!selectedTerm) {
      setStatus({ type: 'error', message: 'Please choose a term before exporting.' });
      return;
    }
    if (selectedRooms.size === 0) {
      setStatus({ type: 'error', message: 'Select at least one room to export.' });
      return;
    }

    try {
      setIsDownloading(true);
      setStatus(null);

      const params = new URLSearchParams();
      params.set('term', selectedTerm);
      Array.from(selectedRooms).forEach((room) => params.append('rooms', room));

      const response = await fetch(`/api/export-ics?${params.toString()}`);
      if (!response.ok) {
        let message = 'Unable to export calendar data. Please try again later.';
        try {
          const body = await response.json();
          if (body && body.error) {
            message = body.error;
          }
        } catch (_) {
          // ignore JSON parse errors
        }
        setStatus({ type: 'error', message });
        return;
      }

      const filename = parseContentDispositionFilename(response.headers.get('Content-Disposition'))
        || (selectedRooms.size > 1
          ? `${selectedTerm.replace(/\s+/g, '_')}-rooms.zip`
          : `${selectedTerm.replace(/\s+/g, '_')}-${Array.from(selectedRooms)[0].replace(/\s+/g, '_')}.ics`);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      const eventCount = parseInt(response.headers.get('X-Event-Count') || '0', 10) || 0;
      if (onDownloadComplete) {
        onDownloadComplete({
          term: selectedTerm,
          rooms: Array.from(selectedRooms),
          eventCount,
        });
      }

      setStatus({
        type: 'success',
        message: `Downloaded ${filename}${eventCount > 0 ? ` (${eventCount} events)` : ''}.`,
      });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unexpected error while downloading.' });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4 ${className}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-baylor-green">
          <Calendar className="h-5 w-5" />
          <span className="font-semibold">{title}</span>
        </div>
      </div>

      <p className="text-sm text-gray-600">{description}</p>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Term</label>
          <select
            value={selectedTerm}
            onChange={(event) => setSelectedTerm(event.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-baylor-green focus:border-baylor-green bg-white"
          >
            <option value="">Select a term</option>
            {availableTerms.map((term) => (
              <option key={term} value={term}>
                {toDisplayTerm(term)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">
              Rooms
              {orderedRooms.length > 0 && (
                <span className="ml-2 text-xs text-gray-500">({selectedRooms.size} selected)</span>
              )}
            </label>
            {orderedRooms.length > 0 && (
              <button
                type="button"
                onClick={handleToggleAll}
                className="text-xs font-medium text-baylor-green hover:underline"
              >
                {selectedRooms.size === orderedRooms.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          {orderedRooms.length === 0 ? (
            <div className="text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-300 rounded-lg px-3 py-4">
              {emptyMessage}
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {orderedRooms.map((room) => {
                const isChecked = selectedRooms.has(room);
                return (
                  <button
                    key={room}
                    type="button"
                    onClick={() => toggleRoom(room)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                      isChecked ? 'bg-baylor-green/10 text-baylor-green' : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="truncate">{room}</span>
                    {isChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-gray-400" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {status && (
        <div
          className={`flex items-start gap-2 text-sm ${
            status.type === 'success' ? 'text-baylor-green' : 'text-red-600'
          }`}
        >
          <AlertCircle className={`h-4 w-4 mt-0.5 ${status.type === 'success' ? 'text-baylor-green' : 'text-red-500'}`} />
          <span>{status.message}</span>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading || orderedRooms.length === 0}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
            isDownloading || orderedRooms.length === 0
              ? 'bg-baylor-green/40 cursor-not-allowed'
              : 'bg-baylor-green hover:bg-baylor-green/90'
          }`}
        >
          <Download className="h-4 w-4" />
          {isDownloading ? 'Preparing…' : 'Download'}
        </button>
      </div>
    </div>
  );
};

export default ICSExportPanel;
