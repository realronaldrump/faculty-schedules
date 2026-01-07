import React from 'react';
import PersonDirectory from './PersonDirectory';
import { facultyDirectoryConfig } from './personDirectoryConfigs.jsx';
import { useData } from '../contexts/DataContext';
import { usePeopleOperations } from '../hooks';

const FacultyDirectory = () => {
  const { facultyData, scheduleData, programs } = useData();
  const { handleFacultyUpdate, handleStaffUpdate, handleFacultyDelete } = usePeopleOperations();

  return (
    <PersonDirectory
      config={facultyDirectoryConfig}
      data={facultyData}
      scheduleData={scheduleData}
      programs={programs}
      onUpdate={handleFacultyUpdate}
      onRelatedUpdate={handleStaffUpdate}
      onDelete={handleFacultyDelete}
    />
  );
};

export default FacultyDirectory;
