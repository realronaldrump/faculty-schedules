import React, { useState, useEffect, useMemo } from 'react';
import { 
  dataAnalysis, 
  deduplicationStrategy, 
  duplicateDetection, 
  mergeStrategies,
  cleanupRecommendations 
} from '../utils/dataDeduplicationAnalysis';

const DataDeduplicationManager = ({ rawData, onDataProcessed }) => {
  const [processingStep, setProcessingStep] = useState(0);
  const [processedData, setProcessedData] = useState({
    professors: [],
    courses: [],
    sections: [],
    departments: [],
    rooms: [],
    terms: []
  });
  const [duplicates, setDuplicates] = useState({
    professors: [],
    courses: [],
    sections: []
  });
  const [selectedForMerge, setSelectedForMerge] = useState([]);
  const [mergeResults, setMergeResults] = useState([]);
  const [showAnalysis, setShowAnalysis] = useState(false);

  // Process raw data and extract entities
  const processRawData = async () => {
    if (!rawData || rawData.length === 0) return;

    setProcessingStep(1);
    
    // Step 1: Extract professors
    console.log('Extracting professors...');
    const professors = deduplicationStrategy.extractProfessors(rawData);
    
    setProcessingStep(2);
    
    // Step 2: Extract courses
    console.log('Extracting courses...');
    const courses = deduplicationStrategy.extractCourses(rawData);
    
    setProcessingStep(3);
    
    // Step 3: Extract departments and rooms
    const departments = extractDepartments(rawData);
    const rooms = extractRooms(rawData);
    const terms = extractTerms(rawData);
    
    setProcessingStep(4);
    
    // Step 4: Create normalized sections
    console.log('Creating sections...');
    const sections = deduplicationStrategy.createSections(rawData);
    
    setProcessingStep(5);
    
    // Step 5: Detect duplicates
    console.log('Detecting duplicates...');
    const professorDuplicates = duplicateDetection.professorDuplicates(professors);
    const courseDuplicates = duplicateDetection.courseDuplicates(courses);
    const sectionDuplicates = detectSectionDuplicates(sections);
    
    const processed = {
      professors,
      courses,
      sections,
      departments,
      rooms,
      terms
    };
    
    const detectedDuplicates = {
      professors: professorDuplicates,
      courses: courseDuplicates,
      sections: sectionDuplicates
    };
    
    setProcessedData(processed);
    setDuplicates(detectedDuplicates);
    setProcessingStep(6);
    
    console.log('Processing complete!', {
      professors: professors.length,
      courses: courses.length,
      sections: sections.length,
      duplicates: professorDuplicates.length + courseDuplicates.length + sectionDuplicates.length
    });
  };

  // Helper extraction functions
  const extractDepartments = (records) => {
    const departments = new Map();
    
    records.forEach(record => {
      const code = record['Department Code'];
      if (code && !departments.has(code)) {
        departments.set(code, {
          code,
          name: code, // Could be enhanced with full department names
          campus: record.Campus,
          subjectCodes: new Set([record['Subject Code']])
        });
      } else if (code) {
        departments.get(code).subjectCodes.add(record['Subject Code']);
      }
    });
    
    return Array.from(departments.values()).map(dept => ({
      ...dept,
      subjectCodes: Array.from(dept.subjectCodes)
    }));
  };

  const extractRooms = (records) => {
    const rooms = new Map();
    
    records.forEach(record => {
      const room = record.Room;
      if (room && room !== 'No Room Needed' && room !== 'ONLINE' && !rooms.has(room)) {
        const [building, roomNumber] = room.includes(' ') 
          ? room.split(' ').reduce((acc, part, index, arr) => {
              if (index === arr.length - 1) {
                acc[1] = part; // Last part is room number
              } else {
                acc[0] += (acc[0] ? ' ' : '') + part; // Everything else is building
              }
              return acc;
            }, ['', ''])
          : [room, ''];
          
        rooms.set(room, {
          id: room,
          building: building || room,
          roomNumber: roomNumber || '',
          capacity: null, // Could be extracted from max enrollment patterns
          type: record['Schedule Type']
        });
      }
    });
    
    return Array.from(rooms.values());
  };

  const extractTerms = (records) => {
    const terms = new Map();
    
    records.forEach(record => {
      const termCode = record['Term Code'];
      if (termCode && !terms.has(termCode)) {
        terms.set(termCode, {
          code: termCode,
          name: record.Term,
          partOfTerm: record['Part of Term'],
          startDate: record['Custom Start Date'],
          endDate: record['Custom End Date'],
          isActive: record.Status === 'Active'
        });
      }
    });
    
    return Array.from(terms.values());
  };

  const detectSectionDuplicates = (sections) => {
    const duplicates = [];
    const crnMap = new Map();
    
    sections.forEach(section => {
      if (section.crn && crnMap.has(section.crn)) {
        const existing = crnMap.get(section.crn);
        duplicates.push({
          type: 'section',
          confidence: 1.0,
          records: [existing, section],
          reason: 'Identical CRN across imports'
        });
      } else if (section.crn) {
        crnMap.set(section.crn, section);
      }
    });
    
    return duplicates;
  };

  // Auto-merge high confidence duplicates
  const autoMergeHighConfidence = () => {
    const autoMerged = [];
    
    // Auto-merge professor duplicates with confidence >= 1.0
    duplicates.professors
      .filter(dup => dup.confidence >= 1.0)
      .forEach(dup => {
        const merged = mergeStrategies.mergeProfessors(dup);
        autoMerged.push({ type: 'professor', original: dup, merged });
      });
    
    // Auto-merge course duplicates (always high confidence)
    duplicates.courses.forEach(dup => {
      const merged = mergeStrategies.mergeCourses(dup);
      autoMerged.push({ type: 'course', original: dup, merged });
    });
    
    // Auto-merge section duplicates with same CRN
    duplicates.sections
      .filter(dup => dup.reason.includes('CRN'))
      .forEach(dup => {
        const merged = mergeStrategies.mergeSections(dup);
        autoMerged.push({ type: 'section', original: dup, merged });
      });
    
    setMergeResults(autoMerged);
    
    // Update processed data with merged results
    const updatedData = { ...processedData };
    autoMerged.forEach(result => {
      if (result.type === 'professor') {
        updatedData.professors = updatedData.professors.filter(
          prof => !result.original.records.includes(prof)
        );
        updatedData.professors.push(result.merged);
      }
      // Similar updates for courses and sections...
    });
    
    setProcessedData(updatedData);
    
    return autoMerged;
  };

  // Manual merge selection
  const toggleSelectForMerge = (duplicate, recordIndex) => {
    const key = `${duplicate.type}-${duplicate.records[0].id || duplicate.records[0].courseCode}-${recordIndex}`;
    setSelectedForMerge(prev => 
      prev.includes(key) 
        ? prev.filter(item => item !== key)
        : [...prev, key]
    );
  };

  // Statistics
  const stats = useMemo(() => {
    const totalDuplicates = Object.values(duplicates).reduce((sum, arr) => sum + arr.length, 0);
    const highConfidenceDuplicates = Object.values(duplicates)
      .flat()
      .filter(dup => dup.confidence >= 0.9).length;
    
    return {
      totalRecords: rawData?.length || 0,
      processedProfessors: processedData.professors.length,
      processedCourses: processedData.courses.length,
      processedSections: processedData.sections.length,
      totalDuplicates,
      highConfidenceDuplicates,
      autoMergeableCount: highConfidenceDuplicates
    };
  }, [rawData, processedData, duplicates]);

  useEffect(() => {
    if (rawData && rawData.length > 0) {
      processRawData();
    }
  }, [rawData]);

  return (
    <div className="max-w-full mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Data Deduplication Manager
        </h2>
        <p className="text-gray-600">
          Intelligent duplicate detection and merge system for faculty schedule data
        </p>
      </div>

      {/* Processing Status */}
      {processingStep > 0 && processingStep < 6 && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center mb-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            <span className="text-blue-800 font-medium">Processing Data...</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(processingStep / 6) * 100}%` }}
            ></div>
          </div>
          <p className="text-sm text-blue-700 mt-1">
            Step {processingStep}/6: {
              ['', 'Extracting professors', 'Extracting courses', 'Processing entities', 
               'Creating sections', 'Detecting duplicates', 'Complete'][processingStep]
            }
          </p>
        </div>
      )}

      {/* Statistics Dashboard */}
      {processingStep === 6 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-green-800">Raw Records</h3>
            <p className="text-2xl font-bold text-green-600">{stats.totalRecords}</p>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-blue-800">Processed Entities</h3>
            <p className="text-sm text-blue-600">
              {stats.processedProfessors} professors<br/>
              {stats.processedCourses} courses<br/>
              {stats.processedSections} sections
            </p>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-yellow-800">Duplicates Found</h3>
            <p className="text-2xl font-bold text-yellow-600">{stats.totalDuplicates}</p>
            <p className="text-sm text-yellow-600">{stats.highConfidenceDuplicates} high confidence</p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-purple-800">Auto-Mergeable</h3>
            <p className="text-2xl font-bold text-purple-600">{stats.autoMergeableCount}</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {processingStep === 6 && (
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={autoMergeHighConfidence}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Auto-Merge High Confidence ({stats.autoMergeableCount})
          </button>
          
          <button
            onClick={() => setShowAnalysis(!showAnalysis)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {showAnalysis ? 'Hide' : 'Show'} Analysis
          </button>
          
          <button
            onClick={() => onDataProcessed?.(processedData)}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Apply Processed Data
          </button>
        </div>
      )}

      {/* Analysis Details */}
      {showAnalysis && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-3">Detailed Analysis</h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Professor Duplicates */}
            <div className="bg-white p-4 rounded border">
              <h4 className="font-semibold text-red-700 mb-2">
                Professor Duplicates ({duplicates.professors.length})
              </h4>
              {duplicates.professors.slice(0, 5).map((dup, index) => (
                <div key={index} className="text-sm mb-2 p-2 bg-red-50 rounded">
                  <p className="font-medium">{dup.records[0].name}</p>
                  <p className="text-gray-600">Confidence: {(dup.confidence * 100).toFixed(0)}%</p>
                  <p className="text-gray-600">Reason: {dup.reason}</p>
                </div>
              ))}
              {duplicates.professors.length > 5 && (
                <p className="text-sm text-gray-500">...and {duplicates.professors.length - 5} more</p>
              )}
            </div>

            {/* Course Duplicates */}
            <div className="bg-white p-4 rounded border">
              <h4 className="font-semibold text-orange-700 mb-2">
                Course Duplicates ({duplicates.courses.length})
              </h4>
              {duplicates.courses.slice(0, 5).map((dup, index) => (
                <div key={index} className="text-sm mb-2 p-2 bg-orange-50 rounded">
                  <p className="font-medium">{dup.records[0].courseCode}</p>
                  <p className="text-gray-600">{dup.records[0].title}</p>
                  <p className="text-gray-600">Reason: {dup.reason}</p>
                </div>
              ))}
              {duplicates.courses.length > 5 && (
                <p className="text-sm text-gray-500">...and {duplicates.courses.length - 5} more</p>
              )}
            </div>

            {/* Section Duplicates */}
            <div className="bg-white p-4 rounded border">
              <h4 className="font-semibold text-blue-700 mb-2">
                Section Duplicates ({duplicates.sections.length})
              </h4>
              {duplicates.sections.slice(0, 5).map((dup, index) => (
                <div key={index} className="text-sm mb-2 p-2 bg-blue-50 rounded">
                  <p className="font-medium">CRN: {dup.records[0].crn}</p>
                  <p className="text-gray-600">{dup.records[0].courseCode}</p>
                  <p className="text-gray-600">Reason: {dup.reason}</p>
                </div>
              ))}
              {duplicates.sections.length > 5 && (
                <p className="text-sm text-gray-500">...and {duplicates.sections.length - 5} more</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Merge Results */}
      {mergeResults.length > 0 && (
        <div className="mb-6 p-4 bg-green-50 rounded-lg">
          <h3 className="text-lg font-semibold text-green-800 mb-3">
            Merge Results ({mergeResults.length} processed)
          </h3>
          <div className="max-h-60 overflow-y-auto">
            {mergeResults.map((result, index) => (
              <div key={index} className="text-sm mb-2 p-2 bg-white rounded border">
                <span className="font-medium capitalize">{result.type}</span>: 
                <span className="ml-2">
                  {result.type === 'professor' ? result.merged.name : 
                   result.type === 'course' ? result.merged.courseCode :
                   result.merged.crn}
                </span>
                <span className="text-gray-500 ml-2">
                  (merged {result.original.records.length} records)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-3">Cleanup Recommendations</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h4 className="font-medium text-green-700 mb-2">Immediate Actions</h4>
            <ul className="text-sm space-y-1">
              {cleanupRecommendations.immediate.map((rec, index) => (
                <li key={index} className="flex items-start">
                  <span className="text-green-600 mr-2">•</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-blue-700 mb-2">Ongoing Monitoring</h4>
            <ul className="text-sm space-y-1">
              {cleanupRecommendations.ongoing.map((rec, index) => (
                <li key={index} className="flex items-start">
                  <span className="text-blue-600 mr-2">•</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-purple-700 mb-2">Architecture Changes</h4>
            <ul className="text-sm space-y-1">
              {cleanupRecommendations.architecture.map((rec, index) => (
                <li key={index} className="flex items-start">
                  <span className="text-purple-600 mr-2">•</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataDeduplicationManager; 