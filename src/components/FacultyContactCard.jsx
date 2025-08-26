import React, { useEffect, useMemo, useState } from 'react';
import { X, Mail, Phone, Building, BookOpen, Clock, GraduationCap, User } from 'lucide-react';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';
import { logUpdate } from '../utils/changeLogger';

// Simple in-memory cache to avoid re-fetching schedules between openings
const scheduleCache = new Map();

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

const FacultyContactCard = ({ person, faculty, onClose, personType = 'faculty' }) => {
    // Use either person or faculty prop (for backwards compatibility)
    const contactPerson = person || faculty;

    const [externalSchedules, setExternalSchedules] = useState([]);
    const [loadingSchedules, setLoadingSchedules] = useState(false);
    const [isEditingBaylorId, setIsEditingBaylorId] = useState(false);
    const [baylorIdValue, setBaylorIdValue] = useState(contactPerson?.baylorId || '');
    const [baylorIdError, setBaylorIdError] = useState('');
    const [savingBaylorId, setSavingBaylorId] = useState(false);

    // Keep local value in sync when opening different people
    useEffect(() => {
        setBaylorIdValue(contactPerson?.baylorId || '');
        setBaylorIdError('');
        setIsEditingBaylorId(false);
    }, [contactPerson?.id]);

    // Parse term code to human-readable format
    const parseTermCode = (termCode) => {
        if (!termCode || typeof termCode !== 'string') return '';
        const code = termCode.trim();
        if (code.length === 6) {
            const year = code.substring(0, 4);
            const termNum = code.substring(4, 6);
            const termMap = { '30': 'Fall', '40': 'Spring', '50': 'Summer' };
            return `${termMap[termNum] || 'Unknown'} ${year}`;
        }
        return termCode; // Return as-is if not in expected format
    };

    // Best-effort term display using either explicit term string or termCode
    const getDisplayTerm = (term, termCode) => {
        const t = (term || '').trim();
        if (t && /^(Fall|Spring|Summer|Winter)\s+\d{4}$/i.test(t)) return t;
        const parsed = parseTermCode(termCode || '');
        return parsed || t;
    };

    // Load schedules directly from Firestore when no courses are embedded
    useEffect(() => {
        let cancelled = false;
        const shouldFetch = personType !== 'student' && (!Array.isArray(contactPerson.courses) || contactPerson.courses.length === 0);
        const load = async () => {
            try {
                setLoadingSchedules(true);
                const cacheKey = contactPerson?.id ? `id:${contactPerson.id}` : (contactPerson?.name ? `name:${contactPerson.name}` : null);
                if (cacheKey && scheduleCache.has(cacheKey)) {
                    const cached = scheduleCache.get(cacheKey);
                    if (!cancelled) {
                        setExternalSchedules(cached);
                        setLoadingSchedules(false);
                    }
                    return;
                }
                const schedulesRef = collection(db, COLLECTIONS.SCHEDULES);
                const results = [];
                // Prefer id-based match when available
                if (contactPerson?.id) {
                    const qById = query(schedulesRef, where('instructorId', '==', contactPerson.id));
                    const snapById = await getDocs(qById);
                    snapById.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
                }
                // Fallback to instructorName text match
                if (results.length === 0 && contactPerson?.name) {
                    const qByName = query(schedulesRef, where('instructorName', '==', contactPerson.name));
                    const snapByName = await getDocs(qByName);
                    snapByName.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
                }
                if (cacheKey) scheduleCache.set(cacheKey, results);
                if (!cancelled) setExternalSchedules(results);
            } catch (err) {
                console.warn('Failed to load schedules for contact card:', err);
                if (!cancelled) setExternalSchedules([]);
            } finally {
                if (!cancelled) setLoadingSchedules(false);
            }
        };
        if (shouldFetch) load();
        return () => { cancelled = true; };
    }, [contactPerson?.id, contactPerson?.name, contactPerson?.courses, personType]);

    // Build the source schedules: embedded > fetched
    const sourceSchedules = useMemo(() => {
        if (Array.isArray(contactPerson.courses) && contactPerson.courses.length > 0) return contactPerson.courses;
        return externalSchedules;
    }, [contactPerson, externalSchedules]);

    // Normalize, group, and sort courses by term for consistent display
    const normalizedCourses = useMemo(() => {
        if (!Array.isArray(sourceSchedules)) return [];
        return sourceSchedules.map((item) => ({
            courseCode: item.courseCode || item.Course || '',
            courseTitle: item.courseTitle || item['Course Title'] || '',
            section: item.section || item.Section || '',
            term: getDisplayTerm(item.term || item.Term || '', item.termCode || item.termCodeAlt || ''),
            credits: item.credits || item.Credits || ''
        }));
    }, [sourceSchedules]);

    const buildSortedTerms = (courses) => {
        const termsSet = new Set();
        courses.forEach(c => { if (c.term) termsSet.add(c.term); });
        const termOrder = { 'Fall': 3, 'Summer': 2, 'Spring': 1, 'Winter': 0 };
        const parseTerm = (t) => {
            const [termType, yearStr] = (t || '').split(' ');
            const year = parseInt(yearStr, 10);
            return { termType, year: isNaN(year) ? 0 : year };
        };
        return Array.from(termsSet).sort((a, b) => {
            const A = parseTerm(a);
            const B = parseTerm(b);
            if (A.year !== B.year) return B.year - A.year; // newer years first
            return (termOrder[B.termType] || 0) - (termOrder[A.termType] || 0);
        });
    };

    const coursesByTerm = normalizedCourses.reduce((acc, course) => {
        const termKey = course.term || 'Other';
        if (!acc[termKey]) acc[termKey] = [];
        acc[termKey].push(course);
        return acc;
    }, {});

    const sortedTerms = buildSortedTerms(normalizedCourses);
    const hasCourses = normalizedCourses.length > 0;

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

    const getIconForPersonType = () => {
        switch (personType) {
            case 'student':
                return <GraduationCap size={20} />;
            case 'staff':
                return <User size={20} />;
            default:
                return <BookOpen size={20} />;
        }
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

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4 relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-2 right-2 p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                    <X size={20} />
                </button>
                <div className="text-center">
                    <h3 className="text-2xl font-serif font-bold text-baylor-green">{getDisplayName()}</h3>
                    {contactPerson.jobTitle && <p className="text-md text-gray-600">{contactPerson.jobTitle}</p>}
                    <p className="text-md text-baylor-gold font-semibold">{getRoleLabel()}</p>
                    <div className="mt-2 flex items-center justify-center gap-2">
                        {contactPerson.hasPhD && personType !== 'student' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <GraduationCap size={12} className="mr-1" />
                                PhD
                            </span>
                        )}
                        {personType !== 'student' && contactPerson.isUPD && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                {/* Using BookOpen here keeps icon set local without additional imports */}
                                <BookOpen size={12} className="mr-1" />
                                UPD
                            </span>
                        )}
                    </div>
                </div>
                
                <div className="mt-6 space-y-4">
                    <div className="flex items-center">
                        <Mail size={18} className="text-baylor-green mr-4" />
                        <a href={`mailto:${contactPerson.email}`} className="text-gray-700 hover:underline">{contactPerson.email || 'Not specified'}</a>
                    </div>
                    <div className="flex items-center">
                        <Phone size={18} className="text-baylor-green mr-4" />
                        <span className="text-gray-700">
                            {contactPerson.hasNoPhone ? 'No Phone' : formatPhoneNumber(contactPerson.phone)}
                        </span>
                    </div>
                    <div className="flex items-center">
                        <Building size={18} className="text-baylor-green mr-4" />
                        <span className="text-gray-700">{contactPerson.office || 'Not specified'}</span>
                    </div>
                    <div className="flex items-start">
                        <span className="inline-flex items-center justify-center w-5 h-5 mr-4 mt-0.5 rounded bg-baylor-green text-white text-[10px] font-bold">ID</span>
                        <div className="flex-1">
                            {isEditingBaylorId ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        value={baylorIdValue}
                                        onChange={(e) => {
                                            const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, 9);
                                            setBaylorIdValue(onlyDigits);
                                            if (baylorIdError) setBaylorIdError(validateBaylorId(onlyDigits));
                                        }}
                                        placeholder="9 digits"
                                        maxLength={9}
                                        className={`px-2 py-1 border rounded font-mono ${baylorIdError ? 'border-red-500' : 'border-gray-300'}`}
                                    />
                                    <button
                                        onClick={saveBaylorId}
                                        disabled={savingBaylorId}
                                        className="px-2 py-1 text-xs bg-baylor-green text-white rounded disabled:opacity-60"
                                    >
                                        {savingBaylorId ? 'Saving…' : 'Save'}
                                    </button>
                                    <button
                                        onClick={() => { setIsEditingBaylorId(false); setBaylorIdValue(contactPerson?.baylorId || ''); setBaylorIdError(''); }}
                                        disabled={savingBaylorId}
                                        className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-700 font-mono mr-1">{baylorIdValue || 'Not assigned'}</span>
                                    {baylorIdValue && (
                                        <button
                                            onClick={() => navigator.clipboard.writeText(baylorIdValue)}
                                            className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
                                            title="Copy Baylor ID"
                                        >
                                            Copy
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setIsEditingBaylorId(true)}
                                        className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
                                    >
                                        {baylorIdValue ? 'Edit' : 'Add'}
                                    </button>
                                </div>
                            )}
                            {baylorIdError && (
                                <div className="text-xs text-red-600 mt-1">{baylorIdError}</div>
                            )}
                        </div>
                    </div>
                    {personType !== 'student' && (
                        <div className="flex items-center justify-center gap-2 text-sm text-baylor-green">
                            <BookOpen size={16} />
                            <span>{normalizedCourses.length} course{normalizedCourses.length !== 1 ? 's' : ''}</span>
                        </div>
                    )}
                </div>

                {/* Courses Section - only for faculty/adjunct */}
                {personType !== 'student' && (
                    <div className="mt-6 border-t border-gray-200 pt-4">
                        <h4 className="text-lg font-semibold text-baylor-green mb-3 flex items-center gap-2">
                            <BookOpen size={20} />
                            Courses Teaching
                        </h4>
                        {loadingSchedules && normalizedCourses.length === 0 ? (
                            <div className="text-sm text-gray-500">Loading courses…</div>
                        ) : hasCourses ? (
                            <div className="space-y-6">
                                {sortedTerms.map((term, tIdx) => {
                                    const termCourses = (coursesByTerm[term] || []).slice().sort((a, b) => {
                                        const aKey = `${a.courseCode || ''} ${a.section || ''}`.trim();
                                        const bKey = `${b.courseCode || ''} ${b.section || ''}`.trim();
                                        return aKey.localeCompare(bKey);
                                    });
                                    // Deduplicate within term by course code + section
                                    const seen = new Set();
                                    const uniqueTermCourses = termCourses.filter(c => {
                                        const key = `${c.courseCode}|${c.section}`;
                                        if (seen.has(key)) return false;
                                        seen.add(key);
                                        return true;
                                    });
                                    return (
                                        <div key={term}>
                                            {tIdx > 0 && <div className="border-t border-gray-200 my-2"></div>}
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm font-semibold text-gray-700">{term}</span>
                                            </div>
                                            <div className="space-y-3">
                                                {uniqueTermCourses.map((course, index) => (
                                                    <div key={`${course.courseCode}-${course.section}-${index}`} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className="font-semibold text-baylor-green text-sm">
                                                                {course.courseCode}
                                                            </span>
                                                            {course.credits && (
                                                                <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded">
                                                                    {course.credits} credit{course.credits !== 1 ? 's' : ''}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {course.courseTitle && (
                                                            <p className="text-sm text-gray-700 mb-1">
                                                                {course.courseTitle}
                                                            </p>
                                                        )}
                                                        <div className="flex gap-4 text-xs text-gray-500">
                                                            {course.section && (
                                                                <span>Section: {course.section}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-sm text-gray-500">No courses found.</div>
                        )}
                    </div>
                )}

                {/* Program Information */}
                {contactPerson.program && (
                    <div className="mt-4 p-3 bg-baylor-green/5 rounded-lg border border-baylor-green/20">
                        <p className="text-sm text-baylor-green font-medium">
                            Program: {contactPerson.program.name}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FacultyContactCard;