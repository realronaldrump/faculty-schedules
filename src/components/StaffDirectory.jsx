import React from 'react';
import PersonDirectory from './PersonDirectory';
import { staffDirectoryConfig } from './personDirectoryConfigs.jsx';
import { useData } from '../contexts/DataContext';
import { usePeopleOperations } from '../hooks';

const StaffDirectory = () => {
  const { directoryData, programs } = useData();
  const { handleFacultyUpdate, handleStaffUpdate, handleStaffDelete } = usePeopleOperations();

  return (
    <PersonDirectory
      config={staffDirectoryConfig}
      data={directoryData}
      programs={programs}
      onUpdate={handleStaffUpdate}
      onRelatedUpdate={handleFacultyUpdate}
      onDelete={handleStaffDelete}
    />
  );
};

export default StaffDirectory;
