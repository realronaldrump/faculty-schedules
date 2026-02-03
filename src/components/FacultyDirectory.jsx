import React from 'react';
import PersonDirectory from './PersonDirectory';
import { facultyDirectoryConfig } from './PersonDirectoryConfigs.jsx';
import { useData } from '../contexts/DataContext';
import { usePeopleOperations } from '../hooks';

const FacultyDirectory = () => {
  const { directoryData, scheduleData, programs } = useData();
  const { handleFacultyUpdate, handleStaffUpdate, handleFacultyDelete } = usePeopleOperations();

  return (
    <PersonDirectory
      config={facultyDirectoryConfig}
      data={directoryData}
      scheduleData={scheduleData}
      programs={programs}
      onUpdate={handleFacultyUpdate}
      onRelatedUpdate={handleStaffUpdate}
      onDelete={handleFacultyDelete}
    />
  );
};

export default FacultyDirectory;
