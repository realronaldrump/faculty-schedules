import React, { useState } from 'react';
import { Upload, RotateCcw, FileText, CheckCircle, AlertCircle, X, ArrowLeft } from 'lucide-react';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

const DataImportPage = ({ 
  onNavigate, 
  facultyData, 
  onFacultyUpdate
}) => {
  const [csvData, setCsvData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [importResults, setImportResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [preImportState, setPreImportState] = useState([]);
  const [canUndo, setCanUndo] = useState(false);
  const [importType, setImportType] = useState('faculty'); // 'faculty' or 'schedule'

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type === "text/csv") {
      setFileName(file.name);
      setCanUndo(false);
      setImportResults(null);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        // Simple CSV parsing
        const lines = text.split('\n');
        const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const data = lines.slice(1).map(line => {
          // Handle commas inside quoted fields
          const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
          let obj = {};
          header.forEach((h, i) => {
            obj[h] = (values[i] || '').trim().replace(/"/g, '');
          });
          return obj;
        }).filter(obj => {
          // Filter out empty rows based on import type
          if (importType === 'faculty') {
            return obj['Last Name'] || obj['First Name'] || obj['Name'];
          } else {
            return obj['Instructor'] || obj['Course'] || obj['Day'];
          }
        });
        
        setCsvData(data);
      };
      reader.readAsText(file);
    } else {
      alert("Please upload a valid CSV file.");
    }
  };

  const findMatchingFaculty = (csvRow) => {
    const csvEmail = csvRow['E-mail Address'] || csvRow['Email'];
    const csvFirstName = csvRow['First Name'] || '';
    const csvLastName = csvRow['Last Name'] || '';
    const csvName = csvRow['Name'] || `${csvFirstName} ${csvLastName}`.trim();

    // Strategy 1: Match by email (most reliable)
    if (csvEmail) {
      const match = facultyData.find(f => f.email && f.email.toLowerCase() === csvEmail.toLowerCase());
      if (match) return match;
    }

    // Strategy 2: Match by full name
    if (csvName) {
      const match = facultyData.find(f => f.name && f.name.toLowerCase() === csvName.toLowerCase());
      if (match) return match;
    }

    // Strategy 3: Match by name parts (LastName, FirstName format)
    if (csvLastName && csvFirstName) {
      const match = facultyData.find(f => {
        if (!f.name) return false;
        const nameParts = f.name.split(',').map(n => n.trim());
        if (nameParts.length >= 2) {
          const [facultyLastName, facultyFirstName] = nameParts;
          if (facultyLastName.toLowerCase() !== csvLastName.toLowerCase()) {
            return false;
          }
          // Handle cases like "Brian K." vs "Brian"
          return facultyFirstName.toLowerCase().startsWith(csvFirstName.toLowerCase()) || 
                 csvFirstName.toLowerCase().startsWith(facultyFirstName.toLowerCase());
        }
        return false;
      });
      if (match) return match;
    }

    return null;
  };

  const handleFacultyImport = async () => {
    if (!csvData) {
      alert("No CSV data to import.");
      return;
    }
    
    setIsLoading(true);
    setImportResults(null);
    setCanUndo(false);

    let updatedCount = 0;
    let createdCount = 0;
    let skippedCount = 0;
    const skipped = [];
    const changedRecords = [];

    const relevantColumns = {
      'E-mail Address': 'email',
      'Email': 'email',
      'Phone Number 1': 'phone',
      'Phone': 'phone',
      'Job Title': 'jobTitle',
      'Title': 'jobTitle',
      'Office': 'office'
    };

    // Check for duplicates in CSV itself
    const csvEmailMap = new Map();
    const csvNameMap = new Map();
    
    for (const row of csvData) {
      const csvFirstName = row['First Name'] || '';
      const csvLastName = row['Last Name'] || '';
      const csvName = row['Name'] || `${csvFirstName} ${csvLastName}`.trim();
      const csvEmail = row['E-mail Address'] || row['Email'] || '';
      
      if (!csvName) continue;

      // Check for duplicates in CSV
      if (csvEmail && csvEmailMap.has(csvEmail.toLowerCase())) {
        skippedCount++;
        skipped.push(`${csvName} (duplicate email in CSV: ${csvEmail})`);
        continue;
      }
      
      if (csvNameMap.has(csvName.toLowerCase())) {
        skippedCount++;
        skipped.push(`${csvName} (duplicate name in CSV)`);
        continue;
      }

      if (csvEmail) csvEmailMap.set(csvEmail.toLowerCase(), true);
      csvNameMap.set(csvName.toLowerCase(), true);

      const facultyToUpdate = findMatchingFaculty(row);

      if (facultyToUpdate) {
        const updates = {};
        let hasUpdate = false;

        for (const csvCol in relevantColumns) {
          const dbField = relevantColumns[csvCol];
          const csvValue = row[csvCol];

          if (csvValue && facultyToUpdate[dbField] !== csvValue) {
            updates[dbField] = csvValue;
            hasUpdate = true;
          }
        }
        
        if (hasUpdate) {
          changedRecords.push({ ...facultyToUpdate });
          await onFacultyUpdate({ ...facultyToUpdate, ...updates });
          updatedCount++;
        } else {
          skippedCount++;
          skipped.push(`${csvName} (no changes needed)`);
        }
      } else {
        // Create new faculty member
        const newFaculty = {
          name: csvName,
          email: csvEmail,
          phone: row['Phone Number 1'] || row['Phone'] || '',
          jobTitle: row['Job Title'] || row['Title'] || '',
          office: row['Office'] || '',
          isAdjunct: false,
          isAlsoStaff: false
        };
        
        try {
          await onFacultyUpdate(newFaculty);
          createdCount++;
        } catch (error) {
          skippedCount++;
          skipped.push(`${csvName} (error: ${error.message})`);
        }
      }
    }
    
    setPreImportState(changedRecords);
    setImportResults({ updatedCount, createdCount, skippedCount, skipped, type: 'faculty' });
    if (updatedCount > 0 || createdCount > 0) {
      setCanUndo(true);
    }
    setIsLoading(false);
  };

  const handleScheduleImport = async () => {
    if (!csvData) {
      alert("No CSV data to import.");
      return;
    }
    
    setIsLoading(true);
    setImportResults(null);
    setCanUndo(false);

    let createdCount = 0;
    let errorCount = 0;
    const errors = [];

    try {
      for (const row of csvData) {
        const instructor = row['Instructor'] || row['instructor'];
        const courseCode = row['Course'] || row['course'];
        const courseTitle = row['Course Title'] || row['courseTitle'] || '';
        const day = row['Day'] || row['day'];
        const startTime = row['Start Time'] || row['startTime'];
        const endTime = row['End Time'] || row['endTime'];
        const roomName = row['Room'] || row['room'];

        if (!courseCode || !day || !startTime || !endTime) {
          errorCount++;
          errors.push(`Missing required fields for course: ${courseCode || 'Unknown'}`);
          continue;
        }

        try {
          // Create the schedule entry with simple structure
          const scheduleData = {
            Instructor: instructor || 'Staff',
            Course: courseCode,
            'Course Title': courseTitle,
            Day: day,
            'Start Time': startTime,
            'End Time': endTime,
            Room: roomName || '',
            semester: 'Fall 2025'
          };

          await addDoc(collection(db, 'schedules'), scheduleData);
          createdCount++;

        } catch (error) {
          errorCount++;
          errors.push(`Error processing ${courseCode}: ${error.message}`);
        }
      }
    } catch (error) {
      console.error('Schedule import error:', error);
      errorCount++;
      errors.push(`General import error: ${error.message}`);
    }

    setImportResults({ 
      createdCount, 
      errorCount, 
      errors: errors.slice(0, 10), // Show first 10 errors
      type: 'schedule' 
    });
    setIsLoading(false);
  };

  const handleImport = async () => {
    if (importType === 'faculty') {
      await handleFacultyImport();
    } else {
      await handleScheduleImport();
    }
  };

  const handleUndoImport = async () => {
    if (preImportState.length === 0) {
      alert("No import to undo.");
      return;
    }
    
    setIsUndoing(true);
    for (const originalRecord of preImportState) {
      await onFacultyUpdate(originalRecord);
    }
    setIsUndoing(false);
    setCanUndo(false);
    setPreImportState([]);
    setImportResults(prev => ({ ...prev, undone: true, updatedCount: 0, createdCount: 0 }));
  };

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <button 
        onClick={() => onNavigate('dashboard')}
        className="flex items-center text-baylor-green hover:text-baylor-green/80 transition-colors font-medium"
      >
        <ArrowLeft size={20} className="mr-2" />
        Back to Dashboard
      </button>

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Data Import Utility</h1>
        <p className="text-gray-600">Upload CSV files to update faculty information or import schedule data</p>
      </div>

      {/* Import Type Selection */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-serif font-semibold text-baylor-green mb-4">Import Type</h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              name="importType"
              value="faculty"
              checked={importType === 'faculty'}
              onChange={(e) => setImportType(e.target.value)}
              className="mr-2 text-baylor-green focus:ring-baylor-green"
            />
            <span className="font-medium">Faculty Information</span>
            <span className="ml-2 text-sm text-gray-500">Update contact details and job information</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="importType"
              value="schedule"
              checked={importType === 'schedule'}
              onChange={(e) => setImportType(e.target.value)}
              className="mr-2 text-baylor-green focus:ring-baylor-green"
            />
            <span className="font-medium">Schedule Data</span>
            <span className="ml-2 text-sm text-gray-500">Import course schedules and room assignments</span>
          </label>
        </div>
      </div>

      {/* Main Import Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        {/* File Upload Section */}
        <div className="mb-8">
          <h2 className="text-lg font-serif font-semibold text-baylor-green mb-4 flex items-center">
            <FileText className="mr-2 text-baylor-gold" size={20} />
            File Upload
          </h2>
          
          <div className="relative">
            <label className="block w-full p-8 border-2 border-dashed border-gray-300 rounded-xl text-center cursor-pointer hover:border-baylor-green transition-colors group">
              <div className="space-y-4">
                <div className="mx-auto w-16 h-16 bg-baylor-green/10 rounded-full flex items-center justify-center group-hover:bg-baylor-green/20 transition-colors">
                  <Upload className="w-8 h-8 text-baylor-green" />
                </div>
                <div>
                  <p className="text-lg font-medium text-gray-900">
                    {fileName || "Choose a CSV file"}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Drag and drop your {importType} CSV file here, or click to browse
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    Supported format: CSV files only
                  </p>
                </div>
              </div>
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileChange} 
                className="sr-only" 
              />
            </label>
          </div>

          {fileName && (
            <div className="mt-4 p-4 bg-baylor-green/5 rounded-lg border border-baylor-green/20">
              <div className="flex items-center">
                <FileText className="w-5 h-5 text-baylor-green mr-3" />
                <div className="flex-1">
                  <p className="font-medium text-baylor-green">{fileName}</p>
                  <p className="text-sm text-gray-600">
                    {csvData ? `${csvData.length} records found` : 'Processing...'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setFileName('');
                    setCsvData(null);
                    setImportResults(null);
                    setCanUndo(false);
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Import Actions */}
        {csvData && (
          <div className="mb-8">
            <h2 className="text-lg font-serif font-semibold text-baylor-green mb-4">
              Import Actions
            </h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleImport}
                disabled={isLoading || isUndoing}
                className="px-6 py-3 bg-baylor-green text-white font-semibold rounded-lg hover:bg-baylor-green/90 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2" size={18} />
                    Import {importType === 'faculty' ? 'Faculty Data' : 'Schedule Data'} ({csvData.length} records)
                  </>
                )}
              </button>
              
              <div className="text-sm text-gray-600 flex items-center">
                <AlertCircle className="w-4 h-4 mr-2 text-amber-500" />
                {importType === 'faculty' 
                  ? 'This will update existing faculty records and create new ones as needed'
                  : 'This will create new schedule entries'
                }
              </div>
            </div>
          </div>
        )}

        {/* Results Section */}
        {importResults && (
          <div className="border-t border-gray-200 pt-8">
            <h2 className="text-lg font-serif font-semibold text-baylor-green mb-4">
              Import Results
            </h2>
            
            <div className={`p-6 rounded-xl border-2 ${
              importResults.undone 
                ? 'bg-blue-50 border-blue-200' 
                : 'bg-green-50 border-green-200'
            }`}>
              <div className="flex items-start">
                <div className={`p-2 rounded-full mr-4 ${
                  importResults.undone ? 'bg-blue-100' : 'bg-green-100'
                }`}>
                  <CheckCircle className={`w-6 h-6 ${
                    importResults.undone ? 'text-blue-600' : 'text-green-600'
                  }`} />
                </div>
                
                <div className="flex-1">
                  <h3 className={`font-semibold text-lg ${
                    importResults.undone ? 'text-blue-900' : 'text-green-900'
                  }`}>
                    Import {importResults.undone ? "Reverted" : "Completed Successfully"}
                  </h3>
                  
                  {importResults.undone ? (
                    <p className="text-blue-700 mt-1">
                      The previous import has been successfully undone. All changes have been reverted.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {importResults.type === 'faculty' ? (
                        <>
                          {importResults.updatedCount > 0 && (
                            <p className="text-green-700">
                              <span className="font-semibold">{importResults.updatedCount}</span> faculty records were updated with new information.
                            </p>
                          )}
                          {importResults.createdCount > 0 && (
                            <p className="text-green-700">
                              <span className="font-semibold">{importResults.createdCount}</span> new faculty records were created.
                            </p>
                          )}
                          {importResults.skippedCount > 0 && (
                            <p className="text-yellow-700">
                              <span className="font-semibold">{importResults.skippedCount}</span> records were skipped.
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          {importResults.createdCount > 0 && (
                            <p className="text-green-700">
                              <span className="font-semibold">{importResults.createdCount}</span> schedule entries were created.
                            </p>
                          )}
                        </>
                      )}
                      
                      {(importResults.skippedCount > 0 || importResults.errorCount > 0) && (
                        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="flex items-start">
                            <AlertCircle className="w-5 h-5 text-amber-600 mr-2 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-amber-800 font-medium">
                                {importResults.skippedCount || importResults.errorCount} records had issues:
                              </p>
                              <div className="mt-2 max-h-32 overflow-y-auto">
                                <ul className="text-sm text-amber-700 space-y-1">
                                  {(importResults.skipped || importResults.errors || []).map((item, index) => (
                                    <li key={index} className="flex items-center">
                                      <span className="w-2 h-2 bg-amber-400 rounded-full mr-2 flex-shrink-0"></span>
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Undo Action */}
            {canUndo && !importResults.undone && importResults.type === 'faculty' && (
              <div className="mt-6 text-center">
                <button
                  onClick={handleUndoImport}
                  disabled={isUndoing}
                  className="px-4 py-2 bg-gray-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center mx-auto"
                >
                  {isUndoing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Undoing Import...
                    </>
                  ) : (
                    <>
                      <RotateCcw size={16} className="mr-2" />
                      Undo Import
                    </>
                  )}
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  This will revert all changes made by the import
                </p>
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        {!csvData && !importResults && (
          <div className="border-t border-gray-200 pt-8">
            <h2 className="text-lg font-serif font-semibold text-baylor-green mb-4">
              Instructions
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              {importType === 'faculty' ? (
                <>
                  <div className="space-y-4">
                    <h3 className="font-medium text-gray-900">Faculty CSV Fields</h3>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-baylor-green rounded-full mr-3"></span>
                        Name or (First Name + Last Name)
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-baylor-green rounded-full mr-3"></span>
                        E-mail Address or Email
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-baylor-green rounded-full mr-3"></span>
                        Phone Number 1 or Phone
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-baylor-green rounded-full mr-3"></span>
                        Job Title or Title
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-baylor-green rounded-full mr-3"></span>
                        Office
                      </li>
                    </ul>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="font-medium text-gray-900">How Faculty Import Works</h3>
                    <ol className="space-y-2 text-sm text-gray-600">
                      <li className="flex">
                        <span className="flex-shrink-0 w-5 h-5 bg-baylor-green text-white rounded-full text-xs flex items-center justify-center mr-3">1</span>
                        Upload your CSV file with faculty information
                      </li>
                      <li className="flex">
                        <span className="flex-shrink-0 w-5 h-5 bg-baylor-green text-white rounded-full text-xs flex items-center justify-center mr-3">2</span>
                        System matches records by email or name
                      </li>
                      <li className="flex">
                        <span className="flex-shrink-0 w-5 h-5 bg-baylor-green text-white rounded-full text-xs flex items-center justify-center mr-3">3</span>
                        Contact information is updated or new records created
                      </li>
                    </ol>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-4">
                    <h3 className="font-medium text-gray-900">Schedule CSV Fields</h3>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-baylor-green rounded-full mr-3"></span>
                        Instructor (faculty name or "Staff")
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-baylor-green rounded-full mr-3"></span>
                        Course (course code)
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-baylor-green rounded-full mr-3"></span>
                        Course Title (optional)
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-baylor-green rounded-full mr-3"></span>
                        Day (M, T, W, R, F)
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-baylor-green rounded-full mr-3"></span>
                        Start Time & End Time
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-baylor-green rounded-full mr-3"></span>
                        Room (room name)
                      </li>
                    </ul>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="font-medium text-gray-900">How Schedule Import Works</h3>
                    <ol className="space-y-2 text-sm text-gray-600">
                      <li className="flex">
                        <span className="flex-shrink-0 w-5 h-5 bg-baylor-green text-white rounded-full text-xs flex items-center justify-center mr-3">1</span>
                        Upload your CSV file with schedule data
                      </li>
                      <li className="flex">
                        <span className="flex-shrink-0 w-5 h-5 bg-baylor-green text-white rounded-full text-xs flex items-center justify-center mr-3">2</span>
                        System creates schedule entries with the provided data
                      </li>
                      <li className="flex">
                        <span className="flex-shrink-0 w-5 h-5 bg-baylor-green text-white rounded-full text-xs flex items-center justify-center mr-3">3</span>
                        Data is available immediately in the application
                      </li>
                    </ol>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataImportPage;