/**
 * FacultyFinder.jsx - "Where is X right now?" Dashboard
 *
 * This view now reuses shared Today components for consistency.
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Clock,
  Calendar,
  RefreshCw,
  X,
  Zap,
  User,
} from "lucide-react";
import { useData } from "../contexts/DataContext";
import { usePeople } from "../contexts/PeopleContext";
import { useSchedules } from "../contexts/ScheduleContext";
import { parseTermDate } from "../utils/termUtils";
import { getFacultyLocationAtTime } from "../utils/facultyLocationUtils";
import { getActiveFacultyList } from "../utils/facultyFinderUtils";
import FacultySpotlightCard from "./today/FacultySpotlightCard";
import FacultyExplorer from "./today/FacultyExplorer";

const FacultyFinder = () => {
  const {
    scheduleData = [],
    facultyData = [],
    selectedSemester,
  } = useData();
  const { loadPeople } = usePeople();
  const { selectedTermMeta } = useSchedules();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [isNowMode, setIsNowMode] = useState(true);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedFaculty, setSelectedFaculty] = useState(null);

  const searchInputRef = useRef(null);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  useEffect(() => {
    if (!isNowMode) return;
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, [isNowMode]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery]);

  const asOfTime = useMemo(() => {
    if (isNowMode) return currentTime;

    if (customDate && customTime) {
      const [hours, minutes] = customTime.split(":").map(Number);
      const date = new Date(customDate + "T12:00:00");
      date.setHours(hours, minutes, 0, 0);
      return date;
    }

    return currentTime;
  }, [isNowMode, currentTime, customDate, customTime]);

  const isWithinSemester = useMemo(() => {
    if (!selectedTermMeta?.startDate || !selectedTermMeta?.endDate) return true;

    const start = parseTermDate(selectedTermMeta.startDate);
    const end = parseTermDate(selectedTermMeta.endDate);
    const checkDate = new Date(asOfTime);
    checkDate.setHours(0, 0, 0, 0);

    return !start || !end || (checkDate >= start && checkDate <= end);
  }, [selectedTermMeta, asOfTime]);

  const activeFaculty = useMemo(
    () => getActiveFacultyList(facultyData, scheduleData),
    [facultyData, scheduleData],
  );

  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase();
    return activeFaculty
      .filter((f) => f.name?.toLowerCase().includes(query))
      .slice(0, 8);
  }, [searchQuery, activeFaculty]);

  const selectedFacultyLocation = useMemo(() => {
    if (!selectedFaculty) return null;

    return getFacultyLocationAtTime({
      faculty: selectedFaculty,
      scheduleData,
      asOfTime,
    });
  }, [selectedFaculty, scheduleData, asOfTime]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setCurrentTime(new Date());
    setIsNowMode(true);
    setCustomDate("");
    setCustomTime("");
    setTimeout(() => setIsRefreshing(false), 500);
  }, []);

  const handleSearchKeyDown = useCallback(
    (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < searchSuggestions.length - 1 ? prev + 1 : prev,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (highlightedIndex >= 0 && searchSuggestions[highlightedIndex]) {
          setSelectedFaculty(searchSuggestions[highlightedIndex]);
          setSearchQuery("");
          setSearchFocused(false);
        }
      } else if (e.key === "Escape") {
        setSearchFocused(false);
        setSearchQuery("");
      }
    },
    [searchSuggestions, highlightedIndex],
  );

  const handleSelectSuggestion = useCallback((faculty) => {
    setSelectedFaculty(faculty);
    setSearchQuery("");
    setSearchFocused(false);
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedFaculty(null);
  }, []);

  const handleTimeChange = useCallback((date, time) => {
    setIsNowMode(false);
    if (date) setCustomDate(date);
    if (time) setCustomTime(time);
  }, []);

  const handleNowClick = useCallback(() => {
    setIsNowMode(true);
    setCurrentTime(new Date());
    setCustomDate("");
    setCustomTime("");
  }, []);

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

  const asOfDateValue = customDate || asOfTime.toISOString().split("T")[0];
  const asOfTimeValue =
    customTime ||
    `${String(asOfTime.getHours()).padStart(2, "0")}:${String(
      asOfTime.getMinutes(),
    ).padStart(2, "0")}`;

  return (
    <div className="page-content space-y-6">
      {/* Header */}
      <div className="university-header rounded-xl p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Faculty Finder</h1>
              <p className="text-white/80 text-sm mt-1">
                Find any faculty member instantly •{" "}
                {selectedSemester || "All semesters"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-bold text-white flex items-center gap-2">
                {formatTime(asOfTime)}
                {isNowMode && (
                  <span
                    className="w-2 h-2 bg-baylor-gold rounded-full animate-pulse"
                    title="Live"
                  />
                )}
              </div>
              <div className="text-sm text-baylor-gold">
                {formatDate(asOfTime)}
                {!isNowMode && (
                  <span className="ml-2 text-white/60">(custom time)</span>
                )}
              </div>
            </div>
            <button
              onClick={handleRefresh}
              className={`p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-all ${
                isRefreshing ? "animate-spin" : ""
              }`}
              title="Refresh to now"
            >
              <RefreshCw className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Search + Time Control Row */}
      <div className="university-card overflow-visible">
        <div className="university-card-content">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search faculty by name..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green transition-all text-lg"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                )}
              </div>

              {/* Search Suggestions Dropdown */}
              {searchFocused && searchSuggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                  {searchSuggestions.map((faculty, idx) => (
                    <button
                      key={faculty.id || idx}
                      onClick={() => handleSelectSuggestion(faculty)}
                      className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors ${
                        idx === highlightedIndex
                          ? "bg-baylor-green/10 text-baylor-green"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-gray-500" />
                      </div>
                      <div>
                        <div className="font-medium">{faculty.name}</div>
                        {faculty.program?.name && (
                          <div className="text-xs text-gray-500">
                            {faculty.program.name}
                          </div>
                        )}
                      </div>
                      {faculty.isAdjunct && (
                        <span className="ml-auto text-xs text-gray-400">
                          Adjunct
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Time Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={asOfDateValue}
                  onChange={(e) =>
                    handleTimeChange(
                      e.target.value,
                      customTime || asOfTimeValue,
                    )
                  }
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
                />
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <input
                  type="time"
                  value={asOfTimeValue}
                  onChange={(e) =>
                    handleTimeChange(customDate || asOfDateValue, e.target.value)
                  }
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
                />
              </div>
              <button
                onClick={handleNowClick}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isNowMode
                    ? "bg-baylor-green text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-baylor-green/10 hover:text-baylor-green"
                }`}
              >
                Now
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Spotlight Card (when faculty selected) */}
      {selectedFaculty && selectedFacultyLocation && (
        <FacultySpotlightCard
          faculty={selectedFaculty}
          locationStatus={selectedFacultyLocation}
          onClose={handleClearSelection}
        />
      )}

      {!isWithinSemester && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <Calendar className="w-4 h-4 flex-shrink-0" />
          <span>
            The selected date is outside the {selectedSemester} semester dates.
            Schedule data may not be accurate.
          </span>
        </div>
      )}

      <FacultyExplorer
        asOfTime={asOfTime}
        selectedFaculty={selectedFaculty}
        onSelectFaculty={setSelectedFaculty}
        defaultTab="faculty"
        initialStatusFilter="all"
        showSemesterWarning={false}
      />

      <div className="text-center text-sm text-gray-400">
        {isNowMode ? (
          <span>
            Auto-refreshes every 60 seconds • Last updated{" "}
            {formatTime(currentTime)}
          </span>
        ) : (
          <span>
            Viewing schedule as of {formatDate(asOfTime)} at{" "}
            {formatTime(asOfTime)}
          </span>
        )}
      </div>
    </div>
  );
};

export default FacultyFinder;
