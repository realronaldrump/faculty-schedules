import React, { useState, useEffect } from 'react';
import { ArrowLeft, AlertTriangle, Users, Merge, Trash2, CheckCircle, X } from 'lucide-react';
import { collection, getDocs, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

const DatabaseCleanup = ({ onNavigate }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [duplicates, setDuplicates] = useState({ people: [] });
  const [results, setResults] = useState(null);


  const analyzeDatabase = async () => {
    setIsAnalyzing(true);
    setDuplicates({ people: [] });

    try {
      console.log('🔍 Analyzing normalized database for duplicates...');
      
      // Analyze people collection for duplicates
      const peopleSnapshot = await getDocs(collection(db, 'people'));
      const peopleData = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const peopleDuplicates = findDuplicates(peopleData);

      setDuplicates({
        people: peopleDuplicates
      });

      console.log(`Found ${peopleDuplicates.length} people duplicate groups`);

    } catch (error) {
      console.error('Error analyzing database:', error);
      alert('Error analyzing database: ' + error.message);
    }
    
    setIsAnalyzing(false);
  };

  const findDuplicates = (data) => {
    const groups = new Map();
    
    data.forEach(person => {
      // Create keys for different types of potential duplicates
      const emailKey = person.email ? `email:${person.email.toLowerCase()}` : null;
      const nameKey = person.name ? `name:${person.name.toLowerCase().trim()}` : null;
      
      // Create full name for comparison
      const fullName = `${person.firstName || ''} ${person.lastName || ''}`.trim();
      const fullNameKey = fullName ? `fullName:${fullName.toLowerCase()}` : null;
      
      // Group by email first (most reliable)
      if (emailKey && person.email.trim() !== '') {
        if (!groups.has(emailKey)) {
          groups.set(emailKey, []);
        }
        groups.get(emailKey).push(person);
      }
      // Then group by full name for those without email or with different emails
      else if (fullNameKey) {
        if (!groups.has(fullNameKey)) {
          groups.set(fullNameKey, []);
        }
        groups.get(fullNameKey).push(person);
      }
    });

    // Also check for full name duplicates even if emails exist but are different
    const nameGroups = new Map();
    data.forEach(person => {
      const fullName = `${person.firstName || ''} ${person.lastName || ''}`.trim();
      if (fullName) {
        const nameKey = fullName.toLowerCase();
        if (!nameGroups.has(nameKey)) {
          nameGroups.set(nameKey, []);
        }
        nameGroups.get(nameKey).push(person);
      }
    });

    // Merge both groupings
    nameGroups.forEach((people, key) => {
      if (people.length > 1) {
        const nameKey = `fullName:${key}`;
        if (!groups.has(nameKey)) {
          groups.set(nameKey, people);
        }
      }
    });

    // Return only groups with more than one person
    return Array.from(groups.values()).filter(group => group.length > 1);
  };

  const mergeDuplicates = async () => {
    setIsProcessing(true);
    setResults(null);

    try {
      let totalMerged = 0;
      let totalDeleted = 0;
      const errors = [];

      const duplicateGroups = duplicates.people;
      
      for (const group of duplicateGroups) {
        try {
          const result = await mergeDuplicateGroup(group, 'people');
          totalMerged += result.merged;
          totalDeleted += result.deleted;
        } catch (error) {
          errors.push(`Error merging people group: ${error.message}`);
        }
      }

      setResults({
        totalMerged,
        totalDeleted,
        errors,
        success: errors.length === 0
      });

      // Re-analyze to show updated state
      setTimeout(() => {
        analyzeDatabase();
      }, 1000);

    } catch (error) {
      console.error('Error during merge process:', error);
      setResults({
        totalMerged: 0,
        totalDeleted: 0,
        errors: [error.message],
        success: false
      });
    }

    setIsProcessing(false);
  };

  const mergeDuplicateGroup = async (group, collectionName) => {
    if (group.length < 2) return { merged: 0, deleted: 0 };

    // Choose the "primary" record (most complete data)
    const primary = group.reduce((best, current) => {
      const bestScore = Object.values(best).filter(v => v && v !== '').length;
      const currentScore = Object.values(current).filter(v => v && v !== '').length;
      
      // Prefer newer records if data completeness is similar
      if (Math.abs(bestScore - currentScore) <= 1) {
        return (current.updatedAt || current.createdAt || '') > (best.updatedAt || best.createdAt || '') ? current : best;
      }
      
      return currentScore > bestScore ? current : best;
    });

    // Merge data from all records
    const mergedData = { ...primary };
    group.forEach(record => {
      Object.keys(record).forEach(key => {
        if (key !== 'id' && (!mergedData[key] || mergedData[key] === '')) {
          mergedData[key] = record[key];
        }
      });
    });

    // Add merge metadata
    mergedData.mergedAt = new Date().toISOString();
    mergedData.mergedFrom = group.filter(r => r.id !== primary.id).map(r => r.id);

    // Update the primary record
    await updateDoc(doc(db, collectionName, primary.id), mergedData);

    // Delete the duplicate records
    const duplicatesToDelete = group.filter(r => r.id !== primary.id);
    const batch = writeBatch(db);
    
    duplicatesToDelete.forEach(duplicate => {
      batch.delete(doc(db, collectionName, duplicate.id));
    });
    
    await batch.commit();

    console.log(`Merged ${group.length} records into ${primary.id}, deleted ${duplicatesToDelete.length} duplicates`);

    return {
      merged: 1,
      deleted: duplicatesToDelete.length
    };
  };

  const DuplicateGroup = ({ group, index, collection }) => (
    <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-amber-900">
          Group {index + 1} - {group.length} duplicates
        </h4>
        <span className="text-xs text-amber-700 bg-amber-200 px-2 py-1 rounded">
          {collection}
        </span>
      </div>
      
      <div className="space-y-2">
        {group.map((person, i) => (
          <div key={person.id} className="flex items-center justify-between p-2 bg-white rounded border">
            <div className="flex-1">
              <div className="font-medium">
                {`${person.firstName || ''} ${person.lastName || ''}`.trim() || 'No name'}
              </div>
              <div className="text-sm text-gray-600">
                {person.email || 'No email'} • {person.jobTitle || 'No title'} • {person.roles?.join(', ') || 'No roles'}
              </div>
              <div className="text-xs text-gray-500">
                ID: {person.id} • Fields: {Object.values(person).filter(v => v && v !== '').length}
              </div>
            </div>
            {i === 0 && (
              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                Will keep (most complete)
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  useEffect(() => {
    analyzeDatabase();
  }, []);

  const totalDuplicateGroups = duplicates.people.length;
  const totalDuplicateRecords = duplicates.people.reduce((sum, group) => sum + group.length, 0);

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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Database Cleanup</h1>
        <p className="text-gray-600">Find and merge duplicate records to establish one source of truth</p>
      </div>

      {/* Analysis Results */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-serif font-semibold text-baylor-green">Analysis Results</h2>
          <button
            onClick={analyzeDatabase}
            disabled={isAnalyzing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 flex items-center"
          >
            {isAnalyzing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Analyzing...
              </>
            ) : (
              'Re-analyze Database'
            )}
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-600">Total Duplicate Groups</div>
            <div className="text-2xl font-bold text-gray-900">{totalDuplicateGroups}</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm text-gray-600">People Duplicates</div>
            <div className="text-2xl font-bold text-blue-800">{duplicates.people.length}</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <div className="text-sm text-gray-600">Records to Clean</div>
            <div className="text-2xl font-bold text-red-800">{totalDuplicateRecords}</div>
          </div>
        </div>

        {/* Action Button */}
        {totalDuplicateGroups > 0 && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-amber-600 mr-3 mt-0.5" />
                <div>
                  <h3 className="font-medium text-amber-900 mb-1">Duplicates Found</h3>
                  <p className="text-amber-800 text-sm">
                    Found {totalDuplicateGroups} groups containing {totalDuplicateRecords} duplicate records. 
                    Click below to automatically merge duplicates by keeping the most complete record from each group.
                  </p>
                </div>
              </div>
              <button
                onClick={mergeDuplicates}
                disabled={isProcessing}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:bg-gray-400 flex items-center ml-4"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Merging...
                  </>
                ) : (
                  <>
                    <Merge className="mr-2" size={16} />
                    Merge All Duplicates
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className={`p-4 rounded-lg border-2 mb-6 ${
            results.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-start">
              <div className={`p-2 rounded-full mr-3 ${
                results.success ? 'bg-green-100' : 'bg-red-100'
              }`}>
                {results.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <X className="w-5 h-5 text-red-600" />
                )}
              </div>
              <div>
                <h3 className={`font-medium ${
                  results.success ? 'text-green-900' : 'text-red-900'
                }`}>
                  {results.success ? 'Cleanup Completed Successfully' : 'Cleanup Completed with Errors'}
                </h3>
                <div className="mt-2 text-sm">
                  <p className={results.success ? 'text-green-800' : 'text-red-800'}>
                    Merged {results.totalMerged} groups, deleted {results.totalDeleted} duplicate records
                  </p>
                  {results.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="font-medium text-red-800">Errors:</p>
                      <ul className="list-disc list-inside text-red-700">
                        {results.errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* No Duplicates Message */}
        {!isAnalyzing && totalDuplicateGroups === 0 && (
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Database is Clean</h3>
            <p className="text-gray-600">No duplicate records found in your database.</p>
          </div>
        )}
      </div>

      {/* Duplicate Groups Display */}
      {totalDuplicateGroups > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-serif font-semibold text-baylor-green">
              Duplicate Groups ({duplicates.people.length})
            </h3>
          </div>

          <div className="space-y-4 max-h-96 overflow-y-auto">
            {duplicates.people.map((group, index) => (
              <DuplicateGroup
                key={`people-${index}`}
                group={group}
                index={index}
                collection="people"
              />
            ))}
            
            {duplicates.people.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>No people duplicates found</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DatabaseCleanup;