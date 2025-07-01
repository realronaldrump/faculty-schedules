/**
 * Data Deduplication Analysis for Faculty Schedules App
 * 
 * IDENTIFIED ISSUES:
 * 1. Professor records duplicated across term imports
 * 2. Course information repeated for every section
 * 3. Department/building data redundantly stored
 * 4. No normalized relational structure
 * 5. Multiple potential primary keys causing confusion
 */

export const dataAnalysis = {
  // Core entity identification
  entities: {
    professors: {
      primaryKey: 'professorId', // Extract from "Instructor" field
      duplicateFields: [
        'Instructor', // Contains name and ID
      ],
      extractionPattern: /^(.+?)\s+\((\d+)\)\s+\[(.+?)\]$/,
      normalizedFields: {
        name: 'extracted from Instructor field',
        id: 'extracted from Instructor field', 
        assignment: 'extracted from Instructor field'
      }
    },
    
    courses: {
      primaryKey: 'courseCode', // Subject Code + Catalog Number
      duplicateFields: [
        'Department Code',
        'Subject Code', 
        'Catalog Number',
        'Course Title',
        'Long Title',
        'Credit Hrs',
        'Course Attributes'
      ],
      normalizedFields: {
        departmentCode: 'Department Code',
        subjectCode: 'Subject Code',
        catalogNumber: 'Catalog Number',
        title: 'Course Title',
        longTitle: 'Long Title',
        creditHours: 'Credit Hrs'
      }
    },
    
    sections: {
      primaryKey: 'sectionId', // CRN or CLSS ID + Term
      uniqueFields: [
        'CRN',
        'CLSS ID', 
        'Section #',
        'Meeting Pattern',
        'Meetings',
        'Schedule Type',
        'Enrollment',
        'Maximum Enrollment'
      ],
      relationships: {
        courseId: 'references courses.courseCode',
        professorId: 'references professors.id',
        termId: 'references terms.id',
        roomId: 'references rooms.id'
      }
    },
    
    rooms: {
      primaryKey: 'roomId',
      duplicateFields: ['Room'],
      normalizedFields: {
        building: 'extracted from Room field',
        roomNumber: 'extracted from Room field'
      }
    },
    
    terms: {
      primaryKey: 'termId',
      duplicateFields: [
        'Term',
        'Term Code',
        'Part of Term'
      ]
    }
  },

  // Duplication patterns identified
  duplicationPatterns: {
    professorDuplication: {
      issue: 'Same professor appears in multiple imports with identical data',
      examples: [
        'Yoo, Jeongju (891178020) - appears in both Spring and Fall 2025',
        'Brunson, Rochelle (889369334) - appears in both terms',
        'Hassell, Patricia (889127051) - appears in both terms'
      ],
      solution: 'Extract professor ID from Instructor field, maintain single professor record'
    },
    
    courseDuplication: {
      issue: 'Course information repeated for every section',
      examples: [
        'ADM 1300 course info repeated for every section',
        'Course titles and descriptions duplicated'
      ],
      solution: 'Normalize course data into separate table, reference from sections'
    },
    
    departmentDuplication: {
      issue: 'Department codes and info repeated across all department courses',
      examples: [
        'HSD department code appears in every record',
        'Building information repeated for every class in same location'
      ],
      solution: 'Create department and building reference tables'
    }
  },

  // Field mapping for redundancy elimination
  redundantFields: {
    courseLevel: [
      'Course', // Combines Subject + Catalog Number
      'Subject Code',
      'Catalog Number'
    ],
    meetingInfo: [
      'Meeting Pattern', // Text description
      'Meetings' // Structured format
    ],
    titleFields: [
      'Course Title', // Short title
      'Long Title' // Extended title
    ]
  }
};

export const deduplicationStrategy = {
  // Step 1: Extract and normalize professors
  extractProfessors: (records) => {
    const professors = new Map();
    const professorPattern = /^(.+?)\s+\((\d+)\)\s+\[(.+?)\]$/;
    
    records.forEach(record => {
      if (record.Instructor && record.Instructor !== 'Staff [Primary, 100%]') {
        const match = record.Instructor.match(professorPattern);
        if (match) {
          const [, name, id, assignment] = match;
          if (!professors.has(id)) {
            professors.set(id, {
              id,
              name: name.trim(),
              assignments: new Set([assignment]),
              lastSeen: record.Term,
              isActive: record.Status === 'Active'
            });
          } else {
            // Update existing professor with new assignment info
            professors.get(id).assignments.add(assignment);
            professors.get(id).lastSeen = record.Term;
          }
        }
      }
    });
    
    return Array.from(professors.values()).map(prof => ({
      ...prof,
      assignments: Array.from(prof.assignments)
    }));
  },

  // Step 2: Extract and normalize courses
  extractCourses: (records) => {
    const courses = new Map();
    
    records.forEach(record => {
      const courseCode = `${record['Subject Code']} ${record['Catalog Number']}`;
      
      if (!courses.has(courseCode)) {
        courses.set(courseCode, {
          courseCode,
          departmentCode: record['Department Code'],
          subjectCode: record['Subject Code'],
          catalogNumber: record['Catalog Number'],
          title: record['Course Title'],
          longTitle: record['Long Title'],
          creditHours: record['Credit Hrs'],
          attributes: record['Course Attributes'],
          scheduleTypes: new Set([record['Schedule Type']]),
          lastUpdated: new Date().toISOString()
        });
      } else {
        // Add new schedule types if found
        courses.get(courseCode).scheduleTypes.add(record['Schedule Type']);
      }
    });
    
    return Array.from(courses.values()).map(course => ({
      ...course,
      scheduleTypes: Array.from(course.scheduleTypes)
    }));
  },

  // Helper to extract restriction data
  extractRestrictions: (record) => {
    const restrictions = {};
    const restrictionTypes = [
      'Student Attribute',
      'Cohort', 
      'Classification',
      'Degree',
      'Level',
      'Field of Study - All',
      'Field of Study - Concentration',
      'Field of Study - Major',
      'Field of Study - Minor',
      'Program'
    ];
    
    restrictionTypes.forEach(type => {
      const includeExclude = record[`Restrictions\n${type} \nInclude/Exclude`];
      const value = record[`Restrictions\n${type}`];
      
      if (includeExclude && value) {
        restrictions[type.replace(/\s+/g, '')] = {
          type: includeExclude,
          values: value.split(/\s+/).filter(Boolean)
        };
      }
    });
    
    return restrictions;
  },

  // Step 3: Create normalized sections
  createSections: (records, professorMap, courseMap) => {
    return records.map(record => {
      const professorMatch = record.Instructor?.match(/\((\d+)\)/);
      const professorId = professorMatch ? professorMatch[1] : null;
      const courseCode = `${record['Subject Code']} ${record['Catalog Number']}`;
      
      return {
        sectionId: record.CRN || record['CLSS ID'],
        clssId: record['CLSS ID'],
        crn: record.CRN,
        courseCode,
        professorId,
        termCode: record['Term Code'],
        term: record.Term,
        sectionNumber: record['Section #'],
        meetingPattern: record['Meeting Pattern'],
        meetings: record.Meetings,
        room: record.Room,
        status: record.Status,
        partOfTerm: record['Part of Term'],
        campus: record.Campus,
        instructionMethod: record['Inst. Method'],
        enrollment: parseInt(record.Enrollment) || 0,
        maxEnrollment: parseInt(record['Maximum Enrollment']) || 0,
        waitCap: parseInt(record['Wait Cap']) || 0,
        waitTotal: parseInt(record['Wait Total']) || 0,
        crossListings: record['Cross-listings'],
        comments: record['Comments to Registrar'],
        classNotes: [
          record['Class Notes (visible to students)#1'],
          record['Class Notes (visible to students)#2']
        ].filter(Boolean),
        finalExam: record['Final Exam'],
        restrictions: deduplicationStrategy.extractRestrictions(record),
        lastImported: new Date().toISOString()
      };
    });
  }
};

export const duplicateDetection = {
  // Smart duplicate detection algorithms
  
  professorDuplicates: (professors) => {
    const duplicates = [];
    const nameMap = new Map();
    
    professors.forEach(prof => {
      const normalizedName = prof.name.toLowerCase().replace(/[^a-z\s]/g, '');
      
      if (nameMap.has(normalizedName)) {
        const existing = nameMap.get(normalizedName);
        duplicates.push({
          type: 'professor',
          confidence: prof.id === existing.id ? 1.0 : 0.8,
          records: [existing, prof],
          reason: prof.id === existing.id ? 'Identical ID' : 'Similar name'
        });
      } else {
        nameMap.set(normalizedName, prof);
      }
    });
    
    return duplicates;
  },

  courseDuplicates: (courses) => {
    const duplicates = [];
    const codeMap = new Map();
    
    courses.forEach(course => {
      if (codeMap.has(course.courseCode)) {
        const existing = codeMap.get(course.courseCode);
        duplicates.push({
          type: 'course',
          confidence: 1.0,
          records: [existing, course],
          reason: 'Identical course code'
        });
      } else {
        codeMap.set(course.courseCode, course);
      }
    });
    
    return duplicates;
  },

  // Field-level duplicate detection
  fieldSimilarity: (field1, field2) => {
    if (!field1 || !field2) return 0;
    
    const str1 = field1.toString().toLowerCase();
    const str2 = field2.toString().toLowerCase();
    
    if (str1 === str2) return 1.0;
    
    // Levenshtein distance for similarity
    const matrix = Array(str1.length + 1).fill().map(() => Array(str2.length + 1).fill(0));
    
    for (let i = 0; i <= str1.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= str2.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    
    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1.0 : 1.0 - (matrix[str1.length][str2.length] / maxLength);
  }
};

export const mergeStrategies = {
  // Merge duplicate professors
  mergeProfessors: (duplicateGroup) => {
    const merged = { ...duplicateGroup.records[0] };
    
    duplicateGroup.records.forEach(prof => {
      // Combine assignments
      merged.assignments = [...new Set([...merged.assignments, ...prof.assignments])];
      
      // Keep most recent lastSeen date
      if (new Date(prof.lastSeen) > new Date(merged.lastSeen)) {
        merged.lastSeen = prof.lastSeen;
      }
      
      // Keep active status if any record is active
      if (prof.isActive) {
        merged.isActive = true;
      }
    });
    
    return merged;
  },

  // Merge duplicate courses
  mergeCourses: (duplicateGroup) => {
    const merged = { ...duplicateGroup.records[0] };
    
    duplicateGroup.records.forEach(course => {
      // Combine schedule types
      merged.scheduleTypes = [...new Set([...merged.scheduleTypes, ...course.scheduleTypes])];
      
      // Use longer title if available
      if (course.longTitle && course.longTitle.length > merged.longTitle?.length) {
        merged.longTitle = course.longTitle;
      }
      
      // Keep most recent update
      if (new Date(course.lastUpdated) > new Date(merged.lastUpdated)) {
        merged.lastUpdated = course.lastUpdated;
      }
    });
    
    return merged;
  },

  // Auto-merge sections with same CRN across imports
  mergeSections: (duplicateGroup) => {
    const merged = { ...duplicateGroup.records[0] };
    
    duplicateGroup.records.forEach(section => {
      // Update enrollment if more recent
      if (new Date(section.lastImported) > new Date(merged.lastImported)) {
        merged.enrollment = section.enrollment;
        merged.maxEnrollment = section.maxEnrollment;
        merged.waitTotal = section.waitTotal;
        merged.status = section.status;
        merged.lastImported = section.lastImported;
      }
      
      // Combine class notes
      merged.classNotes = [...new Set([...merged.classNotes, ...section.classNotes])];
    });
    
    return merged;
  }
};

export const cleanupRecommendations = {
  immediate: [
    'Extract professor data into separate table with unique IDs',
    'Normalize course information to eliminate section-level duplication', 
    'Create department and building reference tables',
    'Implement CRN-based duplicate detection for sections',
    'Set up field mapping for automatic merge on import'
  ],
  
  ongoing: [
    'Monitor professor name variations for manual review',
    'Flag unusual enrollment changes between imports',
    'Track course catalog changes over time',
    'Maintain audit trail of all merges and deduplication'
  ],
  
  architecture: [
    'Implement normalized database schema',
    'Add unique constraints on natural keys',
    'Create automated duplicate detection pipeline',
    'Build manual review interface for uncertain matches',
    'Add data validation rules for imports'
  ]
}; 