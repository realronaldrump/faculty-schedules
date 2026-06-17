import Modal from '../shared/Modal';

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

  const header = (
    <div>
      <div className="text-sm text-gray-500">Course</div>
      <h4 className="text-lg font-semibold text-baylor-green">
        {item?.Course}
        {item?.Section ? (
          <span className="ml-2 text-gray-500 font-normal">Sec {item.Section}</span>
        ) : null}
      </h4>
    </div>
  );

  return (
    <Modal
      isOpen={!!item}
      onClose={onClose}
      size="md"
      title={header}
      bodyClassName="p-4"
      footer={
        <button type="button" onClick={onClose} className="btn-secondary-sm">
          Close
        </button>
      }
    >
      <div className="space-y-3">
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
    </Modal>
  );
};

export default CourseDetailModal;

