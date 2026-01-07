import React, { useState, useMemo } from 'react';
import {
  Building2,
  MapPin,
  Search,
  Filter,
  Users,
  Mail,
  Phone,
  PhoneOff,
  Building,
  BuildingIcon,
  ChevronDown,
  ChevronRight,
  UserCog,
  Eye,
  Wifi
} from 'lucide-react';
import FacultyContactCard from './FacultyContactCard';

const BuildingDirectory = ({
  facultyData,
  staffData,
  showNotification,
  scheduleData,
  rawScheduleData
}) => {
  const [selectedPersonForCard, setSelectedPersonForCard] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState('all');
  const [expandedBuildings, setExpandedBuildings] = useState(new Set());
  const [showStaff, setShowStaff] = useState(true);
  const [showFaculty, setShowFaculty] = useState(true);
  const [showAdjuncts, setShowAdjuncts] = useState(true);

  // Helper function to extract building name from office location
  const extractBuildingName = (officeLocation) => {
    if (!officeLocation || officeLocation.trim() === '') {
      return 'No Building';
    }

    const office = officeLocation.trim();

    // Handle common building name patterns
    const buildingKeywords = ['BUILDING', 'HALL', 'GYMNASIUM', 'TOWER', 'CENTER', 'COMPLEX'];

    // Check if office contains building keywords
    for (const keyword of buildingKeywords) {
      const keywordIndex = office.toUpperCase().indexOf(keyword);
      if (keywordIndex !== -1) {
        // Include everything up to and including the keyword
        const endIndex = keywordIndex + keyword.length;
        return office.substring(0, endIndex).trim();
      }
    }

    // If no building keywords found, try to extract building name before room numbers
    // Look for patterns where building name ends before standalone numbers
    const match = office.match(/^([A-Za-z\s]+?)(\s+\d+.*)?$/);
    if (match && match[1]) {
      return match[1].trim();
    }

    // Handle special cases like "801 WASHINGTON TOWER" where number is part of building name
    // If it starts with a number followed by words, keep it all as building name
    const startsWithNumber = office.match(/^\d+\s+[A-Za-z]/);
    if (startsWithNumber) {
      // Look for room-like patterns at the end
      const roomPattern = office.match(/^(.+?)(\s+\d{2,4}(\s+\d+)*)$/);
      if (roomPattern) {
        return roomPattern[1].trim();
      }
      return office; // Keep whole thing if no clear room pattern
    }

    return office; // Fallback: return the whole office location
  };

  // Helper function to extract room number from office location
  const extractRoomNumber = (officeLocation) => {
    if (!officeLocation || officeLocation.trim() === '') {
      return '';
    }

    const office = officeLocation.trim();

    // Try to extract room number - look for numbers at the end
    const roomMatch = office.match(/(\d+[A-Za-z]?)$/);
    if (roomMatch) {
      return roomMatch[1];
    }

    // For complex patterns, try to find room-like patterns
    const complexMatch = office.match(/\s+(\d{2,4}[A-Za-z]?)\s*$/);
    if (complexMatch) {
      return complexMatch[1];
    }

    return '';
  };

  // Combine and organize all people by building
  const buildingData = useMemo(() => {
    const buildings = {};

    // Process faculty data
    if (showFaculty && facultyData && Array.isArray(facultyData)) {
      const facultyToProcess = showAdjuncts ? facultyData : facultyData.filter(f => !f.isAdjunct);

      facultyToProcess.forEach(person => {
        // Route remote people to "Remote" section, otherwise use building
        let buildingName;
        if (person.isRemote) {
          buildingName = 'Remote';
        } else {
          buildingName = person.office ? extractBuildingName(person.office) : 'No Building';
        }
        const roomNumber = person.office ? extractRoomNumber(person.office) : '';

        if (!buildings[buildingName]) {
          buildings[buildingName] = {
            name: buildingName,
            people: [],
            facultyCount: 0,
            staffCount: 0
          };
        }

        buildings[buildingName].people.push({
          ...person,
          roleType: 'faculty',
          displayRole: person.isAdjunct ? 'Adjunct Faculty' : 'Faculty',
          buildingName,
          roomNumber,
          sortKey: roomNumber || person.name || ''
        });
        buildings[buildingName].facultyCount++;
      });
    }

    // Process staff data
    if (showStaff && staffData && Array.isArray(staffData)) {
      staffData.forEach(person => {
        // Route remote people to "Remote" section, otherwise use building
        let buildingName;
        if (person.isRemote) {
          buildingName = 'Remote';
        } else {
          buildingName = person.office ? extractBuildingName(person.office) : 'No Building';
        }
        const roomNumber = person.office ? extractRoomNumber(person.office) : '';

        if (!buildings[buildingName]) {
          buildings[buildingName] = {
            name: buildingName,
            people: [],
            facultyCount: 0,
            staffCount: 0
          };
        }

        buildings[buildingName].people.push({
          ...person,
          roleType: 'staff',
          displayRole: person.isAlsoFaculty ? 'Faculty & Staff' : 'Staff',
          buildingName,
          roomNumber,
          sortKey: roomNumber || person.name || ''
        });
        buildings[buildingName].staffCount++;
      });
    }

    // Sort people within each building by room number, then by name
    Object.values(buildings).forEach(building => {
      building.people.sort((a, b) => {
        // First sort by room number (numeric)
        const roomA = parseInt(a.roomNumber) || 9999;
        const roomB = parseInt(b.roomNumber) || 9999;
        if (roomA !== roomB) {
          return roomA - roomB;
        }

        // Then sort by name
        return (a.name || '').localeCompare(b.name || '');
      });
    });

    return buildings;
  }, [facultyData, staffData, showFaculty, showStaff, showAdjuncts]);

  const buildingList = Object.keys(buildingData).sort();

  // Filter buildings and people based on search and selected building
  const filteredData = useMemo(() => {
    let buildings = { ...buildingData };

    // Filter by selected building
    if (selectedBuilding !== 'all') {
      buildings = { [selectedBuilding]: buildingData[selectedBuilding] };
    }

    // Apply search filter
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      const filteredBuildings = {};

      Object.entries(buildings).forEach(([buildingName, building]) => {
        const filteredPeople = building.people.filter(person =>
          person.name?.toLowerCase().includes(searchLower) ||
          person.email?.toLowerCase().includes(searchLower) ||
          person.jobTitle?.toLowerCase().includes(searchLower) ||
          person.office?.toLowerCase().includes(searchLower) ||
          person.roomNumber?.toLowerCase().includes(searchLower)
        );

        if (filteredPeople.length > 0) {
          filteredBuildings[buildingName] = {
            ...building,
            people: filteredPeople
          };
        }
      });

      return filteredBuildings;
    }

    return buildings;
  }, [buildingData, selectedBuilding, searchText]);

  // Toggle building card expansion
  const toggleBuildingExpansion = (buildingName) => {
    const newExpanded = new Set(expandedBuildings);
    if (newExpanded.has(buildingName)) {
      newExpanded.delete(buildingName);
    } else {
      newExpanded.add(buildingName);
    }
    setExpandedBuildings(newExpanded);
  };

  // Format phone number
  const formatPhoneNumber = (phoneStr) => {
    if (!phoneStr) return '-';
    const cleaned = ('' + phoneStr).replace(/\D/g, '');
    if (cleaned.length === 10) {
      const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
      if (match) {
        return `(${match[1]}) ${match[2]}-${match[3]}`;
      }
    }
    return phoneStr;
  };

  const totalPeople = Object.values(filteredData).reduce((sum, building) => sum + building.people.length, 0);
  const totalBuildings = Object.keys(filteredData).length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Office Directory</h1>
          <p className="text-gray-600">Find faculty and staff by building location</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-600">
            {totalPeople} people across {totalBuildings} buildings
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4 items-center">
          <div className="flex items-center gap-2 flex-1">
            <Search size={16} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, title, room, or office..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-baylor-green"
            />
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-400" />
              <select
                value={selectedBuilding}
                onChange={(e) => setSelectedBuilding(e.target.value)}
                className="p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-baylor-green"
              >
                <option value="all">All Buildings</option>
                {buildingList.map(building => (
                  <option key={building} value={building}>{building}</option>
                ))}
              </select>
            </div>

            {/* Role Toggles */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showFaculty}
                  onChange={(e) => setShowFaculty(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                />
                <span className="text-sm text-gray-700">Faculty</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showStaff}
                  onChange={(e) => setShowStaff(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                />
                <span className="text-sm text-gray-700">Staff</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAdjuncts}
                  onChange={(e) => setShowAdjuncts(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                />
                <span className="text-sm text-gray-700">Adjuncts</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Building Cards */}
      <div className="space-y-4">
        {Object.keys(filteredData).length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Results Found</h3>
            <p className="text-gray-600">
              {searchText
                ? `No people found matching "${searchText}". Try adjusting your search or filters.`
                : 'No people found with the current filters. Try enabling more role types.'
              }
            </p>
          </div>
        ) : (
          Object.entries(filteredData)
            .sort(([a], [b]) => {
              // Sort "Remote" and "No Building" last, with Remote before No Building
              if (a === 'Remote' && b === 'No Building') return -1;
              if (a === 'No Building' && b === 'Remote') return 1;
              if (a === 'Remote') return 1;
              if (b === 'Remote') return -1;
              if (a === 'No Building') return 1;
              if (b === 'No Building') return -1;
              return a.localeCompare(b);
            })
            .map(([buildingName, building]) => {
              const isExpanded = expandedBuildings.has(buildingName);

              return (
                <div
                  key={buildingName}
                  className="bg-white rounded-lg border border-gray-200 shadow-sm"
                >
                  {/* Building Header */}
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleBuildingExpansion(buildingName)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown size={20} className="text-gray-400" />
                        ) : (
                          <ChevronRight size={20} className="text-gray-400" />
                        )}
                        <Building2 size={24} className="text-baylor-green" />
                        <div>
                          <h2 className="text-lg font-semibold text-gray-900">
                            {buildingName}
                          </h2>
                          <p className="text-sm text-gray-600">
                            {building.people.length} people
                            {building.facultyCount > 0 && building.staffCount > 0 &&
                              ` • ${building.facultyCount} faculty, ${building.staffCount} staff`
                            }
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {building.facultyCount > 0 && (
                          <span className="bg-baylor-green/10 text-baylor-green px-2 py-1 rounded-full text-xs font-medium">
                            {building.facultyCount} Faculty
                          </span>
                        )}
                        {building.staffCount > 0 && (
                          <span className="bg-baylor-gold/20 text-baylor-gold px-2 py-1 rounded-full text-xs font-medium">
                            {building.staffCount} Staff
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Building Content */}
                  {isExpanded && (
                    <div className="border-t border-gray-200">
                      <div className="overflow-x-auto">
                        <table className="min-w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Room
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Name & Role
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Position
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Contact
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {building.people.map(person => {
                              // Ensure a unique key by combining id and roleType (faculty/staff)
                              const rowKey = `${person.id}-${person.roleType}`;
                              return (
                                <tr
                                  key={rowKey}
                                  className="hover:bg-gray-50 cursor-pointer"
                                  onClick={() => setSelectedPersonForCard(person)}
                                >
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                      <MapPin size={14} className="text-gray-400" />
                                      <span className="text-sm font-medium text-gray-900">
                                        {person.roomNumber || 'No room'}
                                      </span>
                                    </div>
                                    {person.office && (
                                      <div className="text-xs text-gray-500 mt-1">
                                        {person.office}
                                      </div>
                                    )}
                                  </td>

                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <div>
                                      <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                                        {person.name}
                                        {person.isUPD && (
                                          <UserCog size={14} className="text-amber-600" title="Undergraduate Program Director" />
                                        )}
                                      </div>
                                      <div className="text-xs text-gray-600">
                                        {person.displayRole}
                                      </div>
                                      {person.program && person.program.name && (
                                        <div className="text-xs text-baylor-green font-medium">
                                          {person.program.name}
                                        </div>
                                      )}
                                    </div>
                                  </td>

                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <div className="text-sm text-gray-900">{person.jobTitle || '-'}</div>
                                    <div className="flex gap-1 mt-1 flex-wrap">
                                      {person.isTenured && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                          Tenured
                                        </span>
                                      )}
                                      {person.isAdjunct && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                          Adjunct
                                        </span>
                                      )}
                                      {person.isRemote && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800">
                                          <Wifi size={12} className="mr-1" />
                                          Remote
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                    <div className="space-y-1">
                                      {person.email && (
                                        <div className="flex items-center gap-1">
                                          <Mail size={12} />
                                          <a
                                            href={`mailto:${person.email}`}
                                            className="text-baylor-green hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {person.email}
                                          </a>
                                        </div>
                                      )}
                                      {person.phone && !person.hasNoPhone && (
                                        <div className="flex items-center gap-1">
                                          <Phone size={12} />
                                          {formatPhoneNumber(person.phone)}
                                        </div>
                                      )}
                                      {person.hasNoPhone && (
                                        <div className="flex items-center gap-1 text-gray-400">
                                          <PhoneOff size={12} />
                                          No phone
                                        </div>
                                      )}
                                    </div>
                                  </td>

                                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedPersonForCard(person);
                                      }}
                                      className="text-baylor-green hover:text-baylor-green/80 flex items-center gap-1"
                                    >
                                      <Eye size={16} />
                                      View
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
        )}
      </div>

      {/* Contact Card Modal */}
      {selectedPersonForCard && (
        <FacultyContactCard
          faculty={selectedPersonForCard}
          onClose={() => setSelectedPersonForCard(null)}
        />
      )}
    </div>
  );
};

export default BuildingDirectory; 