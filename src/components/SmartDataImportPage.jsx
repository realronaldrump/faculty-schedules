import React, { useState } from 'react';
import { ArrowLeft, Upload, FileText, Users, Calendar, AlertCircle, CheckCircle, X, RotateCcw, Database, Trash2, UserCheck, UserX, Phone, PhoneOff, Building, BuildingIcon, History, Eye, Shield, Settings, RefreshCw } from 'lucide-react';
import { processDirectoryImport, processScheduleImport, cleanDirectoryData, determineRoles, createPersonModel, findMatchingPerson, parseCLSSCSV } from '../utils/dataImportUtils';
import { previewImportChanges, commitTransaction } from '../utils/importTransactionUtils';
import { analyzeCRNCoverage, backfillCRNData, reimportCRNFromCSV } from '../utils/crnMigrationUtils';
import ImportPreviewModal from './ImportPreviewModal';
import ImportHistoryModal from './ImportHistoryModal';
import DataDeduplicationManager from './DataDeduplicationManager';

import { collection, getDocs, doc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

const SmartDataImportPage = ({ onNavigate, showNotification, selectedSemester, availableSemesters, onSemesterDataImported }) => {
  const [csvData, setCsvData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [importType, setImportType] = useState('directory');
  const [isLoading, setIsLoading] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [showRoleAssignment, setShowRoleAssignment] = useState(false);
  const [processedPeople, setProcessedPeople] = useState([]);
  const [nameSort, setNameSort] = useState('firstName'); // 'firstName' or 'lastName'
  const [semesterWarning, setSemesterWarning] = useState(null);
  
  // New preview and rollback states
  const [previewTransaction, setPreviewTransaction] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  
  // Data deduplication states
  const [showDeduplication, setShowDeduplication] = useState(false);
  const [deduplicatedData, setDeduplicatedData] = useState(null);
  
  // CRN migration states
  const [crnAnalysis, setCrnAnalysis] = useState(null);
  const [isCrnAnalyzing, setIsCrnAnalyzing] = useState(false);
  const [isCrnMigrating, setIsCrnMigrating] = useState(false);
  const [crnMigrationResults, setCrnMigrationResults] = useState(null);

  // Check for semester mismatches in schedule data
  const checkSemesterMismatch = (data) => {
    if (!data || !Array.isArray(data) || data.length === 0) return null;
    
    // Extract terms from the data
    const detectedTerms = new Set();
    data.forEach(row => {
      if (row.Term && row.Term.trim()) {
        detectedTerms.add(row.Term.trim());
      }
    });
    
    const detectedTermsList = Array.from(detectedTerms);
    
    if (detectedTermsList.length === 0) return null;
    
    // Check if any detected terms don't match the selected semester
    const mismatchedTerms = detectedTermsList.filter(term => term !== selectedSemester);
    
    if (mismatchedTerms.length > 0) {
      return {
        detectedTerms: detectedTermsList,
        selectedSemester: selectedSemester,
        mismatchedTerms: mismatchedTerms,
        isNewSemester: detectedTermsList.every(term => !availableSemesters.includes(term))
      };
    }
    
    return null;
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type === "text/csv") {
      setFileName(file.name);
      setImportResults(null);
      setPreviewData(null);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        console.log('🔍 Raw CSV text preview:', text.substring(0, 500));
        
        try {
          // Check if this is a CLSS export format
          if (text.includes('CLSS ID') && text.includes('Instructor') && text.includes('Course')) {
            console.log('📚 Detected CLSS export format, using specialized parser...');
            const clssData = parseCLSSCSV(text);
            console.log('✅ CLSS parsing complete:', clssData.length, 'records');
            setCsvData(clssData);
            setPreviewData(clssData.slice(0, 5));
            
            // Check for semester mismatches
            const semesterMismatch = checkSemesterMismatch(clssData);
            setSemesterWarning(semesterMismatch);
            
            // Auto-select schedule import type for CLSS data
            setImportType('schedule');
            return;
          }
          
          // Standard CSV parsing for directory imports
          console.log('📋 Using standard CSV parser...');
          
          const parseCSVLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }
            
            // Add the last field
            result.push(current.trim());
            return result;
          };
          
          const lines = text.split('\n').filter(line => line.trim());
          const header = parseCSVLine(lines[0]).map(h => h.replace(/"/g, ''));
          console.log('📋 CSV Headers:', header);
          console.log('📊 Expected Job Title at index:', header.indexOf('Job Title'));
          
          const data = lines.slice(1).map((line, lineIndex) => {
            const values = parseCSVLine(line);
            let obj = {};
            
            header.forEach((h, i) => {
              obj[h] = (values[i] || '').replace(/"/g, '').trim();
            });
            
            // Debug logging for first few rows
            if (lineIndex < 3) {
              console.log(`📝 Row ${lineIndex + 1}:`, {
                name: `${obj['First Name']} ${obj['Last Name']}`,
                jobTitle: obj['Job Title'],
                emailType: obj['E-mail Type'],
                valuesLength: values.length,
                headerLength: header.length
              });
            }
            
            return obj;
          }).filter(obj => {
            // Filter out empty rows
            return obj['First Name'] || obj['Last Name'] || obj['E-mail Address'];
          });
          
          console.log('✅ Standard CSV parsing complete:', data.length, 'records');
          setCsvData(data);
          setPreviewData(data.slice(0, 5));
          
        } catch (error) {
          console.error('❌ CSV parsing error:', error);
          alert('Error parsing CSV file: ' + error.message);
        }
      };
      reader.readAsText(file);
    }
  };

  const validateImportType = () => {
    if (!csvData || csvData.length === 0) return false;
    
    const headers = Object.keys(csvData[0]);
    console.log('🔍 Validating import type:', importType, 'with headers:', headers.slice(0, 10));
    
    if (importType === 'directory') {
      // Check for directory CSV headers
      const requiredHeaders = ['First Name', 'Last Name', 'E-mail Address'];
      const hasRequiredHeaders = requiredHeaders.some(header => headers.includes(header));
      console.log('📋 Directory validation:', hasRequiredHeaders, 'required headers found:', requiredHeaders.filter(h => headers.includes(h)));
      return hasRequiredHeaders;
    } else if (importType === 'schedule') {
      // Check for CLSS CSV headers
      const requiredHeaders = ['Instructor', 'Course'];
      const hasRequiredHeaders = requiredHeaders.every(header => headers.includes(header));
      console.log('📚 Schedule validation:', hasRequiredHeaders, 'required headers found:', requiredHeaders.filter(h => headers.includes(h)));
      return hasRequiredHeaders;
    }
    
    return false;
  };

  const handleProcessData = async () => {
    if (!csvData || !validateImportType()) {
      alert('Invalid CSV format for selected import type');
      return;
    }

    setIsLoading(true);

    try {
      if (importType === 'schedule') {
        // For schedule imports, extract the semester from the CSV data itself
        let csvSemester = selectedSemester; // fallback to selected semester
        
        // Try to get semester from the first row of CSV data
        if (csvData.length > 0 && csvData[0].Term) {
          csvSemester = csvData[0].Term;
          console.log('🎓 Using semester from CSV data:', csvSemester);
        }
        
        // For schedule imports, use the new preview system
        const transaction = await previewImportChanges(csvData, importType, csvSemester);
        setPreviewTransaction(transaction);
        setShowPreviewModal(true);
      } else if (importType === 'directory') {
        // Process and prepare data for role assignment
        const { cleanedData, issues } = cleanDirectoryData(csvData);
        
        // Fetch existing people for duplicate detection
        const peopleSnapshot = await getDocs(collection(db, 'people'));
        const existingPeople = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const people = [];
        
        for (let index = 0; index < cleanedData.length; index++) {
          const row = cleanedData[index];
          const firstName = (row['First Name'] || '').trim();
          const lastName = (row['Last Name'] || '').trim();
          const email = (row['E-mail Address'] || '').trim();
          const jobTitle = (row['Job Title'] || '').trim();
          
          // Skip rows with no meaningful data
          if (!firstName && !lastName && !email) {
            continue;
          }
          
          // Check for duplicates
          const personData = { firstName, lastName, email };
          const match = await findMatchingPerson(personData, existingPeople);
          
          // Determine if this is a true duplicate with no new data
          let isDuplicateWithNoUpdates = false;
          if (match) {
            const existing = match.person;
            const hasNewData = (
              (jobTitle && jobTitle !== existing.jobTitle) ||
              ((row['Department'] || '').trim() && (row['Department'] || '').trim() !== existing.department) ||
              ((row['Office Location'] || '').trim() && (row['Office Location'] || '').trim() !== existing.office) ||
              ((row['Business Phone'] || row['Home Phone'] || '').trim() && 
               (row['Business Phone'] || row['Home Phone'] || '').replace(/\D/g, '') !== existing.phone) ||
              ((row['Title'] || '').trim() && (row['Title'] || '').trim() !== existing.title)
            );
            
            isDuplicateWithNoUpdates = !hasNewData;
          }
          
          // Skip exact duplicates with no new updates
          if (isDuplicateWithNoUpdates) {
            continue;
          }
          
          // Suggest roles based on job title
          const suggestedRoles = jobTitle ? determineRoles(jobTitle) : ['faculty'];
          const isAdjunctByTitle = jobTitle.toLowerCase().includes('adjunct');
          
          people.push({
            rowIndex: index,
            firstName,
            lastName,
            email,
            jobTitle: jobTitle || '',
            department: (row['Department'] || '').trim(),
            office: (row['Office Location'] || '').trim(),
            phone: (row['Business Phone'] || row['Home Phone'] || '').trim(),
            title: (row['Title'] || '').trim(),
            suggestedRoles,
            selectedRoles: [...suggestedRoles], // Default to suggested roles
            isAdjunct: isAdjunctByTitle,
            hasNoPhone: false,
            hasNoOffice: false,
            isIncluded: true, // Allow removal from import
            duplicateMatch: match,
            issues: issues.filter(issue => issue.rowIndex === index)
          });
        }
        
        setProcessedPeople(people);
        setShowRoleAssignment(true);
      } else if (importType === 'schedule') {
        // For schedules, import directly
        const results = await processScheduleImport(csvData);
        setImportResults(results);
        
        // If we imported new semester data, notify parent to refresh
        if (onSemesterDataImported && results.created > 0) {
          onSemesterDataImported();
        }
        
        if (showNotification) {
          if (results.errors.length > 0) {
            showNotification('error', `Schedule import completed with ${results.errors.length} errors`);
          } else {
            showNotification('success', `Successfully imported ${results.created} schedules`);
          }
        }
      }
    } catch (error) {
      console.error('Processing error:', error);
      alert('Error processing data: ' + error.message);
    }
    
    setIsLoading(false);
  };

  const handleFinalImport = async () => {
    setIsLoading(true);
    setImportResults(null);

    try {
      // Filter out people who are not included
      const includedPeople = processedPeople.filter(person => person.isIncluded);
      
      // Convert processed people back to import format
      const importData = includedPeople.map(person => ({
        'Title': person.title,
        'First Name': person.firstName,
        'Last Name': person.lastName,
        'E-mail Address': person.email,
        'Job Title': person.jobTitle,
        'Department': person.department,
        'Office Location': person.hasNoOffice ? '' : person.office,
        'Business Phone': person.hasNoPhone ? '' : person.phone
      }));

      // Custom import with role assignments
      const results = await processDirectoryImportWithRoles(importData, includedPeople);
      setImportResults(results);
      setShowRoleAssignment(false);
      setProcessedPeople([]);
      
      if (showNotification) {
        if (results.errors.length > 0) {
          showNotification('error', `Import completed with ${results.errors.length} errors`);
        } else {
          showNotification('success', `Successfully imported ${results.created} new and updated ${results.updated} existing people`);
        }
      }
    } catch (error) {
      console.error('Import error:', error);
      setImportResults({
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [`Import failed: ${error.message}`]
      });
      
      if (showNotification) {
        showNotification('error', 'Import failed: ' + error.message);
      }
    }
    
    setIsLoading(false);
  };

  // Custom import function with individual role assignments
  const processDirectoryImportWithRoles = async (csvData, peopleWithRoles) => {
    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      warnings: [],
      people: []
    };

    // Fetch existing people
    const peopleSnapshot = await getDocs(collection(db, 'people'));
    const existingPeople = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const personRoles = peopleWithRoles[i];
      
      try {
        const firstName = (row['First Name'] || '').trim();
        const lastName = (row['Last Name'] || '').trim();
        const email = (row['E-mail Address'] || '').trim();
        
        if (!firstName && !lastName && !email) {
          results.skipped++;
          continue;
        }

        // Create person data with assigned roles and special flags
        const personData = createPersonModel({
          firstName,
          lastName,
          title: (row['Title'] || '').trim(),
          email,
          phone: personRoles.hasNoPhone ? '' : (row['Business Phone'] || row['Home Phone'] || '').trim(),
          jobTitle: (row['Job Title'] || '').trim(),
          department: (row['Department'] || '').trim(),
          office: personRoles.hasNoOffice ? '' : (row['Office Location'] || '').trim(),
          roles: personRoles.selectedRoles,
          isAdjunct: personRoles.isAdjunct,
          isFullTime: !personRoles.isAdjunct, // All adjuncts are part-time
          isTenured: personRoles.isTenured || false,
          hasNoPhone: personRoles.hasNoPhone,
          hasNoOffice: personRoles.hasNoOffice
        });

        // Find matching person
        const match = await findMatchingPerson(personData, existingPeople);

        if (match) {
          // Update existing person with merged roles
          const updates = {
            ...personData,
            updatedAt: new Date().toISOString(),
            roles: [...new Set([...match.person.roles, ...personData.roles])]
          };

          await updateDoc(doc(db, 'people', match.person.id), updates);
          results.updated++;
          results.people.push({ ...updates, id: match.person.id });
        } else {
          // Create new person
          const docRef = await addDoc(collection(db, 'people'), personData);
          results.created++;
          results.people.push({ ...personData, id: docRef.id });
          existingPeople.push({ ...personData, id: docRef.id });
        }

      } catch (error) {
        results.errors.push(`Row ${i + 1}: Error processing ${row['First Name']} ${row['Last Name']}: ${error.message}`);
      }
    }

    return results;
  };

  const updatePersonRole = (personIndex, role, checked) => {
    setProcessedPeople(prevPeople => 
      prevPeople.map((person, index) => {
        if (index === personIndex) {
          const newRoles = checked 
            ? [...person.selectedRoles, role]
            : person.selectedRoles.filter(r => r !== role);
          return { ...person, selectedRoles: newRoles };
        }
        return person;
      })
    );
  };

  const updatePersonProperty = (personIndex, property, value) => {
    setProcessedPeople(prevPeople => 
      prevPeople.map((person, index) => {
        if (index === personIndex) {
          const updates = { [property]: value };
          
          // Handle adjunct logic: all adjuncts are part-time
          if (property === 'isAdjunct' && value) {
            updates.isFullTime = false;
          }
          
          return { ...person, ...updates };
        }
        return person;
      })
    );
  };

  const togglePersonInclusion = (personIndex) => {
    setProcessedPeople(prevPeople => 
      prevPeople.map((person, index) => 
        index === personIndex 
          ? { ...person, isIncluded: !person.isIncluded }
          : person
      )
    );
  };

  const sortProcessedPeople = (people) => {
    return [...people].sort((a, b) => {
      if (nameSort === 'firstName') {
        const firstNameComparison = a.firstName.localeCompare(b.firstName);
        return firstNameComparison !== 0 ? firstNameComparison : a.lastName.localeCompare(b.lastName);
      } else {
        const lastNameComparison = a.lastName.localeCompare(b.lastName);
        return lastNameComparison !== 0 ? lastNameComparison : a.firstName.localeCompare(b.firstName);
      }
    });
  };

  const resetImport = () => {
    setCsvData(null);
    setFileName('');
    setImportResults(null);
    setPreviewData(null);
    setShowRoleAssignment(false);
    setProcessedPeople([]);
    setNameSort('firstName');
    setSemesterWarning(null);
    setPreviewTransaction(null);
    setShowPreviewModal(false);
  };

  // Handle committing the preview transaction
  const handleCommitTransaction = async (transactionId, selectedChanges = null) => {
    setIsCommitting(true);
    
    try {
      const result = await commitTransaction(transactionId, selectedChanges);
      
      // Close the preview modal
      setShowPreviewModal(false);
      setPreviewTransaction(null);
      
      // Show success notification
      if (showNotification) {
        const stats = result.getSummary().stats;
        const totalChanges = stats.totalChanges;
        showNotification('success', `Successfully imported ${totalChanges} changes`);
      }
      
      // If we imported new semester data, notify parent to refresh
      if (onSemesterDataImported && result.getSummary().stats.schedulesAdded > 0) {
        console.log('🔄 Notifying parent of new semester data:', result.getSummary().semester);
        onSemesterDataImported();
      }
      
      // Refresh the data display
      handleDataRefresh();
      
    } catch (error) {
      console.error('Error committing transaction:', error);
      if (showNotification) {
        showNotification('error', 'Import failed: ' + error.message);
      }
    }
    
    setIsCommitting(false);
  };

  // Handle canceling the preview
  const handleCancelPreview = () => {
    setShowPreviewModal(false);
    setPreviewTransaction(null);
  };

  // Handle data refresh after rollback
  const handleDataRefresh = () => {
    if (onSemesterDataImported) {
      onSemesterDataImported();
    }
  };

  // Handle deduplication processing
  const handleDataProcessed = (cleanData) => {
    console.log('✅ Deduplication complete:', cleanData);
    setDeduplicatedData(cleanData);
    setShowDeduplication(false);
    
    if (showNotification) {
      const totalEntities = Object.values(cleanData).reduce((sum, arr) => sum + arr.length, 0);
      showNotification('success', `Data deduplication complete! Processed ${totalEntities} entities.`);
    }
  };

  const startDeduplication = () => {
    if (!csvData || csvData.length === 0) {
      alert('Please upload and process CLSS export data first');
      return;
    }
    if (importType !== 'schedule') {
      alert('Data deduplication is only available for CLSS schedule imports');
      return;
    }
    setShowDeduplication(true);
  };

  // CRN Migration Functions
  const analyzeCRN = async () => {
    setIsCrnAnalyzing(true);
    try {
      const analysis = await analyzeCRNCoverage();
      setCrnAnalysis(analysis);
      if (showNotification) {
        showNotification('info', `CRN Analysis: ${analysis.coveragePercentage}% coverage (${analysis.withCRN}/${analysis.total} records)`);
      }
    } catch (error) {
      console.error('CRN analysis error:', error);
      if (showNotification) {
        showNotification('error', 'Failed to analyze CRN coverage: ' + error.message);
      }
    }
    setIsCrnAnalyzing(false);
  };

  const handleCRNBackfill = async (useCSVData = false) => {
    if (!crnAnalysis || crnAnalysis.recordsNeedingCRN.length === 0) {
      if (showNotification) {
        showNotification('info', 'No records need CRN backfill');
      }
      return;
    }

    setIsCrnMigrating(true);
    try {
      let results;
      
      if (useCSVData && csvData) {
        // Use reimport method with current CSV data
        results = await reimportCRNFromCSV(csvData);
        setCrnMigrationResults(results);
        
        if (showNotification) {
          showNotification('success', `CRN Re-import: Updated ${results.updated} records from CSV data`);
        }
      } else {
        // Use backfill method
        results = await backfillCRNData();
        setCrnMigrationResults(results);
        
        if (showNotification) {
          showNotification('success', `CRN Backfill: Updated ${results.updated} records`);
        }
      }
      
      // Refresh analysis
      await analyzeCRN();
    } catch (error) {
      console.error('CRN migration error:', error);
      if (showNotification) {
        showNotification('error', 'Failed to migrate CRN data: ' + error.message);
      }
    }
    setIsCrnMigrating(false);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="border-b border-gray-200 pb-6 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <button
              onClick={() => onNavigate('dashboard')}
              className="flex items-center text-baylor-green hover:text-baylor-green/80 transition-colors font-medium"
            >
              <ArrowLeft className="mr-2" size={20} />
              Dashboard
            </button>
            <div className="border-l border-gray-300 pl-6">
              <h1 className="text-3xl font-bold text-baylor-green mb-2">Data Import Management</h1>
              <p className="text-gray-600 text-lg">Advanced import capabilities with preview, selective application, and rollback protection</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm"
            >
              <History className="w-4 h-4" />
              <span className="font-medium">Import History</span>
            </button>
            <div className="flex items-center space-x-2 px-4 py-2.5 bg-baylor-green/10 border border-baylor-green/20 rounded-lg">
              <Database className="w-4 h-4 text-baylor-green" />
              <span className="text-sm text-baylor-green font-semibold">Unified Data Model</span>
            </div>
          </div>
        </div>
      </div>

      {/* Features Overview */}
      <div className="bg-gradient-to-r from-baylor-green/5 to-baylor-gold/5 border border-baylor-green/20 rounded-xl p-8 mb-8 shadow-sm">
        <div className="flex items-center mb-6">
          <div className="bg-baylor-green/10 p-3 rounded-lg mr-4">
            <Shield className="w-6 h-6 text-baylor-green" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-baylor-green">Smart Import System</h2>
            <p className="text-baylor-green/70">Enterprise-grade data management with comprehensive safeguards</p>
          </div>
        </div>
        <div className="grid md:grid-cols-4 gap-6">
          <div className="bg-white/80 rounded-lg p-4 border border-gray-100">
            <div className="flex items-center mb-3">
              <Eye className="w-5 h-5 text-baylor-green mr-2" />
              <h3 className="font-semibold text-baylor-green">Preview Changes</h3>
            </div>
            <p className="text-gray-700 text-sm">Review all modifications before database commitment</p>
          </div>
          <div className="bg-white/80 rounded-lg p-4 border border-gray-100">
            <div className="flex items-center mb-3">
              <CheckCircle className="w-5 h-5 text-baylor-green mr-2" />
              <h3 className="font-semibold text-baylor-green">Selective Import</h3>
            </div>
            <p className="text-gray-700 text-sm">Apply only the changes you approve</p>
          </div>
          <div className="bg-white/80 rounded-lg p-4 border border-gray-100">
            <div className="flex items-center mb-3">
              <RotateCcw className="w-5 h-5 text-baylor-green mr-2" />
              <h3 className="font-semibold text-baylor-green">Complete Rollback</h3>
            </div>
            <p className="text-gray-700 text-sm">Reverse entire imports with transaction history</p>
          </div>
          <div className="bg-white/80 rounded-lg p-4 border border-gray-100">
            <div className="flex items-center mb-3">
              <Database className="w-5 h-5 text-baylor-green mr-2" />
              <h3 className="font-semibold text-baylor-green">Data Integrity</h3>
            </div>
            <p className="text-gray-700 text-sm">Zero data loss with comprehensive audit trails</p>
          </div>
        </div>
      </div>

      {/* Import Type Selection */}
      <div className="mb-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-baylor-green mb-2">Select Import Type</h2>
          <p className="text-gray-600">Choose the type of data you want to import into the system</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div 
            className={`border-2 rounded-xl p-8 cursor-pointer transition-all shadow-sm hover:shadow-md ${
              importType === 'directory' 
                ? 'border-baylor-green bg-baylor-green/5 shadow-md' 
                : 'border-gray-200 hover:border-baylor-green/50 bg-white'
            }`}
            onClick={() => setImportType('directory')}
          >
            <div className="flex items-center mb-4">
              <div className={`p-3 rounded-lg mr-4 ${
                importType === 'directory' ? 'bg-baylor-green/10' : 'bg-gray-100'
              }`}>
                <Users className={`w-7 h-7 ${
                  importType === 'directory' ? 'text-baylor-green' : 'text-gray-600'
                }`} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Directory Import</h3>
                <p className="text-sm text-gray-500">Personnel Management</p>
              </div>
            </div>
            <p className="text-gray-700 mb-4 leading-relaxed">
              Import personnel data to create and update unified people records with role assignments and contact information.
            </p>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-gray-700 mb-1">Required Columns:</div>
              <div className="text-xs text-gray-600">
                Title, First Name, Last Name, E-mail Address, Job Title, Department, Office Location, Business Phone
              </div>
            </div>
          </div>

          <div 
            className={`border-2 rounded-xl p-8 cursor-pointer transition-all shadow-sm hover:shadow-md ${
              importType === 'schedule' 
                ? 'border-baylor-green bg-baylor-green/5 shadow-md' 
                : 'border-gray-200 hover:border-baylor-green/50 bg-white'
            }`}
            onClick={() => setImportType('schedule')}
          >
            <div className="flex items-center mb-4">
              <div className={`p-3 rounded-lg mr-4 ${
                importType === 'schedule' ? 'bg-baylor-green/10' : 'bg-gray-100'
              }`}>
                <Calendar className={`w-7 h-7 ${
                  importType === 'schedule' ? 'text-baylor-green' : 'text-gray-600'
                }`} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">CLSS Schedule Import</h3>
                <p className="text-sm text-gray-500">Course Management</p>
              </div>
            </div>
            <p className="text-gray-700 mb-4 leading-relaxed">
              Import course schedules from CLSS exports with automatic instructor matching and schedule optimization.
            </p>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-gray-700 mb-1">Required Columns:</div>
              <div className="text-xs text-gray-600">
                Instructor, Course, Course Title, Section #, Meeting Pattern, Room, Term, Credit Hrs
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* File Upload */}
      <div className="mb-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-baylor-green mb-2">Upload Data File</h2>
          <p className="text-gray-600">Select a CSV file to import into the system</p>
        </div>
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center bg-gray-50/50 hover:bg-gray-50 transition-colors">
          <div className="bg-white rounded-lg p-4 inline-block mb-4 shadow-sm">
            <Upload className="w-8 h-8 text-baylor-green mx-auto" />
          </div>
          <div>
            <label className="cursor-pointer">
              <span className="text-xl font-semibold text-gray-700 hover:text-baylor-green transition-colors">
                Select CSV File
              </span>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            <p className="text-gray-500 mt-3">Supported format: CSV files (.csv)</p>
            <p className="text-sm text-gray-400 mt-1">Maximum file size: 10MB</p>
          </div>
          {fileName && (
            <div className="mt-6 inline-flex items-center px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-green-700">
              <CheckCircle className="w-5 h-5 mr-2" />
              <span className="font-medium">{fileName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Data Preview */}
      {previewData && (
        <div className="mb-8">
          <h2 className="text-lg font-serif font-semibold text-baylor-green mb-4">Data Preview</h2>
          <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
            <p className="text-sm text-gray-600 mb-3">
              First 5 rows of {csvData.length} total records:
            </p>
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b">
                  {/* Show specific key columns based on import type */}
                  {importType === 'directory' ? (
                    <>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">First Name</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Last Name</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">E-mail Address</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Job Title</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Department</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">E-mail Type</th>
                    </>
                  ) : importType === 'schedule' ? (
                    <>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Course</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Course Title</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">CRN</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Instructor</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Meeting Pattern</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Room</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Term</th>
                    </>
                  ) : (
                    Object.keys(previewData[0] || {}).slice(0, 6).map(header => (
                      <th key={header} className="text-left py-2 px-3 font-medium text-gray-700">
                        {header}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-200">
                    {importType === 'directory' ? (
                      <>
                        <td className="py-2 px-3 text-gray-800 max-w-32 truncate">{row['First Name']}</td>
                        <td className="py-2 px-3 text-gray-800 max-w-32 truncate">{row['Last Name']}</td>
                        <td className="py-2 px-3 text-gray-800 max-w-32 truncate">{row['E-mail Address']}</td>
                        <td className="py-2 px-3 text-gray-800 max-w-32 truncate font-medium">
                          {row['Job Title'] || <span className="text-red-500 text-xs">Not specified</span>}
                        </td>
                        <td className="py-2 px-3 text-gray-800 max-w-32 truncate">{row['Department']}</td>
                        <td className="py-2 px-3 text-gray-800 max-w-32 truncate text-gray-500">
                          {row['E-mail Type']}
                        </td>
                      </>
                    ) : importType === 'schedule' ? (
                      <>
                        <td className="py-2 px-3 text-gray-800 max-w-32 truncate font-medium">{row['Course']}</td>
                        <td className="py-2 px-3 text-gray-800 max-w-40 truncate">{row['Course Title'] || row['Long Title']}</td>
                        <td className="py-2 px-3 text-gray-800 max-w-24 truncate text-xs font-medium">{row['CRN'] || 'N/A'}</td>
                        <td className="py-2 px-3 text-gray-800 max-w-32 truncate">{row['Instructor']}</td>
                        <td className="py-2 px-3 text-gray-800 max-w-32 truncate text-xs">{row['Meeting Pattern']}</td>
                        <td className="py-2 px-3 text-gray-800 max-w-24 truncate">{row['Room']}</td>
                        <td className="py-2 px-3 text-gray-800 max-w-20 truncate">{row['Term']}</td>
                      </>
                    ) : (
                      Object.values(row).slice(0, 6).map((value, vidx) => (
                        <td key={vidx} className="py-2 px-3 text-gray-800 max-w-32 truncate">
                          {value}
                        </td>
                      ))
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Validation Status */}
          <div className="mt-4">
            {validateImportType() ? (
              <div className="flex items-center p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600 mr-3 flex-shrink-0" />
                <span className="text-green-800 font-medium">
                  CSV format is compatible with {importType} import
                </span>
              </div>
            ) : (
              <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 mr-3 flex-shrink-0" />
                <span className="text-red-800 font-medium">
                  CSV format doesn't match expected {importType} headers
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Semester Warning */}
      {semesterWarning && (
        <div className="mb-8">
          <div className={`p-4 rounded-lg border-l-4 ${
            semesterWarning.isNewSemester 
              ? 'bg-blue-50 border-blue-400' 
              : 'bg-yellow-50 border-yellow-400'
          }`}>
            <div className="flex items-start">
              <div className={`flex-shrink-0 w-5 h-5 mt-0.5 ${
                semesterWarning.isNewSemester ? 'text-blue-400' : 'text-yellow-400'
              }`}>
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="ml-3">
                <h3 className={`text-sm font-medium ${
                  semesterWarning.isNewSemester ? 'text-blue-800' : 'text-yellow-800'
                }`}>
                  {semesterWarning.isNewSemester ? 'New Semester Detected' : 'Semester Mismatch Warning'}
                </h3>
                <div className={`mt-2 text-sm ${
                  semesterWarning.isNewSemester ? 'text-blue-700' : 'text-yellow-700'
                }`}>
                  {semesterWarning.isNewSemester ? (
                    <div>
                      <p>This data contains a new semester: <strong>{semesterWarning.detectedTerms.join(', ')}</strong></p>
                      <p className="mt-1">After importing, you'll be able to switch between semesters using the semester selector in the header.</p>
                    </div>
                  ) : (
                    <div>
                      <p>
                        You're currently viewing <strong>{semesterWarning.selectedSemester}</strong>, but this data contains: <strong>{semesterWarning.mismatchedTerms.join(', ')}</strong>
                      </p>
                      <p className="mt-1">
                        After importing, make sure to switch to the correct semester using the selector in the header to view this data.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Actions */}
      {csvData && validateImportType() && (
        <div className="mb-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-baylor-green mb-2">Import Processing</h2>
            <p className="text-gray-600">Process your data with advanced validation and preview capabilities</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleProcessData}
                  disabled={isLoading}
                  className="px-8 py-3 bg-baylor-green text-white font-semibold rounded-lg hover:bg-baylor-green/90 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center shadow-sm hover:shadow-md"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      {importType === 'schedule' ? <Eye className="mr-3" size={18} /> : <Upload className="mr-3" size={18} />}
                      {importType === 'directory' ? 'Review & Assign Roles' : 'Preview Changes'}
                      <span className="ml-2 px-2 py-1 bg-white/20 rounded text-sm">
                        {csvData.length} records
                      </span>
                    </>
                  )}
                </button>
                
                {importType === 'schedule' && csvData && (
                  <button
                    onClick={startDeduplication}
                    className="px-6 py-3 bg-baylor-gold text-baylor-green font-semibold rounded-lg hover:bg-baylor-gold/90 transition-all flex items-center shadow-sm hover:shadow-md"
                  >
                    <Database className="mr-2" size={18} />
                    Detect Duplicates
                  </button>
                )}
                
                <button
                  onClick={resetImport}
                  className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all flex items-center"
                >
                  <RotateCcw className="mr-2" size={16} />
                  Reset
                </button>
              </div>
              
              <div className="flex items-center text-sm text-gray-600 bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
                <Shield className="w-4 h-4 mr-2 text-blue-600" />
                <span className="font-medium">Smart processing with duplicate detection and intelligent matching</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CRN Data Management */}
      <div className="mb-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-baylor-green mb-2">CRN Data Management</h2>
          <p className="text-gray-600">Analyze and maintain course reference number data integrity</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-6">
          <div className="flex items-start">
            <div className="bg-amber-100 p-2 rounded-lg mr-4 flex-shrink-0">
              <Settings className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-amber-900 font-semibold mb-2">Data Hygiene & Migration Tools</h3>
              <p className="text-amber-800">
                Analyze CRN coverage across schedule records and perform intelligent backfill operations to ensure data consistency and completeness.
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <button
            onClick={analyzeCRN}
            disabled={isCrnAnalyzing}
                            className="px-6 py-3 bg-baylor-gold text-baylor-green font-semibold rounded-lg hover:bg-baylor-gold/90 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
          >
            {isCrnAnalyzing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Analyzing...
              </>
            ) : (
              <>
                <Database className="mr-2" size={18} />
                Analyze CRN Coverage
              </>
            )}
          </button>
          
          {crnAnalysis && (
            <>
              <button
                onClick={() => handleCRNBackfill(false)}
                disabled={isCrnMigrating || crnAnalysis.recordsNeedingCRN.length === 0}
                className="px-6 py-3 bg-baylor-green text-white font-semibold rounded-lg hover:bg-baylor-green/90 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
              >
                {isCrnMigrating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Migrating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2" size={18} />
                    Smart Backfill ({crnAnalysis.recordsNeedingCRN.length})
                  </>
                )}
              </button>
              
              {csvData && importType === 'schedule' && (
                <button
                  onClick={() => handleCRNBackfill(true)}
                  disabled={isCrnMigrating}
                  className="px-6 py-3 bg-baylor-gold text-baylor-green font-semibold rounded-lg hover:bg-baylor-gold/90 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
                >
                  {isCrnMigrating ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Re-importing...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2" size={18} />
                      Re-import from Current CSV
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
        
        {/* CRN Analysis Results */}
        {crnAnalysis && (
          <div className="mt-6 bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-md font-semibold text-gray-900 mb-3">CRN Coverage Analysis</h3>
            <div className="grid md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-baylor-green">{crnAnalysis.coveragePercentage}%</div>
                <div className="text-sm text-gray-600">Coverage</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-baylor-green">{crnAnalysis.withCRN}</div>
                <div className="text-sm text-gray-600">With CRN</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{crnAnalysis.missingCRN + crnAnalysis.emptyCRN}</div>
                <div className="text-sm text-gray-600">Missing CRN</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">{crnAnalysis.total}</div>
                <div className="text-sm text-gray-600">Total Records</div>
              </div>
            </div>
            
            {crnAnalysis.duplicateCRNs.length > 0 && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center mb-2">
                  <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                  <h4 className="font-semibold text-red-800">Duplicate CRNs Detected</h4>
                </div>
                <div className="text-sm text-red-700">
                  {crnAnalysis.duplicateCRNs.length} CRN(s) are used by multiple records. This may indicate data integrity issues that require attention.
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Migration Results */}
        {crnMigrationResults && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-md font-semibold text-blue-900 mb-2">Migration Results</h3>
            <div className="text-sm text-blue-800">
              <p>Processed: {crnMigrationResults.processed} records</p>
              <p>Updated: {crnMigrationResults.updated} records</p>
              {crnMigrationResults.matched !== undefined && <p>Matched from CSV: {crnMigrationResults.matched} records</p>}
              {crnMigrationResults.errors && crnMigrationResults.errors.length > 0 && (
                <p className="text-red-600">Errors: {crnMigrationResults.errors.length}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Role Assignment Review */}
      {showRoleAssignment && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-serif font-semibold text-baylor-green">Review & Configure Import</h2>
            <div className="flex items-center gap-4">
              {/* Name Sort Options */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">Sort by:</span>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                  <button
                    onClick={() => setNameSort('firstName')}
                    className={`px-3 py-1 text-xs ${
                      nameSort === 'firstName' 
                        ? 'bg-baylor-green text-white' 
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    First Name
                  </button>
                  <button
                    onClick={() => setNameSort('lastName')}
                    className={`px-3 py-1 text-xs ${
                      nameSort === 'lastName' 
                        ? 'bg-baylor-green text-white' 
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Last Name
                  </button>
                </div>
              </div>
              <div className="text-sm text-gray-600">
                {processedPeople.filter(p => p.isIncluded).length} of {processedPeople.length} people selected
              </div>
            </div>
          </div>
          
                  <div className="bg-baylor-green/5 border border-baylor-green/20 rounded-xl p-6 mb-6">
          <div className="flex items-start">
            <div className="bg-baylor-green/10 p-2 rounded-lg mr-4 flex-shrink-0">
              <Settings className="w-5 h-5 text-baylor-green" />
            </div>
            <div>
              <h3 className="text-baylor-green font-semibold mb-2">Advanced Import Configuration</h3>
              <p className="text-baylor-green/80">
                Configure individual records before import: manage inclusion status, assign roles, set adjunct classification, and handle missing contact information. 
                Duplicate records with no new data are automatically filtered out.
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-3 text-center text-sm font-medium text-gray-700">Include</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Job Title</th>
                    <th className="px-3 py-3 text-center text-sm font-medium text-gray-700">Faculty</th>
                    <th className="px-3 py-3 text-center text-sm font-medium text-gray-700">Staff</th>
                    <th className="px-3 py-3 text-center text-sm font-medium text-gray-700">Adjunct</th>
                    <th className="px-3 py-3 text-center text-sm font-medium text-gray-700">No Phone</th>
                    <th className="px-3 py-3 text-center text-sm font-medium text-gray-700">No Office</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sortProcessedPeople(processedPeople).map((person, index) => {
                    const originalIndex = processedPeople.findIndex(p => p.rowIndex === person.rowIndex);
                    const isExcluded = !person.isIncluded;
                    
                    return (
                      <tr 
                        key={person.rowIndex} 
                        className={`${isExcluded ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}`}
                      >
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => togglePersonInclusion(originalIndex)}
                            className={`p-1 rounded ${
                              person.isIncluded 
                                ? 'text-green-600 hover:bg-green-100' 
                                : 'text-red-500 hover:bg-red-100'
                            }`}
                            title={person.isIncluded ? 'Remove from import' : 'Include in import'}
                          >
                            {person.isIncluded ? <UserCheck size={16} /> : <UserX size={16} />}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">
                            {person.firstName} {person.lastName}
                          </div>
                          {person.title && (
                            <div className="text-sm text-gray-500">{person.title}</div>
                          )}
                          {person.email && (
                            <div className="text-xs text-gray-400">{person.email}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {person.jobTitle || '-'}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={person.selectedRoles.includes('faculty')}
                            onChange={(e) => updatePersonRole(originalIndex, 'faculty', e.target.checked)}
                            disabled={isExcluded}
                            className="w-4 h-4 text-baylor-green border-gray-300 rounded focus:ring-baylor-green disabled:opacity-50"
                          />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={person.selectedRoles.includes('staff')}
                            onChange={(e) => updatePersonRole(originalIndex, 'staff', e.target.checked)}
                            disabled={isExcluded}
                            className="w-4 h-4 text-baylor-green border-gray-300 rounded focus:ring-baylor-green disabled:opacity-50"
                          />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={person.isAdjunct}
                            onChange={(e) => updatePersonProperty(originalIndex, 'isAdjunct', e.target.checked)}
                            disabled={isExcluded || !person.selectedRoles.includes('faculty')}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                            title="Adjunct faculty are automatically part-time"
                          />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => updatePersonProperty(originalIndex, 'hasNoPhone', !person.hasNoPhone)}
                            disabled={isExcluded}
                            className={`p-1 rounded transition-colors disabled:opacity-50 ${
                              person.hasNoPhone 
                                ? 'text-red-600 bg-red-100 hover:bg-red-200' 
                                : 'text-gray-400 hover:bg-gray-100'
                            }`}
                            title={person.hasNoPhone ? 'Has no phone number' : 'Has phone number'}
                          >
                            {person.hasNoPhone ? <PhoneOff size={16} /> : <Phone size={16} />}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => updatePersonProperty(originalIndex, 'hasNoOffice', !person.hasNoOffice)}
                            disabled={isExcluded}
                            className={`p-1 rounded transition-colors disabled:opacity-50 ${
                              person.hasNoOffice 
                                ? 'text-red-600 bg-red-100 hover:bg-red-200' 
                                : 'text-gray-400 hover:bg-gray-100'
                            }`}
                            title={person.hasNoOffice ? 'Has no office' : 'Has office'}
                          >
                            {person.hasNoOffice ? <BuildingIcon size={16} className="opacity-50" /> : <Building size={16} />}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex flex-col gap-1">
                            {person.duplicateMatch && (
                              <div className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                                Update existing ({person.duplicateMatch.confidence} confidence)
                              </div>
                            )}
                            {person.isAdjunct && (
                              <div className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                Part-time
                              </div>
                            )}
                            {person.issues.length > 0 && (
                              <div className="space-y-1">
                                {person.issues.slice(0, 2).map((issue, idx) => (
                                  <div 
                                    key={idx} 
                                    className={`text-xs px-2 py-1 rounded flex items-center ${
                                      issue.fixed 
                                        ? 'bg-green-100 text-green-800' 
                                        : 'bg-red-100 text-red-800'
                                    }`}
                                  >
                                    {issue.fixed ? 
                                      <CheckCircle className="w-3 h-3 mr-1" /> : 
                                      <AlertCircle className="w-3 h-3 mr-1" />
                                    } 
                                    {issue.issue.substring(0, 30)}...
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="flex gap-4 mt-4">
            <button
              onClick={handleFinalImport}
              disabled={isLoading}
              className="px-6 py-3 bg-baylor-green text-white font-semibold rounded-lg hover:bg-baylor-green/90 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Importing...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2" size={18} />
                  Import {processedPeople.length} People
                </>
              )}
            </button>
            
            <button
              onClick={() => setShowRoleAssignment(false)}
              className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Import Results */}
      {importResults && (
        <div className="mb-8">
          <h2 className="text-lg font-serif font-semibold text-baylor-green mb-4">Import Results</h2>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            
            {/* Summary */}
            <div className="bg-gray-50 px-6 py-4 border-b">
              <h3 className="font-medium text-gray-900 mb-3">Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center">
                                  <div className="text-2xl font-bold text-baylor-green">{importResults.created}</div>
                <div className="text-sm text-gray-600">Created</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-baylor-gold">{importResults.updated}</div>
                <div className="text-sm text-gray-600">Updated</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">{importResults.skipped}</div>
                  <div className="text-sm text-gray-600">Skipped</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-amber-600">
                    {importResults.warnings ? importResults.warnings.length : 0}
                  </div>
                  <div className="text-sm text-gray-600">Warnings</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{importResults.errors.length}</div>
                  <div className="text-sm text-gray-600">Errors</div>
                </div>
              </div>
            </div>

            {/* Warnings */}
            {importResults.warnings && importResults.warnings.length > 0 && (
              <div className="px-6 py-4 border-b">
                <h4 className="font-medium text-amber-800 mb-2 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Warnings ({importResults.warnings.length})
                </h4>
                <div className="space-y-1">
                  {importResults.warnings.slice(0, 10).map((warning, idx) => (
                    <div key={idx} className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded">
                      {warning}
                    </div>
                  ))}
                  {importResults.warnings.length > 10 && (
                    <div className="text-sm text-gray-500 italic">
                      ... and {importResults.warnings.length - 10} more warnings
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Errors */}
            {importResults.errors.length > 0 && (
              <div className="px-6 py-4 border-b">
                <h4 className="font-medium text-red-800 mb-2 flex items-center">
                  <X className="w-4 h-4 mr-2" />
                  Errors ({importResults.errors.length})
                </h4>
                <div className="space-y-1">
                  {importResults.errors.slice(0, 10).map((error, idx) => (
                    <div key={idx} className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded">
                      {error}
                    </div>
                  ))}
                  {importResults.errors.length > 10 && (
                    <div className="text-sm text-gray-500 italic">
                      ... and {importResults.errors.length - 10} more errors
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Success Message */}
            {(importResults.created > 0 || importResults.updated > 0) && (
              <div className="px-6 py-4">
                <div className="flex items-center text-green-700 bg-green-50 px-4 py-3 rounded-lg">
                  <CheckCircle className="w-5 h-5 mr-3 flex-shrink-0" />
                  <div>
                    <div className="font-medium">Import completed successfully!</div>
                    <div className="text-sm">
                      {importType === 'directory' 
                        ? 'People records have been created/updated in the unified collection.'
                        : 'Schedule records have been created with proper instructor references.'
                      }
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* System Overview */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-8 border border-gray-200">
        <div className="flex items-center mb-6">
          <div className="bg-baylor-green/10 p-3 rounded-lg mr-4">
            <Database className="w-6 h-6 text-baylor-green" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-baylor-green">System Architecture</h2>
            <p className="text-gray-600">Understanding the unified data model and import capabilities</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex items-center mb-4">
              <Users className="w-5 h-5 text-baylor-green mr-2" />
              <h3 className="font-bold text-gray-900">People Collection</h3>
            </div>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="flex items-start">
                <div className="w-2 h-2 bg-baylor-green rounded-full mt-2 mr-3 flex-shrink-0"></div>
                <span>Unified storage for all personnel data</span>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-baylor-green rounded-full mt-2 mr-3 flex-shrink-0"></div>
                <span>Intelligent role determination (faculty/staff)</span>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-baylor-green rounded-full mt-2 mr-3 flex-shrink-0"></div>
                <span>Email-based duplicate detection</span>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-baylor-green rounded-full mt-2 mr-3 flex-shrink-0"></div>
                <span>Automated name parsing and normalization</span>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-baylor-green rounded-full mt-2 mr-3 flex-shrink-0"></div>
                <span>Job title classification system</span>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex items-center mb-4">
              <Calendar className="w-5 h-5 text-baylor-green mr-2" />
              <h3 className="font-bold text-gray-900">Schedules Collection</h3>
            </div>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="flex items-start">
                <div className="w-2 h-2 bg-baylor-green rounded-full mt-2 mr-3 flex-shrink-0"></div>
                <span>ID-based instructor references</span>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-baylor-green rounded-full mt-2 mr-3 flex-shrink-0"></div>
                <span>Structured meeting pattern parsing</span>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-baylor-green rounded-full mt-2 mr-3 flex-shrink-0"></div>
                <span>Complex time format support</span>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-baylor-green rounded-full mt-2 mr-3 flex-shrink-0"></div>
                <span>Automatic instructor matching</span>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-baylor-green rounded-full mt-2 mr-3 flex-shrink-0"></div>
                <span>Duplicate schedule prevention</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data Deduplication Manager */}
      {showDeduplication && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-serif font-bold text-baylor-green">Data Deduplication Analysis</h2>
                <button
                  onClick={() => setShowDeduplication(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>
              <DataDeduplicationManager
                rawData={csvData}
                onDataProcessed={handleDataProcessed}
              />
            </div>
          </div>
        </div>
      )}

      {/* Deduplication Results Display */}
      {deduplicatedData && (
        <div className="mb-8">
          <h2 className="text-lg font-serif font-semibold text-baylor-green mb-4">Deduplication Results</h2>
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">{deduplicatedData.professors?.length || 0}</div>
                <div className="text-sm text-gray-600">Professors</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{deduplicatedData.courses?.length || 0}</div>
                <div className="text-sm text-gray-600">Courses</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">{deduplicatedData.sections?.length || 0}</div>
                <div className="text-sm text-gray-600">Sections</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">{deduplicatedData.departments?.length || 0}</div>
                <div className="text-sm text-gray-600">Departments</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-cyan-600">{deduplicatedData.rooms?.length || 0}</div>
                <div className="text-sm text-gray-600">Rooms</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-pink-600">{deduplicatedData.terms?.length || 0}</div>
                <div className="text-sm text-gray-600">Terms</div>
              </div>
            </div>
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                <p className="text-green-800 font-semibold">Data processing completed successfully</p>
              </div>
              <p className="text-green-700 text-sm mt-2">Duplicates have been identified and removed. You can now proceed with the import or run additional analysis.</p>
            </div>
          </div>
        </div>
      )}

      {/* Import Preview Modal */}
      {showPreviewModal && previewTransaction && (
        <ImportPreviewModal
          transaction={previewTransaction}
          onClose={handleCancelPreview}
          onCommit={handleCommitTransaction}
          onCancel={handleCancelPreview}
          isCommitting={isCommitting}
        />
      )}

      {/* Import History Modal */}
      {showHistoryModal && (
        <ImportHistoryModal
          onClose={() => setShowHistoryModal(false)}
          showNotification={showNotification}
          onDataRefresh={handleDataRefresh}
        />
      )}


    </div>
  );
};

export default SmartDataImportPage; 