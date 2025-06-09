import React from 'react';
import { X, Mail, Phone, Building } from 'lucide-react';

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

const FacultyContactCard = ({ faculty, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-sm w-full mx-4 relative" onClick={e => e.stopPropagation()}>
            <button onClick={onClose} className="absolute top-2 right-2 p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                <X size={20} />
            </button>
            <div className="text-center">
                <h3 className="text-2xl font-serif font-bold text-baylor-green">{faculty.name}</h3>
                {faculty.jobTitle && <p className="text-md text-gray-600">{faculty.jobTitle}</p>}
                <p className="text-md text-baylor-gold font-semibold">
                    {faculty.sourceCollection === 'staff' 
                        ? 'Staff'
                        : faculty.isAdjunct 
                            ? 'Adjunct Faculty' 
                            : 'Faculty'}
                </p>
            </div>
            <div className="mt-6 space-y-4">
                <div className="flex items-center">
                    <Mail size={18} className="text-baylor-green mr-4" />
                    <a href={`mailto:${faculty.email}`} className="text-gray-700 hover:underline">{faculty.email || 'Not specified'}</a>
                </div>
                <div className="flex items-center">
                    <Phone size={18} className="text-baylor-green mr-4" />
                    <span className="text-gray-700">{formatPhoneNumber(faculty.phone)}</span>
                </div>
                <div className="flex items-center">
                    <Building size={18} className="text-baylor-green mr-4" />
                    <span className="text-gray-700">{faculty.office || 'Not specified'}</span>
                </div>
            </div>
        </div>
    </div>
);

export default FacultyContactCard;