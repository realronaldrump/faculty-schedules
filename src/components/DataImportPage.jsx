import React, { useState } from 'react';
import { ArrowLeft, Upload, RotateCcw } from 'lucide-react';

const DataImportPage = ({ onNavigate, facultyData, onFacultyUpdate }) => {
  const [csvData, setCsvData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [importResults, setImportResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  
  // State for the undo functionality
  const [preImportState, setPreImportState] = useState([]);
  const [canUndo, setCanUndo] = useState(false);


  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type === "text/csv") {
      setFileName(file.name);
      setCanUndo(false); // Reset undo when a new file is selected
      setImportResults(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        // Simple CSV parsing
        const lines = text.split('\n');
        const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const data = lines.slice(1).map(line => {
          // This handles commas inside quoted fields by splitting only on commas outside of quotes.
          const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
          let obj = {};
          header.forEach((h, i) => {
            obj[h] = (values[i] || '').trim().replace(/"/g, '');
          });
          return obj;
        }).filter(obj => obj['Last Name'] || obj['First Name']); // Filter out empty rows
        setCsvData(data);
      };
      reader.readAsText(file);
    } else {
      alert("Please upload a valid CSV file.");
    }
  };

  const findMatchingFaculty = (csvRow) => {
    const csvEmail = csvRow['E-mail Address'];
    const csvFirstName = csvRow['First Name'] || '';
    const csvLastName = csvRow['Last Name'] || '';

    // Strategy 1: Match by email (most reliable)
    if (csvEmail) {
      const match = facultyData.find(f => f.email && f.email.toLowerCase() === csvEmail.toLowerCase());
      if (match) return match;
    }

    // Strategy 2: Match by name (LastName, FirstName)
    const match = facultyData.find(f => {
      if (!f.name) return false;
      const [facultyLastName, facultyFirstName] = f.name.split(',').map(n => n.trim());
      if (facultyLastName.toLowerCase() !== csvLastName.toLowerCase()) {
        return false;
      }
      // Handle cases like "Brian K." vs "Brian" by checking if one starts with the other
      return facultyFirstName.toLowerCase().startsWith(csvFirstName.toLowerCase()) || csvFirstName.toLowerCase().startsWith(facultyFirstName.toLowerCase());
    });

    return match;
  };


  const handleImport = async () => {
    if (!csvData) {
      alert("No CSV data to import.");
      return;
    }
    setIsLoading(true);
    setImportResults(null);
    setCanUndo(false);

    let updatedCount = 0;
    let notFoundCount = 0;
    const notFound = [];
    const changedRecords = [];

    const relevantColumns = {
      'E-mail Address': 'email',
      'Phone Number 1': 'phone',
      'Job Title': 'jobTitle'
    };

    for (const row of csvData) {
        if (!row['Last Name'] && !row['First Name']) continue;

        const facultyToUpdate = findMatchingFaculty(row);

        if (facultyToUpdate) {
            const updates = {};
            let hasUpdate = false;

            for(const csvCol in relevantColumns) {
                const dbField = relevantColumns[csvCol];
                const csvValue = row[csvCol];

                // Update only if the CSV has a value and it's different from the existing one.
                if (csvValue && facultyToUpdate[dbField] !== csvValue) {
                    updates[dbField] = csvValue;
                    hasUpdate = true;
                }
            }
            
            if(hasUpdate) {
                // Store the original record for undo
                changedRecords.push(facultyToUpdate);
                await onFacultyUpdate({ ...facultyToUpdate, ...updates });
                updatedCount++;
            }
        } else {
            notFoundCount++;
            notFound.push(`${row['First Name']} ${row['Last Name']}`);
        }
    }
    
    setPreImportState(changedRecords);
    setImportResults({ updatedCount, notFoundCount, notFound });
    if (updatedCount > 0) {
        setCanUndo(true);
    }
    setIsLoading(false);
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
    // Update results to reflect the undo
    setImportResults(prev => ({...prev, undone: true, updatedCount: 0}));
  }


  return (
    <div className="container mx-auto px-4 py-8">
      <button 
        onClick={() => onNavigate('dashboard')}
        className="flex items-center text-baylor-green hover:text-baylor-gold mb-6 transition-colors"
      >
        <ArrowLeft size={20} className="mr-2" />
        Back to Dashboard
      </button>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-serif font-bold text-baylor-green mb-2">Data Import Utility</h1>
        <p className="text-gray-600 mb-6">Upload a CSV file to update faculty contact information.</p>
        
        <div className="mb-6">
          <label className="block w-full p-6 border-2 border-dashed border-gray-300 rounded-lg text-center cursor-pointer hover:border-baylor-green">
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <span className="mt-2 block text-sm font-medium text-gray-900">{fileName || "Select a CSV file"}</span>
            <input type="file" accept=".csv" onChange={handleFileChange} className="sr-only" />
          </label>
        </div>

        {csvData && (
          <div className="text-center">
            <button
              onClick={handleImport}
              disabled={isLoading || isUndoing}
              className="px-6 py-3 bg-baylor-green text-white font-bold rounded-lg hover:bg-baylor-gold transition-colors disabled:bg-gray-400"
            >
              {isLoading ? 'Importing...' : 'Import Data'}
            </button>
          </div>
        )}

        {importResults && (
            <div className="mt-8 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-bold text-lg text-baylor-green">Import {importResults.undone ? "Reverted" : "Complete"}</h3>
                
                {importResults.undone ? (
                    <p className="text-blue-600">The previous import has been successfully undone.</p>
                ) : (
                    <p className="text-green-600">{importResults.updatedCount} faculty records updated.</p>
                )}

                {importResults.notFoundCount > 0 && (
                    <div className="mt-4">
                        <p className="text-red-600">{importResults.notFoundCount} faculty could not be matched:</p>
                        <ul className="text-sm text-gray-700 list-disc list-inside max-h-40 overflow-y-auto">
                            {importResults.notFound.map((name, i) => <li key={i}>{name}</li>)}
                        </ul>
                    </div>
                )}
                {canUndo && (
                    <div className="mt-4 text-center">
                        <button
                            onClick={handleUndoImport}
                            disabled={isUndoing}
                            className="px-4 py-2 bg-gray-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400 flex items-center justify-center mx-auto"
                        >
                            <RotateCcw size={16} className="mr-2"/>
                            {isUndoing ? 'Undoing Import...' : 'Undo Import'}
                        </button>
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};

export default DataImportPage;