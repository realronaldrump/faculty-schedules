# Faculty Schedules Data Architecture

## Single Source of Truth Implementation

This document outlines the unified data architecture that eliminates duplication and ensures consistency across the faculty schedules application.

## Core Collections

### 1. `people` Collection (Primary Source of Truth)
All individuals (faculty, staff, or both) are stored in a single collection:

```javascript
{
  id: "unique_firestore_id",
  firstName: "John",
  lastName: "Smith", 
  email: "john.smith@university.edu",
  phone: "5551234567",
  jobTitle: "Associate Professor",
  office: "Marrs McLean Science Building 123",
  department: "Human Sciences & Design",
  roles: ["faculty"],  // or ["staff"] or ["faculty", "staff"]
  programId: "nutrition", // References programs collection
  isAdjunct: false,
  isTenured: true,
  isUPD: false,
  hasNoPhone: false,
  hasNoOffice: false,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z"
}
```

### 2. `programs` Collection
Program definitions with UPD references:

```javascript
{
  id: "nutrition",
  name: "Nutrition",
  code: "NUTR",
  updId: "faculty_id_who_is_upd", // References people collection
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z"
}
```

### 3. `schedules` Collection
Course schedules with relational references:

```javascript
{
  id: "schedule_id",
  courseCode: "NUTR 3300",
  instructorId: "people_id", // References people collection
  roomId: "room_id", // References rooms collection
  term: "Fall 2024",
  // ... other schedule fields
}
```

## Data Flow Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   Firebase      │    │   dataAdapter.js │    │   UI Components     │
│   Collections  │───▶│   (Transform)    │───▶│   (Display)         │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
  • people              • adaptPeopleToFaculty   • FacultyDirectory
  • programs            • adaptPeopleToStaff     • StaffDirectory  
  • schedules           • fetchPrograms          • ProgramManagement
  • rooms               • Single Point Transform • BuildingDirectory
```

## Key Principles

### 1. **Single Source of Truth**
- All people data lives in `people` collection
- Program information is referenced via `programId`, not duplicated
- No parsing of job titles for program information
- One update propagates everywhere

### 2. **Normalized References**
- `people.programId` → `programs.id`
- `schedules.instructorId` → `people.id`
- `programs.updId` → `people.id`

### 3. **Consistent Data Transformation**
All components use `dataAdapter.js` functions:

```javascript
// ✅ Correct - Use data adapters
const facultyData = adaptPeopleToFaculty(rawPeople, schedules, programs);
const staffData = adaptPeopleToStaff(rawPeople, schedules, programs);

// ❌ Incorrect - Direct access bypasses normalization
const programName = person.jobTitle.split(' - ')[0]; // DON'T DO THIS
```

### 4. **Role-Based Access**
- Use `roles` array to determine person's roles
- Support dual roles: `["faculty", "staff"]`
- Filter by role using `roles.includes('faculty')`

## Component Responsibilities

### Data Layer (`dataAdapter.js`)
- ✅ Fetch raw data from Firebase
- ✅ Transform to component-specific formats
- ✅ Resolve program references
- ✅ Calculate derived fields (course counts, etc.)

### UI Components
- ✅ Receive adapted data via props
- ✅ Use program objects (not job title parsing)
- ✅ Display consistent information
- ✅ Update through standard handlers

## Program Information Display

### ✅ Correct Pattern
```javascript
// Always use the resolved program object
if (person.program && person.program.name) {
  return person.program.name;
}
return 'No Program Assigned';
```

### ❌ Incorrect Pattern
```javascript
// Never parse job titles for program info
if (person.program && person.program.name) {
  return person.program.name;
} else if (person.jobTitle) {
  const parts = person.jobTitle.split(' - ');
  return parts[0]; // DON'T DO THIS
}
```

## Update Workflow

When updating person data:

1. **Update `people` collection** → Changes propagate automatically
2. **Program assignment changes** → Update both `people.programId` and `programs.updId` if needed
3. **Role changes** → Update `people.roles` array
4. **All components refresh** → Via adapted data

## Data Integrity Features

### Migration Support
- `migration-script.js` - Converts legacy data to normalized format
- `clear-faculty-programs.js` - Reset program assignments
- Automatic migration detection in `App.jsx`

### Data Hygiene
- `dataHygiene.js` - Standardization and validation
- `comprehensiveDataHygiene.js` - Duplicate detection
- Real-time data quality monitoring

### Import Processing
- `dataImportUtils.js` - Smart CSV import with deduplication
- `SmartDataImportPage.jsx` - Preview and role assignment
- Automatic relationship linking

## Benefits Achieved

1. **Zero Duplication** - Each piece of data exists in exactly one place
2. **Automatic Consistency** - Updates propagate to all views instantly
3. **Performance** - Efficient queries with proper indexing
4. **Maintainability** - Clear separation of concerns
5. **Scalability** - Normalized structure supports growth
6. **Data Quality** - Built-in validation and hygiene

## Component Status

| Component | Status | Uses Adapter | Program Source |
|-----------|--------|--------------|----------------|
| FacultyDirectory | ✅ | Yes | program.name |
| AdjunctDirectory | ✅ | Yes | program.name |
| StaffDirectory | ✅ | Yes | program.name |
| ProgramManagement | ✅ | Yes | program.name |
| BuildingDirectory | ✅ | Yes | Adapted data |
| EmailLists | ✅ | Yes | program.name |

All components now follow the single source of truth principle! 