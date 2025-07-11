import React, { useState, useEffect } from 'react';
import { X, Save, User, Mail, Phone, PhoneOff, Building, BuildingIcon, AlertCircle, CheckCircle, BookUser } from 'lucide-react';
import { doc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';
import { DEFAULT_PERSON_SCHEMA } from '../utils/dataHygiene';

const MissingDataReviewModal = ({ isOpen, onClose, onDataUpdated, missingDataType = 'email' }) => {
  const [records, setRecords] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResults, setSaveResults] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadMissingDataRecords();
      if (missingDataType === 'program' || missingDataType === 'all') {
        loadPrograms();
      }
    }
  }, [isOpen, missingDataType]);

  const loadPrograms = async () => {
    try {
      const programsSnapshot = await getDocs(collection(db, COLLECTIONS.PROGRAMS));
      const programsData = programsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPrograms(programsData);
    } catch (error) {
      console.error("Error loading programs:", error);
    }
  };

  const loadMissingDataRecords = async () => {
    setIsLoading(true);
    try {
      const peopleSnapshot = await getDocs(collection(db, 'people'));
      const people = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      let missingRecords = [];
      switch (missingDataType) {
        case 'email':
          missingRecords = people.filter(person => !person.email || person.email.trim() === '');
          break;
        case 'phone':
          missingRecords = people.filter(person => 
            (!person.phone || person.phone.trim() === '') && !person.hasNoPhone
          );
          break;
        case 'office':
          missingRecords = people.filter(person => 
            (!person.office || person.office.trim() === '') && !person.hasNoOffice
          );
          break;
        case 'jobTitle':
          missingRecords = people.filter(person => !person.jobTitle || person.jobTitle.trim() === '');
          break;
        case 'program':
          missingRecords = people.filter(p => {
            const roles = p.roles || [];
            const isFaculty = Array.isArray(roles) ? roles.includes('faculty') : !!roles.faculty;
            return isFaculty && !p.programId;
          });
          break;
        default:
          // Identify any record where at least one schema field is "empty"
          missingRecords = people.filter(person => {
            return Object.keys(DEFAULT_PERSON_SCHEMA).some(key => {
              // Skip timestamps and boolean flags when checking for emptiness
              if (['createdAt', 'updatedAt', 'isAdjunct', 'isFullTime', 'isTenured', 'isUPD', 'hasNoPhone', 'hasNoOffice', 'isActive', 'roles', 'department', 'programId'].includes(key)) {
                return false;
              }

              // Special handling for fields with corresponding "hasNo..." flags
              if (key === 'phone') {
                return (!person.phone || person.phone.trim() === '') && !person.hasNoPhone;
              }
              if (key === 'office') {
                return (!person.office || person.office.trim() === '') && !person.hasNoOffice;
              }

              const value = person[key];
              if (value === undefined || value === null) return true;
              if (typeof value === 'string') return value.trim() === '';
              if (Array.isArray(value)) return value.length === 0;
              return false;
            });
          });
      }

      setRecords(missingRecords);
    } catch (error) {
      console.error('Error loading missing data records:', error);
      alert('Error loading records: ' + error.message);
    }
    setIsLoading(false);
  };

  const startEditing = (record) => {
    setEditingRecord({
      ...record,
      newEmail: record.email || '',
      newPhone: record.phone || '',
      newOffice: record.office || '',
      newJobTitle: record.jobTitle || '',
      newTitle: record.title || '',
      newProgramId: record.programId || '',
      newHasNoPhone: record.hasNoPhone || false,
      newHasNoOffice: record.hasNoOffice || false
    });
  };

  const cancelEditing = () => {
    setEditingRecord(null);
  };

  const togglePhoneState = () => {
    if (!editingRecord) return;
    const newHasNoPhone = !editingRecord.newHasNoPhone;
    setEditingRecord(prev => ({
      ...prev,
      newHasNoPhone,
      newPhone: newHasNoPhone ? '' : prev.newPhone
    }));
  };

  const toggleOfficeState = () => {
    if (!editingRecord) return;
    const newHasNoOffice = !editingRecord.newHasNoOffice;
    setEditingRecord(prev => ({
      ...prev,
      newHasNoOffice,
      newOffice: newHasNoOffice ? '' : prev.newOffice
    }));
  };

  const saveRecord = async () => {
    if (!editingRecord) return;

    setIsSaving(true);
    try {
      const updates = {
        updatedAt: new Date().toISOString()
      };

      // Only update fields that have new values or flags
      if (editingRecord.newEmail.trim()) {
        updates.email = editingRecord.newEmail.trim().toLowerCase();
      }
      
      // Handle phone field with hasNoPhone flag
      if (editingRecord.newHasNoPhone) {
        updates.hasNoPhone = true;
        updates.phone = '';
      } else if (editingRecord.newPhone.trim()) {
        updates.phone = editingRecord.newPhone.replace(/\D/g, '');
        updates.hasNoPhone = false;
      }
      
      // Handle office field with hasNoOffice flag
      if (editingRecord.newHasNoOffice) {
        updates.hasNoOffice = true;
        updates.office = '';
      } else if (editingRecord.newOffice.trim()) {
        updates.office = editingRecord.newOffice.trim();
        updates.hasNoOffice = false;
      }
      
      if (editingRecord.newJobTitle.trim()) {
        updates.jobTitle = editingRecord.newJobTitle.trim();
      }
      if (editingRecord.newTitle.trim()) {
        updates.title = editingRecord.newTitle.trim();
      }
      if (editingRecord.newProgramId) {
        updates.programId = editingRecord.newProgramId;
      }

      await updateDoc(doc(db, 'people', editingRecord.id), updates);

      // Update local state
      setRecords(prev => prev.map(record => 
        record.id === editingRecord.id 
          ? { ...record, ...updates }
          : record
      ));

      setEditingRecord(null);
      setSaveResults({ success: true, message: 'Record updated successfully' });
      
      // Call parent callback
      if (onDataUpdated) {
        onDataUpdated();
      }

    } catch (error) {
      console.error('Error saving record:', error);
      setSaveResults({ success: false, message: 'Failed to save: ' + error.message });
    }
    setIsSaving(false);
  };

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone) => {
    const phoneDigits = phone.replace(/\D/g, '');
    return phoneDigits.length === 10;
  };

  const getFieldIcon = (type) => {
    switch (type) {
      case 'email': return <Mail className="w-4 h-4" />;
      case 'phone': return <Phone className="w-4 h-4" />;
      case 'office': return <Building className="w-4 h-4" />;
      case 'jobTitle': return <User className="w-4 h-4" />;
      case 'program': return <BookUser className="w-4 h-4" />;
      default: return <User className="w-4 h-4" />;
    }
  };

  const getFieldLabel = (type) => {
    switch (type) {
      case 'email': return 'Email Address';
      case 'phone': return 'Phone Number';
      case 'office': return 'Office Location';
      case 'jobTitle': return 'Job Title';
      case 'program': return 'Program Assignment';
      default: return 'Contact Information';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-2">
            {getFieldIcon(missingDataType)}
            <h2 className="text-xl font-semibold text-gray-900">
              Review Missing {getFieldLabel(missingDataType)}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {saveResults && (
            <div className={`mb-4 p-3 rounded-lg ${
              saveResults.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              <div className="flex items-center">
                {saveResults.success ? 
                  <CheckCircle className="w-4 h-4 mr-2" /> : 
                  <AlertCircle className="w-4 h-4 mr-2" />
                }
                {saveResults.message}
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading records...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">All Set!</h3>
              <p className="text-gray-600">
                No records are missing {getFieldLabel(missingDataType).toLowerCase()}.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="mb-4">
                <p className="text-gray-600">
                  Found <span className="font-medium">{records.length}</span> records missing {getFieldLabel(missingDataType).toLowerCase()}. 
                  Review each record and add the missing information.
                </p>
              </div>

              {records.map((record) => (
                <div key={record.id} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">
                        {record.firstName} {record.lastName}
                      </h4>
                      <p className="text-sm text-gray-600">
                        {record.jobTitle || 'No job title'}
                      </p>
                      <p className="text-sm text-gray-500">
                        Email: {record.email || 'Missing'} • 
                        Phone: {record.hasNoPhone ? 'No phone' : (record.phone || 'Missing')} • 
                        Office: {record.hasNoOffice ? 'No office' : (record.office || 'Missing')}
                      </p>
                    </div>
                    
                    {editingRecord?.id === record.id ? (
                      <div className="ml-4 space-y-3 min-w-80">
                        {(missingDataType === 'email' || missingDataType === 'all') && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Email Address
                            </label>
                            <input
                              type="email"
                              value={editingRecord.newEmail}
                              onChange={(e) => setEditingRecord(prev => ({ ...prev, newEmail: e.target.value }))}
                              className={`w-full px-3 py-2 border rounded-lg ${
                                editingRecord.newEmail && !validateEmail(editingRecord.newEmail)
                                  ? 'border-red-300 focus:border-red-500'
                                  : 'border-gray-300 focus:border-blue-500'
                              } focus:outline-none focus:ring-2 focus:ring-blue-200`}
                              placeholder="email@baylor.edu"
                            />
                            {editingRecord.newEmail && !validateEmail(editingRecord.newEmail) && (
                              <p className="text-red-600 text-xs mt-1">Please enter a valid email address</p>
                            )}
                          </div>
                        )}
                        
                        {(missingDataType === 'phone' || missingDataType === 'all') && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Phone Number
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="tel"
                                value={editingRecord.newPhone}
                                onChange={(e) => setEditingRecord(prev => ({ ...prev, newPhone: e.target.value }))}
                                disabled={editingRecord.newHasNoPhone}
                                className={`flex-1 px-3 py-2 border rounded-lg ${
                                  editingRecord.newPhone && !validatePhone(editingRecord.newPhone)
                                    ? 'border-red-300 focus:border-red-500'
                                    : 'border-gray-300 focus:border-blue-500'
                                } focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100 disabled:text-gray-500`}
                                placeholder="(254) 710-1234"
                              />
                              <button
                                type="button"
                                onClick={togglePhoneState}
                                className={`p-2 rounded transition-colors ${
                                  editingRecord.newHasNoPhone 
                                    ? 'text-red-600 bg-red-100 hover:bg-red-200' 
                                    : 'text-gray-400 hover:bg-gray-100'
                                }`}
                                title={editingRecord.newHasNoPhone ? 'Mark as having no phone' : 'Mark as having phone'}
                              >
                                {editingRecord.newHasNoPhone ? <PhoneOff size={16} /> : <Phone size={16} />}
                              </button>
                            </div>
                            {editingRecord.newPhone && !validatePhone(editingRecord.newPhone) && !editingRecord.newHasNoPhone && (
                              <p className="text-red-600 text-xs mt-1">Please enter a 10-digit phone number</p>
                            )}
                            {editingRecord.newHasNoPhone && (
                              <p className="text-gray-600 text-xs mt-1">This person is marked as not having a phone number</p>
                            )}
                          </div>
                        )}
                        
                        {(missingDataType === 'office' || missingDataType === 'all') && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Office Location
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editingRecord.newOffice}
                                onChange={(e) => setEditingRecord(prev => ({ ...prev, newOffice: e.target.value }))}
                                disabled={editingRecord.newHasNoOffice}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100 disabled:text-gray-500"
                                placeholder="Building Room#"
                              />
                              <button
                                type="button"
                                onClick={toggleOfficeState}
                                className={`p-2 rounded transition-colors ${
                                  editingRecord.newHasNoOffice 
                                    ? 'text-red-600 bg-red-100 hover:bg-red-200' 
                                    : 'text-gray-400 hover:bg-gray-100'
                                }`}
                                title={editingRecord.newHasNoOffice ? 'Mark as having no office' : 'Mark as having office'}
                              >
                                {editingRecord.newHasNoOffice ? <BuildingIcon size={16} className="opacity-50" /> : <Building size={16} />}
                              </button>
                            </div>
                            {editingRecord.newHasNoOffice && (
                              <p className="text-gray-600 text-xs mt-1">This person is marked as not having an office</p>
                            )}
                          </div>
                        )}
                        
                        {(missingDataType === 'jobTitle' || missingDataType === 'all') && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Job Title
                            </label>
                            <input
                              type="text"
                              value={editingRecord.newJobTitle}
                              onChange={(e) => setEditingRecord(prev => ({ ...prev, newJobTitle: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                              placeholder="Professor, Lecturer, etc."
                            />
                          </div>
                        )}

                        {(missingDataType === 'program' || missingDataType === 'all') && programs.length > 0 && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Program
                            </label>
                            <select
                              value={editingRecord.newProgramId}
                              onChange={(e) => setEditingRecord(prev => ({ ...prev, newProgramId: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            >
                              <option value="">Select a program...</option>
                              {programs.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {(missingDataType === 'all') && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Title (e.g., Dr., Mr., Ms.)
                            </label>
                            <input
                              type="text"
                              value={editingRecord.newTitle}
                              onChange={(e) => setEditingRecord(prev => ({ ...prev, newTitle: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                              placeholder="Dr."
                            />
                          </div>
                        )}
                        
                        <div className="flex space-x-2">
                          <button
                            onClick={saveRecord}
                            disabled={isSaving}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center"
                          >
                            <Save className="w-4 h-4 mr-2" />
                            {isSaving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEditing}
                            disabled={isSaving}
                            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditing(record)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Add Missing Info
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-6">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MissingDataReviewModal; 