/**
 * Normalized Database Schema for Faculty Schedules
 * 
 * This schema eliminates redundancy and establishes proper relationships
 * between entities to maintain a single source of truth.
 */

export const normalizedSchema = {
  // Core entity tables
  tables: {
    professors: {
      tableName: 'professors',
      primaryKey: 'professor_id',
      fields: {
        professor_id: 'TEXT PRIMARY KEY', // University ID from CLSS
        name: 'TEXT NOT NULL',
        email: 'TEXT',
        department_id: 'TEXT REFERENCES departments(department_code)',
        is_active: 'BOOLEAN DEFAULT true',
        hire_date: 'DATE',
        created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
        updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
      },
      indexes: [
        'CREATE INDEX idx_professors_name ON professors(name)',
        'CREATE INDEX idx_professors_department ON professors(department_id)',
        'CREATE INDEX idx_professors_active ON professors(is_active)'
      ]
    },

    departments: {
      tableName: 'departments',
      primaryKey: 'department_code',
      fields: {
        department_code: 'TEXT PRIMARY KEY',
        department_name: 'TEXT NOT NULL',
        college: 'TEXT',
        campus: 'TEXT',
        is_active: 'BOOLEAN DEFAULT true',
        created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
      }
    },

    courses: {
      tableName: 'courses',
      primaryKey: 'course_code',
      fields: {
        course_code: 'TEXT PRIMARY KEY', // e.g., "ADM 1300"
        department_code: 'TEXT NOT NULL REFERENCES departments(department_code)',
        subject_code: 'TEXT NOT NULL',
        catalog_number: 'TEXT NOT NULL',
        title: 'TEXT NOT NULL',
        long_title: 'TEXT',
        description: 'TEXT',
        credit_hours: 'INTEGER',
        attributes: 'TEXT',
        prerequisites: 'TEXT',
        is_active: 'BOOLEAN DEFAULT true',
        created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
        updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
      },
      indexes: [
        'CREATE INDEX idx_courses_department ON courses(department_code)',
        'CREATE INDEX idx_courses_subject ON courses(subject_code)',
        'CREATE UNIQUE INDEX idx_courses_subject_catalog ON courses(subject_code, catalog_number)'
      ]
    },

    terms: {
      tableName: 'terms',
      primaryKey: 'term_code',
      fields: {
        term_code: 'TEXT PRIMARY KEY', // e.g., "202530"
        term_name: 'TEXT NOT NULL', // e.g., "Fall 2025"
        start_date: 'DATE',
        end_date: 'DATE',
        is_active: 'BOOLEAN DEFAULT true',
        registration_start: 'DATE',
        registration_end: 'DATE'
      }
    },

    buildings: {
      tableName: 'buildings',
      primaryKey: 'building_code',
      fields: {
        building_code: 'TEXT PRIMARY KEY',
        building_name: 'TEXT NOT NULL',
        campus: 'TEXT',
        address: 'TEXT',
        is_active: 'BOOLEAN DEFAULT true'
      }
    },

    rooms: {
      tableName: 'rooms',
      primaryKey: 'room_id',
      fields: {
        room_id: 'TEXT PRIMARY KEY', // Full room identifier
        building_code: 'TEXT REFERENCES buildings(building_code)',
        room_number: 'TEXT',
        capacity: 'INTEGER',
        room_type: 'TEXT', // Classroom, Lab, Studio, etc.
        equipment: 'TEXT', // JSON array of available equipment
        is_active: 'BOOLEAN DEFAULT true'
      },
      indexes: [
        'CREATE INDEX idx_rooms_building ON rooms(building_code)',
        'CREATE INDEX idx_rooms_capacity ON rooms(capacity)'
      ]
    },

    sections: {
      tableName: 'sections',
      primaryKey: 'section_id',
      fields: {
        section_id: 'TEXT PRIMARY KEY', // CRN or CLSS_ID + Term
        clss_id: 'TEXT',
        crn: 'TEXT',
        course_code: 'TEXT NOT NULL REFERENCES courses(course_code)',
        term_code: 'TEXT NOT NULL REFERENCES terms(term_code)',
        section_number: 'TEXT NOT NULL',
        professor_id: 'TEXT REFERENCES professors(professor_id)',
        room_id: 'TEXT REFERENCES rooms(room_id)',
        schedule_type: 'TEXT', // Class Instruction, Lab, Studio, etc.
        meeting_pattern: 'TEXT', // e.g., "TR 2pm-3:15pm"
        instruction_method: 'TEXT', // Face-to-Face, Online, Hybrid
        status: 'TEXT DEFAULT "Active"',
        enrollment: 'INTEGER DEFAULT 0',
        max_enrollment: 'INTEGER',
        wait_cap: 'INTEGER DEFAULT 0',
        wait_total: 'INTEGER DEFAULT 0',
        part_of_term: 'TEXT',
        custom_start_date: 'DATE',
        custom_end_date: 'DATE',
        created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
        updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
        last_imported: 'TIMESTAMP'
      },
      indexes: [
        'CREATE UNIQUE INDEX idx_sections_crn_term ON sections(crn, term_code)',
        'CREATE INDEX idx_sections_course ON sections(course_code)',
        'CREATE INDEX idx_sections_professor ON sections(professor_id)',
        'CREATE INDEX idx_sections_term ON sections(term_code)',
        'CREATE INDEX idx_sections_status ON sections(status)'
      ]
    }
  },

  // Relationship/junction tables
  relationshipTables: {
    section_meetings: {
      tableName: 'section_meetings',
      fields: {
        meeting_id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
        section_id: 'TEXT NOT NULL REFERENCES sections(section_id)',
        day_of_week: 'TEXT NOT NULL', // Monday, Tuesday, etc.
        start_time: 'TIME',
        end_time: 'TIME',
        room_id: 'TEXT REFERENCES rooms(room_id)',
        meeting_type: 'TEXT', // Class, Lab, Final Exam
        effective_start_date: 'DATE',
        effective_end_date: 'DATE'
      },
      indexes: [
        'CREATE INDEX idx_meetings_section ON section_meetings(section_id)',
        'CREATE INDEX idx_meetings_day_time ON section_meetings(day_of_week, start_time)'
      ]
    },

    section_crosslistings: {
      tableName: 'section_crosslistings',
      fields: {
        crosslisting_id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
        primary_section_id: 'TEXT NOT NULL REFERENCES sections(section_id)',
        crosslisted_section_id: 'TEXT NOT NULL REFERENCES sections(section_id)',
        crosslist_type: 'TEXT' // Also, See, etc.
      }
    },

    section_restrictions: {
      tableName: 'section_restrictions',
      fields: {
        restriction_id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
        section_id: 'TEXT NOT NULL REFERENCES sections(section_id)',
        restriction_type: 'TEXT NOT NULL', // Major, Classification, etc.
        restriction_category: 'TEXT NOT NULL', // Include/Exclude
        restriction_value: 'TEXT NOT NULL',
        created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
      },
      indexes: [
        'CREATE INDEX idx_restrictions_section ON section_restrictions(section_id)',
        'CREATE INDEX idx_restrictions_type ON section_restrictions(restriction_type)'
      ]
    },

    section_notes: {
      tableName: 'section_notes',
      fields: {
        note_id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
        section_id: 'TEXT NOT NULL REFERENCES sections(section_id)',
        note_type: 'TEXT NOT NULL', // Class Note, Comments to Registrar, etc.
        note_text: 'TEXT NOT NULL',
        is_visible_to_students: 'BOOLEAN DEFAULT false',
        created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
      }
    },

    professor_assignments: {
      tableName: 'professor_assignments',
      fields: {
        assignment_id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
        professor_id: 'TEXT NOT NULL REFERENCES professors(professor_id)',
        section_id: 'TEXT NOT NULL REFERENCES sections(section_id)',
        assignment_type: 'TEXT NOT NULL', // Primary, Secondary
        percentage: 'INTEGER DEFAULT 100',
        start_date: 'DATE',
        end_date: 'DATE'
      },
      indexes: [
        'CREATE INDEX idx_assignments_professor ON professor_assignments(professor_id)',
        'CREATE INDEX idx_assignments_section ON professor_assignments(section_id)'
      ]
    }
  },

  // Views for common queries
  views: {
    faculty_schedule_view: `
      CREATE VIEW faculty_schedule_view AS
      SELECT 
        p.professor_id,
        p.name as professor_name,
        s.section_id,
        s.crn,
        c.course_code,
        c.title as course_title,
        s.section_number,
        t.term_name,
        s.meeting_pattern,
        r.room_id,
        b.building_name,
        s.enrollment,
        s.max_enrollment,
        s.status
      FROM professors p
      JOIN sections s ON p.professor_id = s.professor_id
      JOIN courses c ON s.course_code = c.course_code
      JOIN terms t ON s.term_code = t.term_code
      LEFT JOIN rooms r ON s.room_id = r.room_id
      LEFT JOIN buildings b ON r.building_code = b.building_code
      WHERE s.status = 'Active'
    `,

    room_utilization_view: `
      CREATE VIEW room_utilization_view AS
      SELECT 
        r.room_id,
        r.building_code,
        b.building_name,
        r.room_number,
        r.capacity,
        COUNT(s.section_id) as sections_count,
        SUM(s.enrollment) as total_enrollment,
        AVG(CAST(s.enrollment AS FLOAT) / NULLIF(s.max_enrollment, 0)) as avg_utilization
      FROM rooms r
      LEFT JOIN buildings b ON r.building_code = b.building_code
      LEFT JOIN sections s ON r.room_id = s.room_id AND s.status = 'Active'
      GROUP BY r.room_id, r.building_code, b.building_name, r.room_number, r.capacity
    `,

    course_offering_summary: `
      CREATE VIEW course_offering_summary AS
      SELECT 
        c.course_code,
        c.title,
        c.department_code,
        d.department_name,
        COUNT(s.section_id) as sections_offered,
        SUM(s.enrollment) as total_enrollment,
        SUM(s.max_enrollment) as total_capacity,
        COUNT(DISTINCT s.professor_id) as unique_instructors
      FROM courses c
      JOIN departments d ON c.department_code = d.department_code
      LEFT JOIN sections s ON c.course_code = s.course_code AND s.status = 'Active'
      GROUP BY c.course_code, c.title, c.department_code, d.department_name
    `
  },

  // Data integrity constraints
  constraints: [
    'ALTER TABLE sections ADD CONSTRAINT chk_enrollment CHECK (enrollment <= max_enrollment)',
    'ALTER TABLE sections ADD CONSTRAINT chk_wait_total CHECK (wait_total <= wait_cap)',
    'ALTER TABLE professor_assignments ADD CONSTRAINT chk_percentage CHECK (percentage BETWEEN 0 AND 100)'
  ],

  // Triggers for data consistency
  triggers: {
    update_timestamps: `
      CREATE TRIGGER update_section_timestamp 
      BEFORE UPDATE ON sections
      FOR EACH ROW
      BEGIN
        UPDATE sections SET updated_at = CURRENT_TIMESTAMP WHERE section_id = NEW.section_id;
      END
    `,

    validate_crosslistings: `
      CREATE TRIGGER validate_crosslisting
      BEFORE INSERT ON section_crosslistings
      FOR EACH ROW
      BEGIN
        SELECT CASE
          WHEN NEW.primary_section_id = NEW.crosslisted_section_id THEN
            RAISE(ABORT, 'A section cannot be crosslisted with itself')
        END;
      END
    `
  }
};

// Migration functions for converting from flat CLSS structure
export const migrationQueries = {
  // Step 1: Extract and insert departments
  extractDepartments: `
    INSERT OR IGNORE INTO departments (department_code, department_name, campus)
    SELECT DISTINCT 
      "Department Code" as department_code,
      "Department Code" as department_name, -- Could be enhanced with lookup table
      Campus as campus
    FROM clss_import_staging
    WHERE "Department Code" IS NOT NULL
  `,

  // Step 2: Extract and insert buildings
  extractBuildings: `
    INSERT OR IGNORE INTO buildings (building_code, building_name, campus)
    SELECT DISTINCT
      CASE 
        WHEN Room LIKE '% %' THEN SUBSTR(Room, 1, INSTR(Room, ' ') - 1)
        ELSE Room
      END as building_code,
      CASE 
        WHEN Room LIKE '% %' THEN SUBSTR(Room, 1, INSTR(Room, ' ') - 1)
        ELSE Room
      END as building_name,
      Campus
    FROM clss_import_staging
    WHERE Room IS NOT NULL 
      AND Room != 'No Room Needed' 
      AND Room != 'ONLINE'
      AND Room != 'General Assignment Room'
  `,

  // Step 3: Extract and insert rooms
  extractRooms: `
    INSERT OR IGNORE INTO rooms (room_id, building_code, room_number, room_type)
    SELECT DISTINCT
      Room as room_id,
      CASE 
        WHEN Room LIKE '% %' THEN SUBSTR(Room, 1, INSTR(Room, ' ') - 1)
        ELSE Room
      END as building_code,
      CASE 
        WHEN Room LIKE '% %' THEN SUBSTR(Room, INSTR(Room, ' ') + 1)
        ELSE ''
      END as room_number,
      "Schedule Type" as room_type
    FROM clss_import_staging
    WHERE Room IS NOT NULL 
      AND Room != 'No Room Needed' 
      AND Room != 'ONLINE'
      AND Room != 'General Assignment Room'
  `,

  // Step 4: Extract and insert professors
  extractProfessors: `
    INSERT OR IGNORE INTO professors (professor_id, name, department_id)
    SELECT DISTINCT
      SUBSTR(Instructor, INSTR(Instructor, '(') + 1, INSTR(Instructor, ')') - INSTR(Instructor, '(') - 1) as professor_id,
      TRIM(SUBSTR(Instructor, 1, INSTR(Instructor, '(') - 1)) as name,
      "Department Code" as department_id
    FROM clss_import_staging
    WHERE Instructor IS NOT NULL 
      AND Instructor LIKE '%(%'
      AND Instructor NOT LIKE 'Staff %'
  `,

  // Step 5: Extract and insert courses
  extractCourses: `
    INSERT OR IGNORE INTO courses (
      course_code, department_code, subject_code, catalog_number, 
      title, long_title, credit_hours, attributes
    )
    SELECT DISTINCT
      "Subject Code" || ' ' || "Catalog Number" as course_code,
      "Department Code" as department_code,
      "Subject Code" as subject_code,
      "Catalog Number" as catalog_number,
      "Course Title" as title,
      "Long Title" as long_title,
      CAST("Credit Hrs" AS INTEGER) as credit_hours,
      "Course Attributes" as attributes
    FROM clss_import_staging
    WHERE "Subject Code" IS NOT NULL 
      AND "Catalog Number" IS NOT NULL
  `,

  // Step 6: Extract and insert sections
  extractSections: `
    INSERT OR REPLACE INTO sections (
      section_id, clss_id, crn, course_code, term_code, section_number,
      professor_id, room_id, schedule_type, meeting_pattern, instruction_method,
      status, enrollment, max_enrollment, wait_cap, wait_total, part_of_term,
      custom_start_date, custom_end_date, last_imported
    )
    SELECT 
      COALESCE(CRN, "CLSS ID") as section_id,
      "CLSS ID" as clss_id,
      CRN as crn,
      "Subject Code" || ' ' || "Catalog Number" as course_code,
      "Term Code" as term_code,
      "Section #" as section_number,
      CASE 
        WHEN Instructor LIKE '%(%' AND Instructor NOT LIKE 'Staff %'
        THEN SUBSTR(Instructor, INSTR(Instructor, '(') + 1, INSTR(Instructor, ')') - INSTR(Instructor, '(') - 1)
        ELSE NULL
      END as professor_id,
      CASE 
        WHEN Room NOT IN ('No Room Needed', 'ONLINE', 'General Assignment Room') 
        THEN Room 
        ELSE NULL 
      END as room_id,
      "Schedule Type" as schedule_type,
      "Meeting Pattern" as meeting_pattern,
      "Inst. Method" as instruction_method,
      Status as status,
      CAST(Enrollment AS INTEGER) as enrollment,
      CAST("Maximum Enrollment" AS INTEGER) as max_enrollment,
      CAST("Wait Cap" AS INTEGER) as wait_cap,
      CAST("Wait Total" AS INTEGER) as wait_total,
      "Part of Term" as part_of_term,
      "Custom Start Date" as custom_start_date,
      "Custom End Date" as custom_end_date,
      CURRENT_TIMESTAMP as last_imported
    FROM clss_import_staging
  `
};

export default normalizedSchema; 