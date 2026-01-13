import React from 'react';
import { X } from 'lucide-react';

const CourseDetailModal = ({ item, pattern, room, building, onClose, onShowContactCard }) => {
  if (!item) return null;

  const splitInstructorNames = (value) => {
    if (!value) return [];
    return String(value)
      .split(/;|\/|\s+&\s+|\s+and\s+/i)
      .map((part) => part.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').trim())
      .filter(Boolean);
  };

  const getInstructorNames = (schedule) => {
    if (Array.isArray(schedule?.instructorNames) && schedule.instructorNames.length > 0) {
      return schedule.instructorNames;
    }
    const fallback = schedule?.Instructor || schedule?.instructorName || '';
    return splitInstructorNames(fallback);
  };

  const getInstructorEntries = (schedule) => {
    const names = getInstructorNames(schedule);
    if (names.length === 0) return [];
    const ids = Array.isArray(schedule?.instructorIds) ? schedule.instructorIds.filter(Boolean) : [];
    if (ids.length === names.length) {
      return names.map((name, idx) => ({ name, id: ids[idx] }));
    }
    if (ids.length === 1 && names.length === 1) {
      return [{ name: names[0], id: ids[0] }];
    }
    return names.map((name) => ({ name }));
  };

  const instructorEntries = getInstructorEntries(item);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40"></div>
      <div
        className="relative w-full max-w-lg bg-white rounded-lg shadow-xl border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <div className="text-sm text-gray-500">Course</div>
            <h4 className="text-lg font-semibold text-baylor-green">
              {item?.Course}
              {item?.Section ? (
                <span className="ml-2 text-gray-500 font-normal">Sec {item.Section}</span>
              ) : null}
            </h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-600"
            aria-label="Close course details"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {item?.Title || item?.['Course Title'] ? (
            <div className="text-gray-800">{item?.Title || item?.['Course Title']}</div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500">Instructor</div>
              <div className="text-baylor-green">
                {instructorEntries.length > 0 ? instructorEntries.map((entry, idx) => {
                  const label = `${entry.name}${idx < instructorEntries.length - 1 ? ' / ' : ''}`;
                  if (!onShowContactCard) return <span key={`${entry.name}-${idx}`}>{label}</span>;
                  return (
                    <button
                      key={`${entry.name}-${idx}`}
                      type="button"
                      className="hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowContactCard(entry.id || entry.name, entry.name);
                      }}
                    >
                      {label}
                    </button>
                  );
                }) : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Meeting Pattern</div>
              <div className="text-gray-800">{pattern || item?.Day || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Time</div>
              <div className="text-gray-800">{item?.['Start Time']} - {item?.['End Time']}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Room</div>
              <div className="text-gray-800">{room || item?.Room || '—'}</div>
              {building ? (
                <div className="text-xs text-gray-500">{building}</div>
              ) : null}
            </div>

            {item?.CRN ? (
              <div>
                <div className="text-xs text-gray-500">CRN</div>
                <div className="text-gray-800">{item.CRN}</div>
              </div>
            ) : null}

            {item?.Enrollment || item?.Cap ? (
              <div>
                <div className="text-xs text-gray-500">Enrollment</div>
                <div className="text-gray-800">
                  {item?.Enrollment || '—'}
                  {item?.Cap ? ` / ${item.Cap}` : ''}
                </div>
              </div>
            ) : null}
          </div>

          {item?.Notes ? (
            <div className="mt-2">
              <div className="text-xs text-gray-500">Notes</div>
              <div className="text-gray-800 whitespace-pre-wrap">{item.Notes}</div>
            </div>
          ) : null}
        </div>

        <div className="p-3 border-t border-gray-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-medium text-baylor-green bg-white border border-baylor-green rounded-md hover:bg-baylor-green hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CourseDetailModal;

