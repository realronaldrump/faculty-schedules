import React from 'react';
import { X, Mail, Phone, Building, BookOpen, Clock, GraduationCap, User } from 'lucide-react';

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
    
    // Get unique courses by course code (for faculty/adjunct)
    const uniqueCourses = contactPerson.courses ? 
        contactPerson.courses.reduce((acc, course) => {
            const key = course.courseCode;
            if (key && !acc.find(c => c.courseCode === key)) {
                acc.push(course);
            }
            return acc;
        }, []) : [];

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

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4 relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-2 right-2 p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                    <X size={20} />
                </button>
                <div className="text-center">
                    <h3 className="text-2xl font-serif font-bold text-baylor-green">{contactPerson.name}</h3>
                    {contactPerson.jobTitle && <p className="text-md text-gray-600">{contactPerson.jobTitle}</p>}
                    <p className="text-md text-baylor-gold font-semibold">{getRoleLabel()}</p>
                    
                    {/* Different info based on person type */}
                    {personType === 'student' && contactPerson.department && (
                        <div className="mt-2 flex items-center justify-center gap-2 text-sm text-baylor-green">
                            <Building size={16} />
                            <span>{contactPerson.department}</span>
                        </div>
                    )}
                    
                    {personType !== 'student' && contactPerson.courseCount > 0 && (
                        <div className="mt-2 flex items-center justify-center gap-2 text-sm text-baylor-green">
                            <BookOpen size={16} />
                            <span>{contactPerson.courseCount} course{contactPerson.courseCount !== 1 ? 's' : ''}</span>
                        </div>
                    )}
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
                    
                    {/* Office for faculty/staff, work schedule for students */}
                    {personType === 'student' ? (
                        contactPerson.workSchedule && (
                            <div className="flex items-center">
                                <Clock size={18} className="text-baylor-green mr-4" />
                                <span className="text-gray-700">{contactPerson.workSchedule}</span>
                            </div>
                        )
                    ) : (
                        <div className="flex items-center">
                            <Building size={18} className="text-baylor-green mr-4" />
                            <span className="text-gray-700">{contactPerson.office || 'Not specified'}</span>
                        </div>
                    )}
                </div>

                {/* Student-specific information */}
                {personType === 'student' && (
                    <div className="mt-6 border-t border-gray-200 pt-4">
                        <h4 className="text-lg font-semibold text-baylor-green mb-3 flex items-center gap-2">
                            <GraduationCap size={20} />
                            Student Information
                        </h4>
                        <div className="space-y-3">
                            {contactPerson.supervisor && (
                                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <div className="text-sm">
                                        <span className="font-semibold text-baylor-green">Supervisor:</span>
                                        <span className="ml-2 text-gray-700">{contactPerson.supervisor}</span>
                                    </div>
                                </div>
                            )}
                            {contactPerson.startDate && (
                                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <div className="text-sm">
                                        <span className="font-semibold text-baylor-green">Start Date:</span>
                                        <span className="ml-2 text-gray-700">
                                            {new Date(contactPerson.startDate).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            )}
                            {contactPerson.hourlyRate && (
                                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <div className="text-sm">
                                        <span className="font-semibold text-baylor-green">Hourly Rate:</span>
                                        <span className="ml-2 text-gray-700">${contactPerson.hourlyRate}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Courses Section - only for faculty/adjunct */}
                {personType !== 'student' && uniqueCourses.length > 0 && (
                    <div className="mt-6 border-t border-gray-200 pt-4">
                        <h4 className="text-lg font-semibold text-baylor-green mb-3 flex items-center gap-2">
                            <BookOpen size={20} />
                            Courses Teaching
                        </h4>
                        <div className="space-y-3">
                            {uniqueCourses.map((course, index) => (
                                <div key={index} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
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
                                        {course.term && (
                                            <span>Term: {course.term}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
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