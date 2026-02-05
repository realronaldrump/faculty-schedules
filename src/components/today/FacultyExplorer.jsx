import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Building2,
  Calendar,
  Coffee,
  GraduationCap,
  MapPin,
  Users,
  Zap,
} from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { useSchedules } from "../../contexts/ScheduleContext";
import { parseTermDate } from "../../utils/termUtils";
import {
  getAllFacultyLocations,
  getLocationStats,
  getRoomOccupancy,
  groupRoomsByBuilding,
  LOCATION_STATUS,
  sortFacultyLocations,
} from "../../utils/facultyLocationUtils";
import {
  buildingMatches,
  getBuildingDisplay,
} from "../../utils/locationService";
import { getActiveFacultyList } from "../../utils/facultyFinderUtils";
import FacultyStatusBadge from "./FacultyStatusBadge";

const QuickStats = ({ stats, isWeekend }) => {
  if (isWeekend) {
    return (
      <div className="flex items-center gap-6 text-sm text-gray-500">
        <span className="flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Weekend - No scheduled classes
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-sm">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-baylor-green rounded-full animate-pulse" />
        <span className="text-gray-600">
          <span className="font-semibold text-baylor-green">
            {stats.teaching}
          </span>{" "}
          teaching
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-blue-500 rounded-full" />
        <span className="text-gray-600">
          <span className="font-semibold text-blue-600">{stats.inOffice}</span>{" "}
          in office
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-gray-400 rounded-full" />
        <span className="text-gray-600">
          <span className="font-semibold text-gray-600">
            {stats.free + stats.notAvailable}
          </span>{" "}
          free/away
        </span>
      </div>
      {stats.conflicts > 0 && (
        <div className="flex items-center gap-2 text-amber-600">
          <AlertTriangle className="w-4 h-4" />
          <span className="font-medium">
            {stats.conflicts} conflict{stats.conflicts > 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
};

const FacultyRow = ({ faculty, locationStatus, onSelect, isSelected }) => {
  const {
    currentLocation,
    nextLocation,
    statusLabel,
    status,
    hasConflict,
    conflictDetails,
  } = locationStatus;

  return (
    <tr
      onClick={() => onSelect(faculty)}
      className={`cursor-pointer transition-colors ${
        isSelected
          ? "bg-baylor-green/5 border-l-2 border-baylor-green"
          : "hover:bg-gray-50 border-l-2 border-transparent"
      }`}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-gray-600 font-medium text-xs">
              {faculty.name
                ?.split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2) || "?"}
            </span>
          </div>
          <div>
            <div className="font-medium text-gray-900">{faculty.name}</div>
            {faculty.program?.name && (
              <div className="text-xs text-gray-500">
                {faculty.program.name}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <FacultyStatusBadge status={status} label={statusLabel} small />
        {hasConflict && (
          <AlertTriangle
            className="w-3 h-3 text-amber-500 inline ml-1"
            title={
              conflictDetails
                ? `Conflict between:\n${conflictDetails
                    .map(
                      (c) =>
                        `${c.course} (${c.room}) @ ${c.startTime}-${c.endTime}`,
                    )
                    .join("\n")}`
                : "Schedule conflict"
            }
          />
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">
        {currentLocation ? (
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3 text-gray-400" />
            <span className="font-medium">{currentLocation.room}</span>
            {currentLocation.course && (
              <span className="text-gray-400 text-xs ml-1">
                ({currentLocation.course})
              </span>
            )}
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {currentLocation?.endTime && !currentLocation.isOffice ? (
          currentLocation.endTime
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {nextLocation ? (
          <div>
            <span className="font-medium text-gray-700">
              {nextLocation.room}
            </span>
            <span className="text-gray-400 text-xs ml-1">
              at {nextLocation.startTime}
            </span>
          </div>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
    </tr>
  );
};

const RoomCard = ({ roomData, onRoomClick }) => {
  const { room, occupants } = roomData;

  return (
    <div
      onClick={() => onRoomClick(room)}
      className="p-3 bg-white rounded-lg border border-gray-200 hover:border-baylor-green/30 hover:shadow-sm cursor-pointer transition-all"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-gray-900">{room}</span>
        <span
          className="w-2 h-2 bg-baylor-green rounded-full animate-pulse"
          title="In use"
        />
      </div>
      {occupants.map((occ, idx) => (
        <div key={idx} className="text-sm text-gray-600">
          <span className="font-medium">{occ.facultyName}</span>
          {occ.course && <span className="text-gray-400 ml-1">({occ.course})</span>}
          <div className="text-xs text-gray-400">
            {occ.startTime} - {occ.endTime}
          </div>
        </div>
      ))}
    </div>
  );
};

const FacultyExplorer = ({
  asOfTime = new Date(),
  defaultTab = "faculty",
  initialStatusFilter = "active",
  selectedBuilding = "",
  selectedFaculty = null,
  onSelectFaculty = null,
  showSemesterWarning = true,
}) => {
  const { scheduleData = [], facultyData = [] } = useData();
  const { selectedSemester, selectedTermMeta } = useSchedules();

  const [viewMode, setViewMode] = useState(
    defaultTab === "rooms" ? "room" : "faculty",
  );
  const [showAdjuncts, setShowAdjuncts] = useState(false);
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [roomFilter, setRoomFilter] = useState(null);
  const [programFilter, setProgramFilter] = useState("all");
  const [localSelectedFaculty, setLocalSelectedFaculty] = useState(null);

  const effectiveSelectedFaculty = selectedFaculty || localSelectedFaculty;

  useEffect(() => {
    if (defaultTab) {
      setViewMode(defaultTab === "rooms" ? "room" : "faculty");
    }
  }, [defaultTab]);

  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  const isWithinSemester = useMemo(() => {
    if (!selectedTermMeta?.startDate || !selectedTermMeta?.endDate) return true;

    const start = parseTermDate(selectedTermMeta.startDate);
    const end = parseTermDate(selectedTermMeta.endDate);
    const checkDate = new Date(asOfTime);
    checkDate.setHours(0, 0, 0, 0);

    return !start || !end || (checkDate >= start && checkDate <= end);
  }, [selectedTermMeta, asOfTime]);

  const isWeekend = useMemo(() => {
    const day = asOfTime.getDay();
    return day === 0 || day === 6;
  }, [asOfTime]);

  const activeFaculty = useMemo(
    () => getActiveFacultyList(facultyData, scheduleData),
    [facultyData, scheduleData],
  );

  const availablePrograms = useMemo(() => {
    const programs = new Map();
    activeFaculty.forEach((faculty) => {
      if (faculty.program?.id && faculty.program?.name) {
        programs.set(faculty.program.id, {
          id: faculty.program.id,
          name: faculty.program.name,
          code: faculty.program.code,
        });
      }
    });
    return Array.from(programs.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [activeFaculty]);

  const statusFilterArray = useMemo(() => {
    if (statusFilter === "teaching") return [LOCATION_STATUS.TEACHING];
    if (statusFilter === "in-office") return [LOCATION_STATUS.IN_OFFICE];
    if (statusFilter === "active")
      return [LOCATION_STATUS.TEACHING, LOCATION_STATUS.IN_OFFICE];
    return null;
  }, [statusFilter]);

  const facultyLocations = useMemo(() => {
    return getAllFacultyLocations({
      facultyData: activeFaculty,
      scheduleData,
      asOfTime,
      options: {
        excludeAdjuncts: !showAdjuncts,
        statusFilter: statusFilterArray,
      },
    });
  }, [activeFaculty, scheduleData, asOfTime, showAdjuncts, statusFilterArray]);

  const sortedLocations = useMemo(() => {
    let filtered = facultyLocations;

    if (roomFilter) {
      filtered = filtered.filter(({ locationStatus }) => {
        return locationStatus.currentLocation?.room === roomFilter;
      });
    }

    if (programFilter !== "all") {
      filtered = filtered.filter(({ faculty }) => {
        return faculty.program?.id === programFilter;
      });
    }

    if (selectedBuilding) {
      filtered = filtered.filter(({ locationStatus }) => {
        const room = locationStatus.currentLocation?.room;
        if (!room) return false;
        const building = getBuildingDisplay(room);
        return buildingMatches(building, selectedBuilding);
      });
    }

    return sortFacultyLocations(filtered, sortBy, sortOrder);
  }, [
    facultyLocations,
    sortBy,
    sortOrder,
    roomFilter,
    programFilter,
    selectedBuilding,
  ]);

  const stats = useMemo(() => getLocationStats(facultyLocations), [
    facultyLocations,
  ]);

  const roomOccupancy = useMemo(
    () => getRoomOccupancy({ scheduleData, asOfTime }),
    [scheduleData, asOfTime],
  );

  const filteredRoomOccupancy = useMemo(() => {
    if (!selectedBuilding) return roomOccupancy;

    const filtered = new Map();
    for (const [room, data] of roomOccupancy) {
      const building = getBuildingDisplay(room);
      if (buildingMatches(building, selectedBuilding)) {
        filtered.set(room, data);
      }
    }
    return filtered;
  }, [roomOccupancy, selectedBuilding]);

  const groupedRooms = useMemo(
    () => groupRoomsByBuilding(filteredRoomOccupancy),
    [filteredRoomOccupancy],
  );

  const handleSortChange = useCallback((field) => {
    setSortBy((prev) => {
      if (prev === field) {
        setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortOrder("asc");
      return field;
    });
  }, []);

  const handleRoomClick = useCallback((room) => {
    setRoomFilter((prev) => (prev === room ? null : room));
    setViewMode("faculty");
  }, []);

  const handleSetStatusFilter = useCallback((filter) => {
    setStatusFilter(filter);
  }, []);

  const handleSetProgramFilter = useCallback((filter) => {
    setProgramFilter(filter);
  }, []);

  const handleSelectFaculty = useCallback(
    (faculty) => {
      if (onSelectFaculty) {
        onSelectFaculty(faculty);
        return;
      }
      setLocalSelectedFaculty(faculty);
    },
    [onSelectFaculty],
  );

  const formatTime = (date) =>
    date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  const formatDate = (date) =>
    date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <QuickStats stats={stats} isWeekend={isWeekend} />

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode("faculty")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                viewMode === "faculty"
                  ? "bg-white text-baylor-green shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Users className="w-4 h-4" />
              Faculty
            </button>
            <button
              onClick={() => setViewMode("room")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                viewMode === "room"
                  ? "bg-white text-baylor-green shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Building2 className="w-4 h-4" />
              Rooms
            </button>
          </div>

          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => handleSetStatusFilter("all")}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === "all"
                  ? "bg-white text-baylor-green shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
              title="Show all faculty"
            >
              All
            </button>
            <button
              onClick={() => handleSetStatusFilter("teaching")}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                statusFilter === "teaching"
                  ? "bg-baylor-green text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
              title="Show only faculty currently teaching"
            >
              <GraduationCap className="w-3 h-3" />
              Teaching
            </button>
            <button
              onClick={() => handleSetStatusFilter("in-office")}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                statusFilter === "in-office"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
              title="Show only faculty in their office"
            >
              <Coffee className="w-3 h-3" />
              In Office
            </button>
            <button
              onClick={() => handleSetStatusFilter("active")}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                statusFilter === "active"
                  ? "bg-baylor-green text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
              title="Show faculty who are teaching or in office"
            >
              <Zap className="w-3 h-3" />
              Both
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showAdjuncts}
              onChange={(e) => setShowAdjuncts(e.target.checked)}
              className="rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
            />
            <span>Include Adjuncts</span>
          </label>

          {roomFilter && (
            <button
              onClick={() => setRoomFilter(null)}
              className="px-3 py-1.5 bg-baylor-green/10 text-baylor-green rounded-full text-sm font-medium flex items-center gap-1.5"
            >
              <MapPin className="w-3 h-3" />
              {roomFilter}
              <span className="ml-1">×</span>
            </button>
          )}
        </div>
      </div>

      {availablePrograms.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
            <Building2 className="w-4 h-4 text-gray-500" />
            <select
              value={programFilter}
              onChange={(e) => handleSetProgramFilter(e.target.value)}
              className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none cursor-pointer min-w-[120px] max-w-[200px]"
              title="Filter by program"
            >
              <option value="all">All Programs</option>
              {availablePrograms.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </select>
          </div>
          {programFilter !== "all" && (
            <button
              onClick={() => setProgramFilter("all")}
              className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium flex items-center gap-1.5"
            >
              <Building2 className="w-4 h-4" />
              <span className="max-w-[150px] truncate">
                {availablePrograms.find((p) => p.id === programFilter)?.name ||
                  "Program"}
              </span>
              <span className="ml-1">×</span>
            </button>
          )}
        </div>
      )}

      {showSemesterWarning && !isWithinSemester && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            The selected date is outside the {selectedSemester} semester dates.
            Schedule data may not be accurate.
          </span>
        </div>
      )}

      {viewMode === "faculty" ? (
        <div className="university-card overflow-hidden">
          {isWeekend ? (
            <div className="university-card-content text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                It's the Weekend!
              </h3>
              <p className="text-gray-600">
                No scheduled classes on {formatDate(asOfTime)}.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Try selecting a weekday to see faculty locations.
              </p>
            </div>
          ) : sortedLocations.length === 0 ? (
            <div className="university-card-content text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No Faculty Matches
              </h3>
              <p className="text-gray-600">
                Try adjusting your filters or selecting a different time.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="university-table w-full">
                <thead>
                  <tr>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSortChange("name")}
                    >
                      <div className="flex items-center gap-1 text-sm font-semibold text-baylor-green">
                        Faculty
                        {sortBy === "name" && (
                          <ArrowUpDown className="w-3 h-3 text-gray-400" />
                        )}
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSortChange("status")}
                    >
                      <div className="flex items-center gap-1 text-sm font-semibold text-baylor-green">
                        Status
                        {sortBy === "status" && (
                          <ArrowUpDown className="w-3 h-3 text-gray-400" />
                        )}
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSortChange("room")}
                    >
                      <div className="flex items-center gap-1 text-sm font-semibold text-baylor-green">
                        Location
                        {sortBy === "room" && (
                          <ArrowUpDown className="w-3 h-3 text-gray-400" />
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-baylor-green">
                      Until
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-baylor-green">
                      Next
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedLocations.map(({ faculty, locationStatus }) => (
                    <FacultyRow
                      key={faculty.id}
                      faculty={faculty}
                      locationStatus={locationStatus}
                      onSelect={handleSelectFaculty}
                      isSelected={effectiveSelectedFaculty?.id === faculty.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {isWeekend ? (
            <div className="university-card">
              <div className="university-card-content text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Building2 className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  It's the Weekend!
                </h3>
                <p className="text-gray-600">No rooms are in scheduled use.</p>
              </div>
            </div>
          ) : groupedRooms.length === 0 ? (
            <div className="university-card">
              <div className="university-card-content text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Building2 className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No Rooms in Use
                </h3>
                <p className="text-gray-600">
                  No classes are currently in session at {formatTime(asOfTime)}.
                </p>
              </div>
            </div>
          ) : (
            groupedRooms.map(({ building, rooms }) => (
              <div key={building} className="university-card">
                <div className="university-card-header">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-baylor-green" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      {building}
                    </h3>
                    <span className="text-sm text-gray-500">
                      ({rooms.length} room{rooms.length !== 1 ? "s" : ""} in use)
                    </span>
                  </div>
                </div>
                <div className="university-card-content">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {rooms.map((roomData) => (
                      <RoomCard
                        key={roomData.room}
                        roomData={roomData}
                        onRoomClick={handleRoomClick}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default FacultyExplorer;
