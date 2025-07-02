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
import { doc, updateDoc, getDocs, collection } from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';

const ProgramManagement = ({ 
  facultyData,
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
  const [showAdjuncts, setShowAdjuncts] = useState(false);
  const [expandedPrograms, setExpandedPrograms] = useState(new Set());
  const [programs, setPrograms] = useState([]);

  // Load programs data
  useEffect(() => {
    const loadPrograms = async () => {
      try {
        const programsSnapshot = await getDocs(collection(db, COLLECTIONS.PROGRAMS));
        const programsData = programsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPrograms(programsData);
      } catch (error) {
        console.error('Error loading programs:', error);
      }
    };
    loadPrograms();
  }, []);

  // Organize faculty by program using the reliable program data
  const programData = useMemo(() => {
    if (!facultyData || !Array.isArray(facultyData)) return {};

    const programGroups = {};
    
    // Filter out adjuncts if the toggle is off
    const facultyToProcess = showAdjuncts ? facultyData : facultyData.filter(f => !f.isAdjunct);
    
    facultyToProcess.forEach(faculty => {
      // Use the program from faculty data (which comes from the programs collection)
      let programName = 'Unassigned';
      
      if (faculty.program && faculty.program.name) {
        programName = faculty.program.name;
      }

      if (!programGroups[programName]) {
        programGroups[programName] = {
          name: programName,
          faculty: [],
          upd: null,
          programId: faculty.program ? faculty.program.id : null
        };
      }

      programGroups[programName].faculty.push(faculty);

      // Check if this faculty member is marked as UPD
      if (faculty.isUPD) {
        // Check if this program has this faculty as UPD
        const programInfo = programs.find(p => p.id === faculty.programId);
        if (programInfo && programInfo.updId === faculty.id) {
          programGroups[programName].upd = faculty;
        }
      }
    });

    return programGroups;
  }, [facultyData, showAdjuncts]);

  const programList = Object.keys(programData).sort();

  // Filter faculty based on selected program and search
  const filteredFaculty = useMemo(() => {
    let faculty = facultyData || [];
    
    // Filter out adjuncts if the toggle is off
    if (!showAdjuncts) {
      faculty = faculty.filter(f => !f.isAdjunct);
    }

    if (selectedProgram !== 'all') {
      // Find faculty in the selected program from programData
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
  }, [facultyData, programData, selectedProgram, searchText, showAdjuncts]);

  // Handle UPD designation - now updates the programs collection
  const handleSetUPD = async (programName, faculty) => {
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

      // Find the program in our programs data
      const program = programData[programName];
      if (!program || !program.programId) {
        showNotification(
          'error',
          'Program Error',
          'Cannot find program information. Please refresh and try again.'
        );
        return;
      }

      // Remove UPD from previous UPD in this program
      const currentUPD = program.upd;
      if (currentUPD && currentUPD.id !== faculty.id) {
        await onFacultyUpdate({
          ...currentUPD,
          isUPD: false,
          updatedAt: new Date().toISOString()
        });
      }

      // Set new UPD on the faculty member
      await onFacultyUpdate({
        ...faculty,
        isUPD: true,
        updatedAt: new Date().toISOString()
      });

      // Update the programs collection to reference this faculty member as UPD
      const programRef = doc(db, COLLECTIONS.PROGRAMS, program.programId);
      await updateDoc(programRef, {
        updId: faculty.id,
        updatedAt: new Date().toISOString()
      });

      showNotification(
        'success',
        'UPD Updated',
        `${faculty.name} is now the Undergraduate Program Director for ${programName}`
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
    setDragOverDepartment(program);
  };

  const handleDragLeave = (e) => {
    // Only clear if we're actually leaving the drop zone
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverDepartment(null);
    }
  };

  const handleDrop = async (e, targetProgramName) => {
    e.preventDefault();
    setDragOverDepartment(null);

    if (!draggedFaculty || !targetProgramName) {
      setDraggedFaculty(null);
      return;
    }

    // Don't move if already in the target program
    const currentProgram = Object.keys(programData).find(prog => 
      programData[prog].faculty.some(f => f.id === draggedFaculty.id)
    );
    
    if (currentProgram === targetProgramName) {
      setDraggedFaculty(null);
      return;
    }

    try {
      // Find the target program ID
      const targetProgram = programData[targetProgramName];
      if (!targetProgram || !targetProgram.programId) {
        showNotification(
          'error',
          'Program Error',
          'Cannot find target program information.'
        );
        setDraggedFaculty(null);
        return;
      }

      // Update faculty member's programId
      const updateData = {
        ...draggedFaculty,
        programId: targetProgram.programId,
        updatedAt: new Date().toISOString()
      };

      await onFacultyUpdate(updateData);

      showNotification(
        'success',
        'Faculty Moved',
        `${draggedFaculty.name} moved to ${targetProgramName} program`
      );
    } catch (error) {
      console.error('Error moving faculty:', error);
      showNotification('error', 'Error', 'Failed to move faculty member. Please try again.');
    }

    setDraggedFaculty(null);
  };

  // Handle program change via dropdown
  const handleProgramChange = async (faculty, newProgramName) => {
    if (!faculty || !newProgramName) return;

    // Don't move if already in the target program
    const currentProgram = Object.keys(programData).find(program => 
      programData[program].faculty.some(f => f.id === faculty.id)
    );
    
    if (currentProgram === newProgramName) return;

    try {
      // Find the target program ID
      const targetProgram = programData[newProgramName];
      if (!targetProgram || !targetProgram.programId) {
        showNotification(
          'error',
          'Program Error',
          'Cannot find target program information.'
        );
        return;
      }

      // Update faculty member's programId
      const updateData = {
        ...faculty,
        programId: targetProgram.programId,
        updatedAt: new Date().toISOString()
      };

      await onFacultyUpdate(updateData);

      showNotification(
        'success',
        'Faculty Moved',
        `${faculty.name} moved to ${newProgramName} program`
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

    // For now, just show a notification that this would need to be implemented
    showNotification(
      'info',
      'Feature Not Implemented',
      'Creating new programs will be implemented in a future update'
    );
    
    setNewProgramName('');
    setShowCreateProgram(false);
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
          const isDragOver = dragOverDepartment === programName;
          
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
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingUPD(null)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingUPD(programName)}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Edit UPD"
                    >
                      <Edit size={14} />
                    </button>
                  )}
                </div>
                
                {editingUPD === programName ? (
                  <div className="mt-2 space-y-2 max-h-32 overflow-y-auto">
                    {program.faculty.filter(f => !f.isAdjunct).map(faculty => (
                      <button
                        key={faculty.id}
                        onClick={() => handleSetUPD(programName, faculty)}
                        className="w-full text-left p-2 text-sm bg-white rounded border hover:bg-baylor-green/5 hover:border-baylor-green/30 transition-all"
                      >
                        <div className="font-medium text-gray-900">{faculty.name}</div>
                        <div className="text-gray-500 text-xs">{faculty.jobTitle}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2">
                    {program.upd ? (
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">{program.upd.name}</div>
                        <div className="text-gray-500 text-xs">{program.upd.jobTitle}</div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 italic">No UPD assigned</div>
                    )}
                  </div>
                )}
              </div>

              {/* Faculty Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Faculty</span>
                  <button
                    onClick={() => toggleProgramExpansion(programName)}
                    className="text-xs text-baylor-green hover:text-baylor-green/80 transition-colors"
                  >
                    {expandedPrograms.has(programName) ? 'Show Less' : 'Show All'}
                  </button>
                </div>
                
                <div className="space-y-2">
                  {(expandedPrograms.has(programName) ? program.faculty : program.faculty.slice(0, 3)).map(faculty => (
                    <div
                      key={faculty.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, faculty)}
                      className="flex items-center justify-between p-2 bg-white rounded border border-gray-200 hover:border-baylor-green/30 transition-all cursor-move group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <GripVertical size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="min-w-0">
                          <div className="font-medium text-sm text-gray-900 truncate">{faculty.name}</div>
                          <div className="text-xs text-gray-500 truncate">{faculty.jobTitle}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setSelectedFacultyForCard(faculty)}
                          className="p-1 text-gray-400 hover:text-baylor-green transition-colors"
                          title="View Details"
                        >
                          <Users size={12} />
                        </button>
                        <div className="relative">
                          <select
                            value={programName}
                            onChange={(e) => handleProgramChange(faculty, e.target.value)}
                            className="text-xs border-0 bg-transparent cursor-pointer text-gray-400 hover:text-baylor-green transition-colors"
                            title="Move to Program"
                          >
                            <option value={programName}>{programName}</option>
                            {programList.filter(p => p !== programName).map(otherProgram => (
                              <option key={otherProgram} value={otherProgram}>
                                {otherProgram}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {!expandedPrograms.has(programName) && program.faculty.length > 3 && (
                    <div className="text-center py-2">
                      <span className="text-xs text-gray-500">
                        +{program.faculty.length - 3} more faculty
                      </span>
                    </div>
                  )}
                </div>
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

      {/* Faculty Contact Card Modal */}
      {selectedFacultyForCard && (
        <FacultyContactCard
          faculty={selectedFacultyForCard}
          onClose={() => setSelectedFacultyForCard(null)}
          onUpdate={onFacultyUpdate}
          showNotification={showNotification}
        />
      )}

      {/* Create New Program Modal */}
      {showCreateProgram && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="modal-header">
              <h3 className="modal-title">Create New Program</h3>
              <button 
                onClick={() => setShowCreateProgram(false)}
                className="modal-close"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Program Name
                  </label>
                  <input
                    type="text"
                    value={newProgramName}
                    onChange={(e) => setNewProgramName(e.target.value)}
                    className="input-field"
                    placeholder="Enter program name..."
                    autoFocus
                  />
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                onClick={() => setShowCreateProgram(false)}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button 
                onClick={createNewProgram}
                className="btn-primary"
                disabled={!newProgramName.trim()}
              >
                <Plus size={16} className="mr-2" />
                Create Program
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProgramManagement; 