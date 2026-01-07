import React from 'react';
import PersonDirectory from './PersonDirectory';
import { staffDirectoryConfig } from './personDirectoryConfigs.jsx';

const StaffDirectory = ({
  directoryData,
  onFacultyUpdate,
  onStaffUpdate,
  onStaffDelete,
  programs = []
}) => (
  <PersonDirectory
    config={staffDirectoryConfig}
    data={directoryData}
    programs={programs}
    onUpdate={onStaffUpdate}
    onRelatedUpdate={onFacultyUpdate}
    onDelete={onStaffDelete}
  />
);

export default StaffDirectory;
