import React from 'react';
import PersonDirectory from './PersonDirectory';
import { adjunctDirectoryConfig } from './personDirectoryConfigs.jsx';

const AdjunctDirectory = ({
  facultyData,
  scheduleData = [],
  onFacultyUpdate,
  onStaffUpdate,
  onFacultyDelete,
  programs = []
}) => (
  <PersonDirectory
    config={adjunctDirectoryConfig}
    data={facultyData}
    scheduleData={scheduleData}
    programs={programs}
    onUpdate={onFacultyUpdate}
    onRelatedUpdate={onStaffUpdate}
    onDelete={onFacultyDelete}
  />
);

export default AdjunctDirectory;
