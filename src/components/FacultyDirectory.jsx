import React from 'react';
import PersonDirectory from './PersonDirectory';
import { facultyDirectoryConfig } from './personDirectoryConfigs.jsx';

const FacultyDirectory = ({
  facultyData,
  scheduleData = [],
  onFacultyUpdate,
  onStaffUpdate,
  onFacultyDelete,
  programs = []
}) => (
  <PersonDirectory
    config={facultyDirectoryConfig}
    data={facultyData}
    scheduleData={scheduleData}
    programs={programs}
    onUpdate={onFacultyUpdate}
    onRelatedUpdate={onStaffUpdate}
    onDelete={onFacultyDelete}
  />
);

export default FacultyDirectory;
