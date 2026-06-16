import { useEffect, useMemo, useState } from 'react';
import { X, Mail, Phone, Building, BookOpen, Clock, GraduationCap, Wifi, ChevronDown, User } from 'lucide-react';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';
import { logUpdate } from '../utils/changeLogger';
import StudentWorkerScheduleView from './analytics/StudentWorkerScheduleView';
import { useAppConfig } from '../contexts/AppConfigContext';
import { formatTermFromCode, formatTermLabel, sortTerms } from '../utils/termUtils';
import { resolveOfficeLocations } from '../utils/spaceUtils';
import { parseTime } from '../utils/timeUtils';
const DAY_LABELS = Object.freeze({
    M: 'Monday',
    T: 'Tuesday',
    W: 'Wednesday',
    R: 'Thursday',
    F: 'Friday',
    S: 'Saturday',
    U: 'Sunday',
});
const DAY_ORDER = ['M', 'T', 'W', 'R', 'F', 'S', 'U'];

const formatPhoneNumber = (phoneStr) => {
    if (!phoneStr) return '-';
    const cleaned = ('' + phoneStr).replace(/\D/g, '');
    if (cleaned.length === 10) {
        const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
        if (match) {
            return `(${match[1]}) ${match[2]} - ${match[3]}`;
        }
    }
    return phoneStr;
};

const normalizeValue = (value) => (value === undefined || value === null ? '' : String(value).trim());

const isNoRoomLocation = (locationType = '') => {
    const normalized = locationType.toLowerCase();
    return normalized === 'no_room' || normalized === 'none';
};

const getScheduleLocation = (schedule) => {
    if (!schedule) return '';
    const locationType = normalizeValue(schedule.locationType).toLowerCase();
    if (schedule.isOnline === true || locationType === 'virtual') {
        return normalizeValue(schedule.locationLabel) || 'Online';
    }
    if (isNoRoomLocation(locationType)) {
        return normalizeValue(schedule.locationLabel) || 'No Room Needed';
    }

    const canonicalSpaces = Array.isArray(schedule.spaceDisplayNames)
        ? schedule.spaceDisplayNames.map((space) => normalizeValue(space)).filter(Boolean)
        : [];
    if (canonicalSpaces.length > 0) {
        return Array.from(new Set(canonicalSpaces)).join('; ');
    }

    const legacyRoom = normalizeValue(schedule.Room || schedule.room);
    return legacyRoom || '';
};

const parseDayCodes = (dayValue) => {
    const raw = normalizeValue(dayValue).toUpperCase();
    if (!raw) return [];
    const matches = raw.match(/[MTWRFSU]/g);
    return matches ? Array.from(new Set(matches)) : [];
};

const formatTimeLabel = (startTime, endTime, onlineMode = '') => {
    const start = normalizeValue(startTime);
    const end = normalizeValue(endTime);
    if (start && end) return `${start} - ${end}`;
    if (start || end) return start || end;
    if (normalizeValue(onlineMode).toLowerCase() === 'asynchronous') {
        return 'Asynchronous';
    }
    return 'Time TBD';
};

const buildMeetingRows = (schedule) => {
    if (!schedule) return [];

    const resolvedLocation = getScheduleLocation(schedule);
    const location = resolvedLocation || 'Location TBD';
    const onlineMode = normalizeValue(schedule.onlineMode);
    const meetings = [];

    if (Array.isArray(schedule.meetingPatterns) && schedule.meetingPatterns.length > 0) {
        schedule.meetingPatterns.forEach((pattern) => {
            const dayCode = normalizeValue(pattern?.day).toUpperCase();
            meetings.push({
                dayCode,
                dayLabel: DAY_LABELS[dayCode] || dayCode || 'Unspecified day',
                startTime: normalizeValue(pattern?.startTime),
                endTime: normalizeValue(pattern?.endTime),
                location,
                timeLabel: formatTimeLabel(pattern?.startTime, pattern?.endTime, onlineMode),
            });
        });
        return meetings;
    }

    const legacyStart = schedule['Start Time'] || schedule.startTime || '';
    const legacyEnd = schedule['End Time'] || schedule.endTime || '';
    const legacyDayCodes = parseDayCodes(
        schedule.Day || schedule.day || schedule.days || schedule.meetingDays,
    );

    if (legacyDayCodes.length > 0) {
        legacyDayCodes.forEach((dayCode) => {
            meetings.push({
                dayCode,
                dayLabel: DAY_LABELS[dayCode] || dayCode,
                startTime: normalizeValue(legacyStart),
                endTime: normalizeValue(legacyEnd),
                location,
                timeLabel: formatTimeLabel(legacyStart, legacyEnd, onlineMode),
            });
        });
        return meetings;
    }

    if (legacyStart || legacyEnd || resolvedLocation || onlineMode.toLowerCase() === 'asynchronous') {
        meetings.push({
            dayCode: '',
            dayLabel: 'Unspecified day',
            startTime: normalizeValue(legacyStart),
            endTime: normalizeValue(legacyEnd),
            location,
            timeLabel: formatTimeLabel(legacyStart, legacyEnd, onlineMode),
        });
    }

    return meetings;
};

const formatCredits = (value) => {
    const raw = normalizeValue(value);
    if (!raw) return '';
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
        const displayValue = Number.isInteger(numeric) ? String(numeric) : String(numeric);
        return `${displayValue} credit${numeric === 1 ? '' : 's'}`;
    }
    return raw.toLowerCase().includes('credit') ? raw : `${raw} credits`;
};

const sortMeetingRows = (rows = []) => {
    return [...rows].sort((a, b) => {
        const dayA = DAY_ORDER.indexOf(a.dayCode);
        const dayB = DAY_ORDER.indexOf(b.dayCode);
        const dayRankA = dayA === -1 ? 99 : dayA;
        const dayRankB = dayB === -1 ? 99 : dayB;
        if (dayRankA !== dayRankB) return dayRankA - dayRankB;

        const startA = parseTime(a.startTime);
        const startB = parseTime(b.startTime);
        const startRankA = startA === null ? Number.MAX_SAFE_INTEGER : startA;
        const startRankB = startB === null ? Number.MAX_SAFE_INTEGER : startB;
        if (startRankA !== startRankB) return startRankA - startRankB;

        return (a.location || '').localeCompare(b.location || '');
    });
};

const getInstructionLabel = (course) => {
    const instructionMethod = normalizeValue(course?.instructionMethod);
    if (instructionMethod) return instructionMethod;
    if (course?.isOnline) {
        const mode = normalizeValue(course?.onlineMode);
        return mode ? `Online (${mode})` : 'Online';
    }
    if (isNoRoomLocation(course?.locationType || '')) return 'No Room Needed';
    return 'Not specified';
};

const FacultyContactCard = ({
    person,
    onClose,
    personType = 'faculty',
    showStudentSchedule = false,
    studentAssignments = [],
}) => {
    const contactPerson = person;
    const { termConfig, termConfigVersion } = useAppConfig();

    const [externalSchedules, setExternalSchedules] = useState([]);
    const [isEditingBaylorId, setIsEditingBaylorId] = useState(false);
    const [baylorIdValue, setBaylorIdValue] = useState(contactPerson?.baylorId || '');
    const [baylorIdError, setBaylorIdError] = useState('');
    const [savingBaylorId, setSavingBaylorId] = useState(false);
    const [expandedCourseKey, setExpandedCourseKey] = useState(null);

    // Keep local value in sync when opening different people
    useEffect(() => {
        setBaylorIdValue(contactPerson?.baylorId || '');
        setBaylorIdError('');
        setIsEditingBaylorId(false);
        setExpandedCourseKey(null);
    }, [contactPerson?.id]);

    const getDisplayTerm = (term, termCode) => {
        const raw = (term || '').trim();
        const formatted = formatTermLabel(raw, termConfig);
        if (formatted) return formatted;
        const fromCode = formatTermFromCode(termCode || '', termConfig);
        return fromCode || raw;
    };

    // Load schedules directly from Firestore for ALL semesters
    // Always fetch externally for faculty/staff to show complete teaching history,
    // not just the currently selected semester's courses
    useEffect(() => {
        let cancelled = false;
        const shouldFetch = personType !== 'student' && contactPerson?.id;
        const load = async () => {
            try {
                const schedulesRef = collection(db, COLLECTIONS.SCHEDULES);
                const results = [];
                // Prefer id-based match when available
                if (contactPerson?.id) {
                    const [snapByIds, snapById] = await Promise.all([
                        getDocs(query(schedulesRef, where('instructorIds', 'array-contains', contactPerson.id))),
                        getDocs(query(schedulesRef, where('instructorId', '==', contactPerson.id)))
                    ]);
                    const merged = new Map();
                    snapByIds.forEach(doc => merged.set(doc.id, { id: doc.id, ...doc.data() }));
                    snapById.forEach(doc => {
                        if (!merged.has(doc.id)) {
                            merged.set(doc.id, { id: doc.id, ...doc.data() });
                        }
                    });
                    merged.forEach((value) => results.push(value));
                }
                if (!cancelled) setExternalSchedules(results);
            } catch (err) {
                console.warn('Failed to load schedules for contact card:', err);
                if (!cancelled) setExternalSchedules([]);
            }
        };
        if (shouldFetch) load();
        return () => { cancelled = true; };
    }, [contactPerson?.id, personType]);

    // Build the source schedules: prefer externally fetched (all semesters) over embedded (filtered by current semester)
    // For faculty/staff, always use external schedules to show complete teaching history
    const sourceSchedules = useMemo(() => {
        // For non-students, prefer external schedules which contain ALL semesters
        if (personType !== 'student') {
            return externalSchedules;
        }
        // For students, use embedded courses if available
        if (Array.isArray(contactPerson.courses) && contactPerson.courses.length > 0) {
            return contactPerson.courses;
        }
        return externalSchedules;
    }, [contactPerson.courses, externalSchedules, personType]);

    // Normalize, aggregate, and sort courses by term while retaining full schedule detail
    const { coursesByTerm, sortedTerms, totalCourseCount } = useMemo(() => {
        const termBuckets = new Map();

        if (Array.isArray(sourceSchedules)) {
            sourceSchedules.forEach((item, index) => {
                const courseCode = normalizeValue(item?.courseCode || item?.Course);
                const courseTitle = normalizeValue(
                    item?.courseTitle || item?.title || item?.['Course Title'] || item?.Title,
                );
                const section = normalizeValue(item?.section || item?.Section);
                const term = getDisplayTerm(
                    item?.term || item?.Term || '',
                    item?.termCode || item?.termCodeAlt || '',
                );
                const termKey = term || 'Other';
                const normalizedCodeKey = (courseCode || courseTitle || item?.id || `unknown-${index}`)
                    .toString()
                    .trim()
                    .toUpperCase();
                const normalizedSectionKey = (section || 'NO_SECTION')
                    .toString()
                    .trim()
                    .toUpperCase();
                const courseKey = `${normalizedCodeKey}|${normalizedSectionKey}`;

                if (!termBuckets.has(termKey)) {
                    termBuckets.set(termKey, new Map());
                }

                const termMap = termBuckets.get(termKey);
                if (!termMap.has(courseKey)) {
                    termMap.set(courseKey, {
                        id: `${termKey}|${courseKey}`,
                        term: termKey,
                        courseCode,
                        courseTitle,
                        section,
                        credits: item?.credits ?? item?.Credits ?? '',
                        crn: normalizeValue(item?.crn || item?.CRN),
                        instructionMethod: normalizeValue(
                            item?.instructionMethod || item?.['Instruction Method'] || item?.['Inst. Method'],
                        ),
                        status: normalizeValue(item?.status || item?.Status),
                        scheduleType: normalizeValue(item?.scheduleType || item?.['Schedule Type']),
                        locationType: normalizeValue(item?.locationType).toLowerCase(),
                        locationLabel: normalizeValue(item?.locationLabel),
                        isOnline: item?.isOnline === true || normalizeValue(item?.locationType).toLowerCase() === 'virtual',
                        onlineMode: normalizeValue(item?.onlineMode),
                        meetings: [],
                        _meetingKeys: new Set(),
                    });
                }

                const aggregate = termMap.get(courseKey);
                if (!aggregate.courseCode && courseCode) aggregate.courseCode = courseCode;
                if (!aggregate.courseTitle && courseTitle) aggregate.courseTitle = courseTitle;
                if (!aggregate.section && section) aggregate.section = section;
                if (!normalizeValue(aggregate.credits) && normalizeValue(item?.credits ?? item?.Credits)) {
                    aggregate.credits = item?.credits ?? item?.Credits;
                }
                if (!aggregate.crn) aggregate.crn = normalizeValue(item?.crn || item?.CRN);
                if (!aggregate.instructionMethod) {
                    aggregate.instructionMethod = normalizeValue(
                        item?.instructionMethod || item?.['Instruction Method'] || item?.['Inst. Method'],
                    );
                }
                if (!aggregate.status) aggregate.status = normalizeValue(item?.status || item?.Status);
                if (!aggregate.scheduleType) {
                    aggregate.scheduleType = normalizeValue(item?.scheduleType || item?.['Schedule Type']);
                }
                if (!aggregate.locationType) {
                    aggregate.locationType = normalizeValue(item?.locationType).toLowerCase();
                }
                if (!aggregate.locationLabel) {
                    aggregate.locationLabel = normalizeValue(item?.locationLabel);
                }
                if (!aggregate.onlineMode) aggregate.onlineMode = normalizeValue(item?.onlineMode);
                if (item?.isOnline === true || normalizeValue(item?.locationType).toLowerCase() === 'virtual') {
                    aggregate.isOnline = true;
                }

                const meetingRows = buildMeetingRows(item);
                meetingRows.forEach((meeting) => {
                    const dedupeKey = [
                        meeting.dayCode,
                        meeting.startTime,
                        meeting.endTime,
                        meeting.location,
                        meeting.timeLabel,
                    ].join('|');
                    if (aggregate._meetingKeys.has(dedupeKey)) return;
                    aggregate._meetingKeys.add(dedupeKey);
                    aggregate.meetings.push(meeting);
                });
            });
        }

        const grouped = {};
        termBuckets.forEach((termMap, termKey) => {
            grouped[termKey] = Array.from(termMap.values())
                .map((course) => {
                    const meetingRows = sortMeetingRows(course.meetings);
                    const { _meetingKeys, ...rest } = course;
                    return { ...rest, meetings: meetingRows };
                })
                .sort((a, b) => {
                    const aKey = `${a.courseCode || ''} ${a.section || ''}`.trim();
                    const bKey = `${b.courseCode || ''} ${b.section || ''}`.trim();
                    return aKey.localeCompare(bKey);
                });
        });

        const termKeys = Array.from(termBuckets.keys());
        const knownTerms = termKeys.filter((term) => term !== 'Other');
        const sortedKnownTerms = sortTerms(knownTerms, termConfig);
        const sorted = termKeys.includes('Other')
            ? [...sortedKnownTerms, 'Other']
            : sortedKnownTerms;
        const total = Object.values(grouped).reduce(
            (count, courses) => count + (Array.isArray(courses) ? courses.length : 0),
            0,
        );

        return {
            coursesByTerm: grouped,
            sortedTerms: sorted,
            totalCourseCount: total,
        };
    }, [sourceSchedules, termConfigVersion]);
    const hasCourses = totalCourseCount > 0;

    const getRoleLabel = () => {
        if (personType === 'student') {
            return 'Student Worker';
        }

        if (contactPerson.isAlsoStaff || contactPerson.isAlsoFaculty) {
            return 'Faculty & Staff';
        }
        if (contactPerson.isAdjunct) {
            return 'Adjunct Faculty';
        }
        // If the person is coming from the staff directory and is not also faculty
        if (contactPerson.isAlsoFaculty === false) {
            return 'Staff';
        }
        return 'Faculty';
    };

    const getDisplayName = () => {
        if (contactPerson.hasPhD && personType !== 'student') {
            return `Dr. ${contactPerson.name}`;
        }
        return contactPerson.name;
    };

    const validateBaylorId = (val) => {
        if (!val) return 'Baylor ID is required';
        if (!/^\d{9}$/.test(val)) return 'Baylor ID must be exactly 9 digits';
        return '';
    };

    const saveBaylorId = async () => {
        const err = validateBaylorId(baylorIdValue);
        setBaylorIdError(err);
        if (err) return;
        if (!contactPerson?.id) {
            setBaylorIdError('Cannot update: missing person id');
            return;
        }
        try {
            setSavingBaylorId(true);
            const updates = { baylorId: baylorIdValue, updatedAt: new Date().toISOString() };
            await updateDoc(doc(db, COLLECTIONS.PEOPLE, contactPerson.id), updates);
            // Fire-and-forget change logging
            logUpdate(
                `Person - ${contactPerson.name || contactPerson.email || contactPerson.id}`,
                COLLECTIONS.PEOPLE,
                contactPerson.id,
                updates,
                contactPerson,
                'FacultyContactCard.jsx - saveBaylorId'
            ).catch(err => console.error('Change logging error:', err));
            // Reflect locally
            setIsEditingBaylorId(false);
            setBaylorIdError('');
        } catch (e) {
            setBaylorIdError(e?.message || 'Failed to save');
        } finally {
            setSavingBaylorId(false);
        }
    };

    const resolvedStudentAssignments = useMemo(
        () => (Array.isArray(studentAssignments) ? studentAssignments : []),
        [studentAssignments]
    );

    const supervisorNames = useMemo(() => {
        if (personType !== 'student') return [];
        const names = new Set();
        resolvedStudentAssignments.forEach((a) => {
            const name = (a.supervisor || '').trim();
            if (name) names.add(name);
        });
        return Array.from(names);
    }, [personType, resolvedStudentAssignments]);

    const shouldShowStudentSchedule = personType === 'student' && showStudentSchedule;

    const cardWidthClass = shouldShowStudentSchedule ? 'max-w-5xl' : 'max-w-2xl';
    const nameInitials = useMemo(() => (
        (contactPerson?.name || '')
            .split(' ')
            .map((part) => part?.[0] || '')
            .join('')
            .slice(0, 2)
            .toUpperCase() || '?'
    ), [contactPerson?.name]);
    const emailValue = (contactPerson?.email || '').trim();
    const officeLocations = useMemo(() => {
        if (personType === 'student') return [];
        if (contactPerson?.hasNoOffice) return ['No office'];

        const uniqueLocations = [];
        const seen = new Set();
        const addLocation = (value) => {
            const normalized = (value || '').toString().trim();
            if (!normalized || seen.has(normalized)) return;
            seen.add(normalized);
            uniqueLocations.push(normalized);
        };

        if (Array.isArray(contactPerson?.offices)) {
            contactPerson.offices.forEach(addLocation);
        }
        addLocation(contactPerson?.office);

        if (uniqueLocations.length === 0) {
            const resolved = resolveOfficeLocations(contactPerson);
            resolved.forEach((location) => addLocation(location?.displayName));
        }

        return uniqueLocations;
    }, [contactPerson, personType]);
    const officeHeadingLabel = officeLocations.length > 1 ? 'Offices' : 'Office';
    const locationValue = personType === 'student'
        ? (Array.isArray(contactPerson.primaryBuildings) && contactPerson.primaryBuildings.length > 0
            ? contactPerson.primaryBuildings.join(', ')
            : 'Not specified')
        : (officeLocations[0] || 'Not specified');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-[2px] p-3 sm:p-6" onClick={onClose}>
            <div
                className={`relative mx-auto w-full ${cardWidthClass} rounded-2xl border border-gray-200 bg-white shadow-2xl max-h-[92vh] overflow-y-auto`}
                onClick={e => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    aria-label="Close contact card"
                    className="absolute top-3 right-3 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-100"
                >
                    <X size={20} />
                </button>
                <div className="border-b border-gray-200 bg-white px-4 pt-5 pb-4 sm:px-6">
                    <div className="flex items-start gap-4 pr-12">
                        <div className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-baylor-green text-lg font-semibold text-white shadow-sm">
                            {nameInitials}
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-xl sm:text-2xl font-serif font-bold leading-tight text-baylor-green break-words">{getDisplayName()}</h3>
                            {contactPerson.jobTitle && <p className="mt-1 text-sm sm:text-base text-gray-700">{contactPerson.jobTitle}</p>}
                            <p className="mt-1 text-sm font-semibold text-baylor-gold">{getRoleLabel()}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                {contactPerson.isActive === false && (
                                    <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                                        Inactive
                                    </span>
                                )}
                                {contactPerson.hasPhD && personType !== 'student' && (
                                    <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-800">
                                        <GraduationCap size={12} className="mr-1" />
                                        PhD
                                    </span>
                                )}
                                {personType !== 'student' && contactPerson.isUPD && (
                                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                                        <BookOpen size={12} className="mr-1" />
                                        UPD
                                    </span>
                                )}
                                {personType !== 'student' && contactPerson.isRemote && (
                                    <span className="inline-flex items-center rounded-full border border-link-green/20 bg-link-green/10 px-2 py-1 text-xs font-medium text-link-green">
                                        <Wifi size={12} className="mr-1" />
                                        Remote
                                    </span>
                                )}
                            </div>
                            {contactPerson.isActive === false && (
                                <div className="mt-2 text-xs text-red-700">
                                    {contactPerson.inactiveAt && (
                                        <span className="font-medium">
                                            Inactive since {new Date(contactPerson.inactiveAt).toLocaleDateString()}
                                        </span>
                                    )}
                                    {contactPerson.inactiveReason && (
                                        <span>
                                            {contactPerson.inactiveAt ? ' - ' : ''}
                                            {contactPerson.inactiveReason}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-4 py-5 sm:px-6">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                <Mail size={14} className="text-baylor-green" />
                                Email
                            </div>
                            {emailValue ? (
                                <a href={`mailto:${emailValue}`} className="text-sm font-medium text-gray-800 hover:text-baylor-green hover:underline break-all">
                                    {emailValue}
                                </a>
                            ) : (
                                <span className="text-sm text-gray-500">Not specified</span>
                            )}
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                <Phone size={14} className="text-baylor-green" />
                                Phone
                            </div>
                            <span className="text-sm font-medium text-gray-800">
                                {contactPerson.hasNoPhone ? 'No Phone' : formatPhoneNumber(contactPerson.phone)}
                            </span>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                <Building size={14} className="text-baylor-green" />
                                {personType === 'student' ? 'Buildings' : officeHeadingLabel}
                            </div>
                            {personType !== 'student' && officeLocations.length > 1 ? (
                                <ul className="space-y-1">
                                    {officeLocations.map((location) => (
                                        <li key={location} className="flex items-start gap-2 text-sm font-medium text-gray-800">
                                            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gray-500" />
                                            <span className="break-words">{location}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <span className="text-sm font-medium text-gray-800">{locationValue}</span>
                            )}
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-baylor-green text-[9px] font-bold text-white">ID</span>
                                Baylor ID
                            </div>
                            {isEditingBaylorId ? (
                                <div className="space-y-2">
                                    <input
                                        value={baylorIdValue}
                                        onChange={(e) => {
                                            const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, 9);
                                            setBaylorIdValue(onlyDigits);
                                            if (baylorIdError) setBaylorIdError(validateBaylorId(onlyDigits));
                                        }}
                                        placeholder="9 digits"
                                        maxLength={9}
                                        className={`w-full px-3 py-2 border rounded-lg font-mono text-sm ${baylorIdError ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-baylor-green'} focus:outline-none focus:ring-2 focus:ring-baylor-green/20`}
                                    />
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            onClick={saveBaylorId}
                                            disabled={savingBaylorId}
                                            className="px-3 py-1.5 text-xs bg-baylor-green text-white rounded-md disabled:opacity-50 hover:bg-baylor-green/90"
                                        >
                                            {savingBaylorId ? 'Saving...' : 'Save'}
                                        </button>
                                        <button
                                            onClick={() => { setIsEditingBaylorId(false); setBaylorIdValue(contactPerson?.baylorId || ''); setBaylorIdError(''); }}
                                            disabled={savingBaylorId}
                                            className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-100 text-gray-700"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold font-mono text-gray-800">{baylorIdValue || 'Not assigned'}</span>
                                    {baylorIdValue && (
                                        <button
                                            onClick={() => navigator.clipboard.writeText(baylorIdValue)}
                                            className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 text-gray-700"
                                            title="Copy Baylor ID"
                                        >
                                            Copy
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setIsEditingBaylorId(true)}
                                        className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 text-gray-700"
                                    >
                                        {baylorIdValue ? 'Edit' : 'Add'}
                                    </button>
                                </div>
                            )}
                            {baylorIdError && (
                                <div className="mt-1 text-xs text-red-600">{baylorIdError}</div>
                            )}
                        </div>
                        {personType === 'student' && supervisorNames.length > 0 && (
                            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 sm:col-span-2">
                                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    <User size={14} className="text-baylor-green" />
                                    {supervisorNames.length === 1 ? 'Supervisor' : 'Supervisors'}
                                </div>
                                {supervisorNames.length === 1 ? (
                                    <span className="text-sm font-medium text-gray-800">{supervisorNames[0]}</span>
                                ) : (
                                    <ul className="space-y-1">
                                        {supervisorNames.map((name) => (
                                            <li key={name} className="flex items-start gap-2 text-sm font-medium text-gray-800">
                                                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gray-500" />
                                                <span>{name}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                    {personType !== 'student' && hasCourses && (
                        <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-baylor-green/5 px-3 py-2 text-sm text-baylor-green">
                            <BookOpen size={16} />
                            <span>{totalCourseCount} course{totalCourseCount !== 1 ? 's' : ''}</span>
                        </div>
                    )}
                </div>

                {/* Courses Section - only for faculty/adjunct */}
                {personType !== 'student' && hasCourses && (
                    <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
                        <h4 className="text-lg font-semibold text-baylor-green mb-3 flex items-center gap-2">
                            <BookOpen size={20} />
                            Courses Teaching
                        </h4>
                        <div className="space-y-6">
                            {sortedTerms.map((term, tIdx) => {
                                const termCourses = coursesByTerm[term] || [];
                                return (
                                    <div key={term}>
                                        {tIdx > 0 && <div className="border-t border-gray-200 my-2"></div>}
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-semibold text-gray-700">{term}</span>
                                        </div>
                                        <div className="space-y-3">
                                            {termCourses.map((course) => {
                                                const isExpanded = expandedCourseKey === course.id;
                                                const detailPanelId = `course-detail-${course.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                                                const formattedCredits = formatCredits(course.credits);
                                                const instructionLabel = getInstructionLabel(course);
                                                return (
                                                    <div key={course.id} className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedCourseKey((prev) => (prev === course.id ? null : course.id))}
                                                            aria-expanded={isExpanded}
                                                            aria-controls={detailPanelId}
                                                            className="group w-full min-h-11 px-3 py-3 text-left transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-baylor-green/60 focus-visible:ring-offset-1 sm:px-4"
                                                        >
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="min-w-0">
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <span className="text-sm font-semibold text-baylor-green break-words">
                                                                            {course.courseCode || 'Course'}
                                                                        </span>
                                                                        {course.section && (
                                                                            <span className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600">
                                                                                Sec {course.section}
                                                                            </span>
                                                                        )}
                                                                        {formattedCredits && (
                                                                            <span className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500">
                                                                                {formattedCredits}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {course.courseTitle && (
                                                                        <p className="mt-1 text-sm text-gray-700 break-words">
                                                                            {course.courseTitle}
                                                                        </p>
                                                                    )}
                                                                    <div className="mt-2 text-xs font-medium text-baylor-green/80">
                                                                        {isExpanded ? 'Hide details' : 'View details'}
                                                                    </div>
                                                                </div>
                                                                <ChevronDown
                                                                    size={18}
                                                                    className={`mt-0.5 shrink-0 text-baylor-green transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                                                    aria-hidden="true"
                                                                />
                                                            </div>
                                                        </button>

                                                        {isExpanded && (
                                                            <div id={detailPanelId} className="border-t border-gray-200 bg-white px-3 py-3 sm:px-4">
                                                                <div className="space-y-3">
                                                                    <div>
                                                                        <h5 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                                            <Clock size={14} className="text-baylor-green" />
                                                                            Schedule
                                                                        </h5>
                                                                        {course.meetings.length > 0 ? (
                                                                            <ul className="mt-2 space-y-2">
                                                                                {course.meetings.map((meeting, idx) => (
                                                                                    <li
                                                                                        key={`${course.id}-meeting-${idx}-${meeting.dayCode}-${meeting.startTime}-${meeting.endTime}`}
                                                                                        className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2 text-sm text-gray-700"
                                                                                    >
                                                                                        {`${meeting.dayLabel} • ${meeting.timeLabel} • ${meeting.location || 'Location TBD'}`}
                                                                                    </li>
                                                                                ))}
                                                                            </ul>
                                                                        ) : (
                                                                            <p className="mt-2 text-sm text-gray-500">
                                                                                No scheduled meeting times listed.
                                                                            </p>
                                                                        )}
                                                                    </div>

                                                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                                        <div className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2">
                                                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Semester</p>
                                                                            <p className="text-sm font-medium text-gray-700">{course.term || 'Other'}</p>
                                                                        </div>
                                                                        <div className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2">
                                                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Section</p>
                                                                            <p className="text-sm font-medium text-gray-700">{course.section || '—'}</p>
                                                                        </div>
                                                                        <div className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2">
                                                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">CRN</p>
                                                                            <p className="text-sm font-medium text-gray-700">{course.crn || '—'}</p>
                                                                        </div>
                                                                        <div className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2">
                                                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Credits</p>
                                                                            <p className="text-sm font-medium text-gray-700">{formattedCredits || '—'}</p>
                                                                        </div>
                                                                        <div className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2">
                                                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Instruction</p>
                                                                            <p className="text-sm font-medium text-gray-700">{instructionLabel}</p>
                                                                        </div>
                                                                        <div className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2">
                                                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Status</p>
                                                                            <p className="text-sm font-medium text-gray-700">{course.status || 'Not specified'}</p>
                                                                        </div>
                                                                        {course.scheduleType && (
                                                                            <div className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2 sm:col-span-2">
                                                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Schedule Type</p>
                                                                                <p className="text-sm font-medium text-gray-700">{course.scheduleType}</p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Program Information */}
                {contactPerson.program && (
                    <div className="mx-4 mb-5 rounded-xl border border-baylor-green/20 bg-baylor-green/5 px-4 py-3 sm:mx-6">
                        <p className="text-sm text-baylor-green font-medium">
                            Program: {contactPerson.program.name}
                        </p>
                    </div>
                )}

                {shouldShowStudentSchedule && (
                    <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
                        <StudentWorkerScheduleView student={contactPerson} assignments={resolvedStudentAssignments} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default FacultyContactCard;
