import React from 'react';
import { X } from 'lucide-react';

const CourseDetailModal = ({ item, pattern, room, building, onClose, onShowContactCard }) => {
  if (!item) return null;

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
              <button
                className="text-baylor-green hover:underline"
                onClick={(e) => { e.stopPropagation(); onShowContactCard(item?.Instructor); }}
              >
                {item?.Instructor || '—'}
              </button>
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


