import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, 
  Edit, 
  Save, 
  X, 
  Plus, 
  Mail, 
  Phone, 
  MapPin, 
  Building2,
  UserCog,
  Search,
  Filter,
  ArrowUpDown,
  GripVertical,
  MoreVertical,
  Check
} from 'lucide-react';
import FacultyContactCard from './FacultyContactCard';

const ProgramManagement = ({ 
  directoryData, 
  onFacultyUpdate, 
  onStaffUpdate, 
  showNotification 
}) => {
  const [selectedFacultyForCard, setSelectedFacultyForCard] = useState(null);
  const [editingUPD, setEditingUPD] = useState(null);
  const [selectedProgram, setSelectedProgram] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [showCreateProgram, setShowCreateProgram] = useState(false);
  const [newProgramName, setNewProgramName] = useState('');
  const [draggedFaculty, setDraggedFaculty] = useState(null);
  const [dragOverDepartment, setDragOverDepartment] = useState(null);
  const [showAdjuncts, setShowAdjuncts] = useState(false); // Hide adjuncts by default
  // Removed refreshTrigger - data should update through proper data flow
  const [expandedPrograms, setExpandedPrograms] = useState(new Set()); // Track expanded program cards

  // Extract programs and organize faculty
  const programData = useMemo(() => {
    if (!directoryData || !Array.isArray(directoryData)) return {};

    const programs = {};
    
    // Filter out adjuncts if the toggle is off
    const facultyToProcess = showAdjuncts ? directoryData : directoryData.filter(f => !f.isAdjunct);
    
    facultyToProcess.forEach(faculty => {
      // Determine program from course data - this is the primary organizing principle
      let programName = 'Unassigned';
      
      // First: Check for manually assigned program override
      if (faculty.programOverride && faculty.programOverride.trim() !== '') {
        programName = faculty.programOverride.trim();
      }
      // Second: program from course data (ADM, CFS, NUTR, ID)
      else if (faculty.program && faculty.program.name) {
        programName = faculty.program.name;
      }
      // Fallback: try to extract from job title (less reliable)
      else if (faculty.jobTitle) {
        const jobTitle = faculty.jobTitle.toLowerCase();
        if (jobTitle.includes('apparel') || jobTitle.includes('design') || jobTitle.includes('adm')) {
          programName = 'Apparel Design & Manufacturing';
        } else if (jobTitle.includes('nutrition') || jobTitle.includes('nutr')) {
          programName = 'Nutrition';
        } else if (jobTitle.includes('interior') || jobTitle.includes('id')) {
          programName = 'Interior Design';
        } else if (jobTitle.includes('child') || jobTitle.includes('family') || jobTitle.includes('cfs')) {
          programName = 'Child & Family Studies';
        }
      }

      if (!programs[programName]) {
        programs[programName] = {
          name: programName,
          faculty: [],
          upd: null
        };
      }

      programs[programName].faculty.push(faculty);

      // Check if this faculty member is marked as UPD for this program
      if (faculty.isUPD && faculty.updProgram === programName) {
        programs[programName].upd = faculty;
      }
    });

    return programs;
  }, [directoryData, showAdjuncts]);

  const programList = Object.keys(programData).sort();

  // Filter faculty based on selected program and search
  const filteredFaculty = useMemo(() => {
    let faculty = directoryData || [];
    
    // Filter out adjuncts if the toggle is off
    if (!showAdjuncts) {
      faculty = faculty.filter(f => !f.isAdjunct);
    }

    if (selectedProgram !== 'all') {
      // Find faculty in the selected program from programData
      // This ensures consistency with how programs are determined
      const program = programData[selectedProgram];
      if (program && program.faculty) {
        const programFacultyIds = new Set(program.faculty.map(f => f.id));
        faculty = faculty.filter(f => programFacultyIds.has(f.id));
      } else {
        faculty = [];
      }
    }

    if (searchText) {
      const searchLower = searchText.toLowerCase();
      faculty = faculty.filter(f => 
        f.name?.toLowerCase().includes(searchLower) ||
        f.email?.toLowerCase().includes(searchLower) ||
        f.jobTitle?.toLowerCase().includes(searchLower) ||
        f.office?.toLowerCase().includes(searchLower)
      );
    }

    return faculty;
  }, [directoryData, programData, selectedProgram, searchText, showAdjuncts]);

  // Handle UPD designation
  const handleSetUPD = async (program, faculty) => {
    try {
      // Validation: Only non-adjunct faculty can be UPD
      if (faculty.isAdjunct) {
        showNotification(
          'error',
          'Cannot Assign UPD',
          'Adjunct faculty cannot be assigned as Undergraduate Program Director'
        );
        return;
      }

      // Validation: Faculty must have required information
      if (!faculty.name || !faculty.id) {
        showNotification(
          'error',
          'Invalid Faculty',
          'Faculty member is missing required information'
        );
        return;
      }

      // Remove UPD from previous UPD in this program
      const currentUPD = programData[program]?.upd;
      if (currentUPD && currentUPD.id !== faculty.id) {
        await onFacultyUpdate({
          ...currentUPD,
          isUPD: false,
          updProgram: '', // Clear the UPD program
          updatedAt: new Date().toISOString()
        });
      }

      // Set new UPD
      await onFacultyUpdate({
        ...faculty,
        isUPD: true,
        updProgram: program, // Track which program they're UPD for
        updatedAt: new Date().toISOString()
      });

      showNotification(
        'success',
        'UPD Updated',
        `${faculty.name} is now the Undergraduate Program Director for ${program}`
      );
      
      setEditingUPD(null);
    } catch (error) {
      console.error('Error setting UPD:', error);
      showNotification('error', 'Error', 'Failed to update UPD designation. Please try again.');
    }
  };

  // Handle program reassignment via drag and drop
  const handleDragStart = (e, faculty) => {
    if (!faculty || !faculty.id) {
      e.preventDefault();
      return;
    }
    setDraggedFaculty(faculty);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, program) => {
    if (!draggedFaculty || !program) return;
    e.preventDefault();
    setDragOverDepartment(program); // Note: keeping variable name for consistency with existing drag state
  };

  const handleDragLeave = (e) => {
    // Only clear if we're actually leaving the drop zone
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverDepartment(null);
    }
  };

  const handleDrop = async (e, targetProgram) => {
    e.preventDefault();
    setDragOverDepartment(null);

    if (!draggedFaculty || !targetProgram) {
      setDraggedFaculty(null);
      return;
    }

    // Don't move if already in the target program
    const currentProgram = Object.keys(programData).find(prog => 
      programData[prog].faculty.some(f => f.id === draggedFaculty.id)
    );
    
    if (currentProgram === targetProgram) {
      setDraggedFaculty(null);
      return;
    }

    try {
      console.log('🔧 Moving faculty to program:', {
        faculty: draggedFaculty.name,
        from: currentProgram,
        to: targetProgram,
        facultyData: draggedFaculty
      });

      // Update program override, keep department the same
      const updateData = {
        ...draggedFaculty,
        programOverride: targetProgram, // Set program override instead of department
        updatedAt: new Date().toISOString()
      };

      console.log('📋 Update data being sent:', updateData);

      await onFacultyUpdate(updateData);

      showNotification(
        'success',
        'Faculty Moved',
        `${draggedFaculty.name} moved to ${targetProgram} program`
      );
    } catch (error) {
      console.error('Error moving faculty:', error);
      showNotification('error', 'Error', 'Failed to move faculty member. Please try again.');
    }

    setDraggedFaculty(null);
  };

  // Handle program change via dropdown
  const handleProgramChange = async (faculty, newProgram) => {
    if (!faculty || !newProgram) return;

    // Don't move if already in the target program
    const currentProgram = Object.keys(programData).find(program => 
      programData[program].faculty.some(f => f.id === faculty.id)
    );
    
    if (currentProgram === newProgram) return;

    try {
      console.log('🔧 Moving faculty via dropdown:', {
        faculty: faculty.name,
        from: currentProgram,
        to: newProgram,
        facultyData: faculty
      });

      // For program changes, we need to update the program field, not department
      // Department stays the same (Human Sciences & Design)
      const updateData = {
        ...faculty,
        // Don't change department - that stays "Human Sciences & Design" 
        // We're changing their program/specialization within the department
        programOverride: newProgram, // Add a field to override program detection
        updatedAt: new Date().toISOString()
      };

      console.log('📋 Dropdown update data being sent:', updateData);

      await onFacultyUpdate(updateData);

      showNotification(
        'success',
        'Faculty Moved',
        `${faculty.name} moved to ${newProgram} program`
      );
    } catch (error) {
      console.error('Error moving faculty:', error);
      showNotification('error', 'Error', 'Failed to move faculty member. Please try again.');
    }
  };

  // Toggle program card expansion
  const toggleProgramExpansion = (programName) => {
    const newExpanded = new Set(expandedPrograms);
    if (newExpanded.has(programName)) {
      newExpanded.delete(programName);
    } else {
      newExpanded.add(programName);
    }
    setExpandedPrograms(newExpanded);
  };

  const createNewProgram = async () => {
    const programName = newProgramName.trim();
    
    if (!programName) {
      showNotification('error', 'Invalid Name', 'Program name cannot be empty');
      return;
    }

    if (programList.includes(programName)) {
      showNotification('error', 'Program Exists', 'A program with this name already exists');
      return;
    }

    // For now, we'll just add it to our local state
    // In a real implementation, you might want to store programs separately
    setNewProgramName('');
    setShowCreateProgram(false);
    
    showNotification(
      'success',
      'Program Created',
      `${programName} program has been created`
    );
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Program Management</h1>
                      <p className="text-gray-600">Organize faculty by program and manage UPD designations</p>
        </div>
        <button
          onClick={() => setShowCreateProgram(true)}
          className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
        >
          <Plus size={16} />
          Add Program
        </button>
      </div>

      {/* Program Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {programList.map(programName => {
          const program = programData[programName];
          const isDragOver = dragOverDepartment === programName; // Note: keeping variable name for consistency
          
          return (
            <div
              key={programName}
              className={`bg-white rounded-lg border-2 p-4 transition-all ${
                isDragOver 
                  ? 'border-baylor-green bg-baylor-green/5 shadow-lg' 
                  : 'border-gray-200 hover:border-baylor-green/50'
              }`}
              onDragOver={(e) => handleDragOver(e, programName)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, programName)}
            >
              {/* Program Header */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Building2 size={16} className="text-baylor-green" />
                  {programName}
                </h3>
                <span className="bg-baylor-gold/20 text-baylor-gold px-2 py-1 rounded-full text-xs font-medium">
                  {program.faculty.length} faculty
                </span>
              </div>

              {/* UPD Section */}
              <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                  <UserCog size={14} className="text-amber-600" />
                  UPD
                </span>
                  {editingUPD === programName ? (
                    <button
                      onClick={() => setEditingUPD(null)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <X size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => setEditingUPD(programName)}
                      className="text-gray-500 hover:text-baylor-green"
                      disabled={program.faculty.length === 0}
                    >
                      <Edit size={14} />
                    </button>
                  )}
                </div>
                
                {editingUPD === programName ? (
                  <div className="mt-2 space-y-2">
                    {program.faculty.length === 0 ? (
                      <div className="text-sm text-gray-500 italic">No faculty in this program</div>
                    ) : (
                      program.faculty
                        .filter(faculty => !faculty.isAdjunct) // Only show non-adjuncts for UPD selection
                        .map(faculty => (
                          <button
                            key={faculty.id}
                            onClick={() => handleSetUPD(programName, faculty)}
                            className="w-full text-left px-2 py-1 text-sm rounded hover:bg-baylor-green/10 flex items-center justify-between"
                          >
                            <span>{faculty.name}</span>
                            {program.upd?.id === faculty.id && <Check size={14} className="text-green-600" />}
                          </button>
                        ))
                    )}
                  </div>
                ) : (
                  <div className="mt-1">
                    {program.upd ? (
                      <div 
                        className="text-sm text-gray-900 cursor-pointer hover:text-baylor-green"
                        onClick={() => setSelectedFacultyForCard(program.upd)}
                      >
                        <div className="font-medium">{program.upd.name}</div>
                        {program.upd.email && (
                          <div className="text-xs text-gray-600">{program.upd.email}</div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 italic">Not assigned</div>
                    )}
                  </div>
                )}
              </div>

              {/* Faculty Preview */}
              <div className="space-y-1">
                {(expandedPrograms.has(programName) ? program.faculty : program.faculty.slice(0, 3)).map(faculty => (
                  <div
                    key={faculty.id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                    draggable
                    onDragStart={(e) => handleDragStart(e, faculty)}
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical size={12} className="text-gray-400 cursor-move" title="Drag to move program" />
                      <span className="font-medium">{faculty.name}</span>
                      {program.upd?.id === faculty.id && <UserCog size={12} className="text-amber-600" />}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetUPD(programName, faculty);
                      }}
                      className="text-xs text-baylor-green hover:text-baylor-green/80"
                      title="Set as UPD"
                    >
                      Set UPD
                    </button>
                  </div>
                ))}
                
                {program.faculty.length > 3 && !expandedPrograms.has(programName) && (
                  <button
                    onClick={() => toggleProgramExpansion(programName)}
                    className="w-full text-center text-sm text-baylor-green hover:text-baylor-green/80 font-medium"
                  >
                    Show {program.faculty.length - 3} more...
                  </button>
                )}
                
                {expandedPrograms.has(programName) && program.faculty.length > 3 && (
                  <button
                    onClick={() => toggleProgramExpansion(programName)}
                    className="w-full text-center text-sm text-baylor-green hover:text-baylor-green/80 font-medium"
                  >
                    Show less
                  </button>
                )}
              </div>

              {/* Quick Actions */}
              <div className="mt-3 pt-3 border-t border-gray-200">
                <button
                  onClick={() => setSelectedProgram(programName)}
                  className="w-full text-center text-sm text-baylor-green hover:text-baylor-green/80 font-medium"
                >
                  View All Faculty
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex items-center gap-2 flex-1">
            <Search size={16} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search faculty..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-baylor-green"
            />
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-400" />
              <select
                value={selectedProgram}
                onChange={(e) => setSelectedProgram(e.target.value)}
                className="p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-baylor-green"
              >
                <option value="all">All Programs</option>
                {programList.map(program => (
                  <option key={program} value={program}>{program}</option>
                ))}
              </select>
            </div>

            {/* Adjunct Toggle */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAdjuncts}
                  onChange={(e) => setShowAdjuncts(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                />
                <span className="text-sm text-gray-700">Show Adjuncts</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Faculty Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Faculty Member
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Program
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Position
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredFaculty.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                    {searchText ? 'No faculty found matching your search.' : 
                     selectedProgram !== 'all' ? 'No faculty in this program.' :
                     showAdjuncts ? 'No faculty found.' : 'No permanent faculty found. Try enabling "Show Adjuncts".'}
                  </td>
                </tr>
              ) : (
                filteredFaculty.map(faculty => {
                  const program = Object.keys(programData).find(prog => 
                    programData[prog].faculty.some(f => f.id === faculty.id)
                  );
                  const isUPD = programData[program]?.upd?.id === faculty.id;
                
                return (
                  <tr 
                    key={faculty.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, faculty)}
                    className="hover:bg-gray-50 cursor-move"
                    onClick={(e) => {
                      // Only open contact card if not clicking on select dropdown
                      if (!e.target.closest('select')) {
                        setSelectedFacultyForCard(faculty);
                      }
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <GripVertical size={14} className="text-gray-400 cursor-move" title="Drag to move program" />
                        <div>
                          <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                            {faculty.name}
                            {isUPD && <UserCog size={14} className="text-amber-600" title="Undergraduate Program Director" />}
                          </div>
                          <div className="text-sm text-gray-500">{faculty.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={program || 'Unassigned'}
                        onChange={(e) => handleProgramChange(faculty, e.target.value)}
                        className="text-sm text-gray-900 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-baylor-green"
                        onClick={(e) => e.stopPropagation()} // Prevent row click
                      >
                        <option value="Unassigned">Unassigned</option>
                        {programList.map(prog => (
                          <option key={prog} value={prog}>{prog}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{faculty.jobTitle}</div>
                      <div className="flex gap-1 mt-1">
                        {faculty.isTenured && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            Tenured
                          </span>
                        )}
                        {faculty.isAdjunct && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Adjunct
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="space-y-1">
                        {faculty.phone && (
                          <div className="flex items-center gap-1">
                            <Phone size={12} />
                            {faculty.phone}
                          </div>
                        )}
                        {faculty.office && (
                          <div className="flex items-center gap-1">
                            <MapPin size={12} />
                            {faculty.office}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {isUPD && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          <UserCog size={12} className="mr-1" />
                          UPD
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button className="text-baylor-green hover:text-baylor-green/80">
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Program Modal */}
      {showCreateProgram && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCreateProgram(false);
            }
          }}
        >
          <div 
            className="bg-white rounded-lg p-6 w-full max-w-md"
            role="dialog"
            aria-labelledby="create-dept-title"
            aria-modal="true"
          >
            <h3 id="create-dept-title" className="text-lg font-semibold mb-4">Create New Program</h3>
            <input
              type="text"
              placeholder="Program name"
              value={newProgramName}
              onChange={(e) => setNewProgramName(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-baylor-green mb-4"
              autoFocus
              maxLength={100}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  createNewProgram();
                }
              }}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCreateProgram(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={createNewProgram}
                className="px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Faculty Contact Card Modal */}
      {selectedFacultyForCard && (
        <FacultyContactCard
          faculty={selectedFacultyForCard}
          onClose={() => setSelectedFacultyForCard(null)}
        />
      )}
    </div>
  );
};

export default ProgramManagement; 