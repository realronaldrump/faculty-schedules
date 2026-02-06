import React, { useState, useRef, useEffect, useCallback } from "react";
import DOMPurify from "dompurify";
import Papa from "papaparse";
import {
  Upload,
  X,
  Trash2,
  FileText,
  Download,
  Save as SaveIcon,
  Database,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  RotateCcw,
  Info,
} from "lucide-react";
import ExportModal from "./ExportModal";
import ExportableRoomSchedule from "./ExportableRoomSchedule";
import { db } from "../../firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { logCreate, logDelete } from "../../utils/changeLogger";
import ConfirmDialog from "../shared/ConfirmDialog";
import { usePermissions } from "../../utils/permissions";
import { fetchSchedulesByTerm } from "../../utils/dataImportUtils";
import { getBuildingDisplay } from "../../utils/locationService";
import { useSchedules } from "../../contexts/ScheduleContext";

const RoomGridGenerator = () => {
  const { canEdit } = usePermissions();
  const canEditHere = canEdit("scheduling/rooms");
  const {
    availableSemesters = [],
    selectedSemester,
    getTermByLabel,
  } = useSchedules();
  const [allClassData, setAllClassData] = useState([]);
  const [buildings, setBuildings] = useState({});
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [selectedDayType, setSelectedDayType] = useState("WEEK");
  const [semester, setSemester] = useState("");
  const [message, setMessage] = useState({ text: "", type: "" });
  const [scheduleHtml, setScheduleHtml] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [savedGrids, setSavedGrids] = useState([]);
  const [multiRoomMode, setMultiRoomMode] = useState(false);
  const [selectedBuildings, setSelectedBuildings] = useState([]);
  const [generatedSchedules, setGeneratedSchedules] = useState([]);

  // Mode selection: null = wizard, 'auto' = dashboard data, 'csv' = CLSS import
  const [dataMode, setDataMode] = useState(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [dashboardSchedules, setDashboardSchedules] = useState(null);
  const [loadedTerm, setLoadedTerm] = useState("");

  // Dialog states
  const [alertDialog, setAlertDialog] = useState({
    isOpen: false,
    message: "",
    title: "",
  });
  const [deleteGridConfirm, setDeleteGridConfirm] = useState({
    isOpen: false,
    grid: null,
  });
  const [resetConfirmDialog, setResetConfirmDialog] = useState(false);

  // UX state
  const [savedGridsExpanded, setSavedGridsExpanded] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  // State for the new exportable weekly schedule
  const [weeklyClasses, setWeeklyClasses] = useState([]);
  const [showExportableWeek, setShowExportableWeek] = useState(false);

  const printRef = useRef();
  const exportableRef = useRef();
  const multiExportRef = useRef();
  const fileInputRef = useRef();

  const timeSlots = {
    MWF: [
      "8:00 am - 8:50 am",
      "9:05 am - 9:55 am",
      "10:10 am - 11:00 am",
      "11:15 am - 12:05 pm",
      "12:20 pm - 1:10 pm",
      "1:25 pm - 2:15 pm",
      "2:30 pm - 3:20 pm",
      "3:35 pm - 4:25 pm",
      "4:40 pm - 5:30 pm",
    ],
    TR: [
      "8:00 am - 9:15 am",
      "9:30 am - 10:45 am",
      "11:00 am - 12:15 pm",
      "12:30 pm - 1:45 pm",
      "2:00 pm - 3:15 pm",
      "3:30 pm - 4:45 pm",
      "5:00 pm - 6:15 pm",
    ],
  };

  const showMessage = (text, type = "error") => {
    setMessage({ text, type });
  };

  const resetUI = (soft = false) => {
    if (!soft) {
      setAllClassData([]);
      setBuildings({});
      setSelectedBuilding("");
      setSelectedBuildings([]);
      setSelectedDayType("WEEK");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
    setSelectedRoom("");
    setScheduleHtml("");
    setGeneratedSchedules([]);
    setWeeklyClasses([]);
    setShowExportableWeek(false);
    setMessage({ text: "", type: "" });
  };

  // Load schedules for a specific term in auto-populate mode
  const loadDashboardData = useCallback(
    async (targetSemester = "") => {
      setIsLoadingDashboard(true);
      try {
        const termLabel =
          targetSemester ||
          semester ||
          selectedSemester ||
          availableSemesters[0] ||
          "";
        if (!termLabel) {
          showMessage("Select a semester to load dashboard data.");
          return;
        }
        if (!semester) {
          setSemester(termLabel);
        }
        const termMeta = getTermByLabel?.(termLabel);
        const { schedules } = await fetchSchedulesByTerm({
          term: termLabel,
          termCode: termMeta?.termCode || "",
        });
        setDashboardSchedules(schedules);
        setLoadedTerm(termLabel);
        showMessage(
          `Loaded ${schedules.length} schedules for ${termLabel}.`,
          "success",
        );
      } catch (error) {
        console.error("Error loading dashboard data:", error);
        showMessage("Failed to load dashboard data. " + error.message);
      } finally {
        setIsLoadingDashboard(false);
      }
    },
    [availableSemesters, getTermByLabel, selectedSemester, semester],
  );

  // Transform dashboard schedules to allClassData format (matching CSV processing output)
  const processDashboardData = useCallback(
    (targetSemester) => {
      if (!dashboardSchedules || dashboardSchedules.length === 0) return;

      const semesterSchedules = Array.isArray(dashboardSchedules)
        ? dashboardSchedules
        : [];

      // Transform each schedule to the format expected by the grid generator
      const items = semesterSchedules.flatMap((schedule) => {
        // Skip schedules without rooms or meeting patterns
        const spaceLabels = Array.isArray(schedule.spaceDisplayNames)
          ? schedule.spaceDisplayNames
          : [];
        const meetingPatterns = schedule.meetingPatterns || [];

        if (spaceLabels.length === 0 || meetingPatterns.length === 0) {
          return [];
        }

        // Skip online/no room schedules
        const firstRoom = spaceLabels[0] || "";
        if (
          firstRoom.toLowerCase().includes("online") ||
          firstRoom.toLowerCase().includes("no room") ||
          firstRoom.toLowerCase().includes("tba")
        ) {
          return [];
        }

        const courseCode =
          schedule.courseCode ||
          `${schedule.subjectCode || ""} ${schedule.catalogNumber || ""}`.trim();
        const instructorName =
          schedule.instructorName ||
          (schedule.instructor
            ? `${schedule.instructor.lastName || ""}`.trim()
            : "Staff");

        // Create entries for each room/pattern combination
        return spaceLabels.flatMap((roomString) => {
          // Use centralized building utility for consistent naming
          const buildingName = getBuildingDisplay(roomString);

          // Extract room number (last word that contains digits)
          let roomNumber = "N/A";
          const roomMatch = roomString.match(/([\w\d\-/]+)\s*$/);
          if (roomMatch && /\d/.test(roomMatch[1])) {
            roomNumber = roomMatch[1].trim();
          }

          // Skip general assignment rooms, empty buildings, online
          if (
            !buildingName ||
            buildingName.toLowerCase().includes("general") ||
            buildingName.toLowerCase() === "online" ||
            buildingName.toLowerCase() === "off campus"
          ) {
            return [];
          }

          return meetingPatterns
            .map((pattern) => {
              const days = pattern.day || "";
              const time =
                pattern.startTime && pattern.endTime
                  ? `${pattern.startTime} - ${pattern.endTime}`
                  : "";

              if (!days || !time) return null;

              return {
                building: buildingName,
                room: roomNumber,
                days: days,
                time: time,
                class: courseCode,
                section: (schedule.section || "").split(" ")[0],
                professor: instructorName,
              };
            })
            .filter(Boolean);
        });
      });

      // Deduplicate identical entries
      const dedupedMap = new Map();
      for (const item of items) {
        const key = [
          item.building,
          item.room,
          item.days.replace(/\s/g, ""),
          item.time.replace(/\s/g, ""),
          item.class,
          item.section,
          item.professor,
        ].join("|");
        if (!dedupedMap.has(key)) dedupedMap.set(key, item);
      }
      const processedClassData = Array.from(dedupedMap.values());

      setAllClassData(processedClassData);

      // Build buildings map from processed data
      const newBuildings = processedClassData.reduce((acc, item) => {
        if (!acc[item.building]) {
          acc[item.building] = new Set();
        }
        acc[item.building].add(item.room);
        return acc;
      }, {});

      setBuildings(newBuildings);

      if (Object.keys(newBuildings).length === 0) {
        showMessage(
          `No classes with room assignments found for ${targetSemester}.`,
        );
      } else {
        showMessage(
          `Found ${processedClassData.length} classes across ${Object.keys(newBuildings).length} buildings for ${targetSemester}.`,
          "success",
        );
      }
    },
    [dashboardSchedules],
  );

  // When semester changes in auto mode, reload and reprocess data
  useEffect(() => {
    if (dataMode === "auto" && semester && semester !== loadedTerm) {
      loadDashboardData(semester);
    }
  }, [dataMode, semester, loadedTerm, loadDashboardData]);

  useEffect(() => {
    if (dataMode === "auto" && dashboardSchedules && semester) {
      processDashboardData(semester);
    }
  }, [dataMode, semester, dashboardSchedules, processDashboardData]);

  useEffect(() => {
    if (dataMode === "auto" && !semester && availableSemesters.length > 0) {
      setSemester(selectedSemester || availableSemesters[0]);
    }
  }, [dataMode, semester, availableSemesters, selectedSemester]);

  // Reset when changing modes
  const handleModeChange = (mode) => {
    resetUI();
    setDataMode(mode);
    if (mode === "csv") {
      setSemester(""); // Let user set semester manually for CSV
    }
  };

  const handleMultiRoomToggle = (event) => {
    const checked = event.target.checked;
    setMultiRoomMode(checked);
    setGeneratedSchedules([]);
    setScheduleHtml("");
    setWeeklyClasses([]);
    setShowExportableWeek(false);
    if (checked) {
      setSelectedBuildings(selectedBuilding ? [selectedBuilding] : []);
      setSelectedRoom("");
    } else {
      setSelectedBuilding(selectedBuildings[0] || selectedBuilding || "");
      setSelectedBuildings([]);
    }
  };

  const handleSelectedBuildingsChange = (event) => {
    const values = Array.from(event.target.selectedOptions).map(
      (option) => option.value,
    );
    setSelectedBuildings(values);
    if (values.length === 1) {
      setSelectedBuilding(values[0]);
    }
  };

  const handleFileUpload = (file) => {
    if (!file) return;

    resetUI(true);
    setIsProcessing(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      beforeFirstChunk: (chunk) => {
        const lines = chunk.split(/\r\n|\n|\r/);
        const headerIndex = lines.findIndex(
          (line) =>
            line.includes('"CLSS ID","CRN","Term"') ||
            line.includes('"CLSS ID","CRN","Semester"'),
        );

        if (headerIndex === -1) {
          console.error("Could not find the header row in the CSV file.");
          return "";
        }

        const header = lines[headerIndex];
        const dataLines = lines.slice(headerIndex + 1);
        return [header, ...dataLines].join("\n");
      },
      complete: (results) => {
        processData(results.data);
        setIsProcessing(false);
      },
      error: (error) => {
        console.error("Error parsing CSV:", error);
        showMessage(
          "Error parsing CSV. Please check file format and console for details.",
        );
        setIsProcessing(false);
      },
    });
  };

  const processData = (data) => {
    const items = data.flatMap((row) => {
      try {
        const roomRaw = row["Room"] || "";
        const meetingPatternRaw = row["Meeting Pattern"] || "";
        const instructorRaw = row["Instructor"] || "";

        if (
          !roomRaw ||
          roomRaw.toLowerCase().includes("no room needed") ||
          roomRaw.toLowerCase().includes("online") ||
          !meetingPatternRaw ||
          meetingPatternRaw.toLowerCase().startsWith("does not meet")
        ) {
          return [];
        }

        const roomsList = roomRaw.split(";").map((r) => r.trim());
        const patternsList = meetingPatternRaw.split(";").map((p) => p.trim());

        const baseInfo = {
          class: `${row["Subject Code"]} ${row["Catalog Number"]}`,
          section: (row["Section #"] || "").split(" ")[0],
          professor: (instructorRaw || "").split(",")[0].trim(),
        };

        return roomsList
          .map((roomString, i) => {
            const patternString = patternsList[i] || patternsList[0];
            let buildingName, roomNumber;
            const roomMatch = roomString.match(/(.+?)\s+([\w\d\-/]+)$/);
            if (roomMatch) {
              buildingName = roomMatch[1].trim();
              roomNumber = roomMatch[2].trim();
            } else {
              if (roomString.toLowerCase().includes("general assignment"))
                return null;
              buildingName = roomString.trim();
              roomNumber = "N/A";
            }

            const mp = patternString.trim().match(/^([A-Za-z]+)\s+(.+)$/);
            const days = mp ? mp[1] : patternString.split(/\s+/)[0] || "";
            const time = mp
              ? mp[2].trim()
              : patternString.replace(days, "").trim();

            if (!buildingName || !roomNumber || !days || !time) return null;

            return {
              ...baseInfo,
              building: buildingName,
              room: roomNumber,
              days: days,
              time: time,
            };
          })
          .filter(Boolean);
      } catch (e) {
        console.warn("Could not process row:", row, "Error:", e);
        return [];
      }
    });

    // Deduplicate identical entries that sometimes occur in CLSS exports
    const dedupedMap = new Map();
    for (const item of items) {
      const key = [
        item.building,
        item.room,
        item.days.replace(/\s/g, ""),
        item.time.replace(/\s/g, ""),
        item.class,
        item.section,
        item.professor,
      ].join("|");
      if (!dedupedMap.has(key)) dedupedMap.set(key, item);
    }
    const processedClassData = Array.from(dedupedMap.values());

    setAllClassData(processedClassData);

    const newBuildings = processedClassData.reduce((acc, item) => {
      if (!acc[item.building]) {
        acc[item.building] = new Set();
      }
      acc[item.building].add(item.room);
      return acc;
    }, {});

    setBuildings(newBuildings);

    if (Object.keys(newBuildings).length === 0) {
      showMessage(
        "CSV processed, but no valid class data with rooms was found.",
      );
    } else {
      showMessage(
        `Successfully processed ${processedClassData.length} classes.`,
        "success",
      );
    }
  };

  const buildExportName = (building, room, dayType, termLabel) =>
    [building, room, dayType, termLabel].filter(Boolean).join(" ");

  const escapeHtmlAttribute = (value) =>
    (value || "").replace(/"/g, "&quot;");

  const buildTableScheduleHtml = (building, room, dayType) => {
    const dayChars = dayType === "MWF" ? ["M", "W", "F"] : ["T", "R"];
    const relevantClasses = allClassData.filter((c) => {
      const meetingDays = parseDaysToChars(c.days);
      return (
        c.building === building &&
        c.room === room &&
        meetingDays.some((d) => dayChars.includes(d))
      );
    });

    const tableHeader = `
            <div class="text-2xl font-bold" contenteditable="true">${building.replace(" Bldg", "").toUpperCase()} ${room}</div>
            <div class="text-lg font-medium">${dayType === "MWF" ? "Monday - Wednesday - Friday" : "Tuesday - Thursday"}</div>
            <div class="text-md" contenteditable="true">${semester}</div>
        `;

    const tableBody = (timeSlots[dayType] || [])
      .map((slot) => {
        const classesInSlot = findClassesInSlot(relevantClasses, slot);
        const classContent =
          classesInSlot.length > 0
            ? classesInSlot
              .map((c) => {
                let daysIndicator = "";
                const mdays = parseDaysToChars(c.days);
                const expected =
                  dayType === "MWF" ? ["M", "W", "F"] : ["T", "R"];
                const isFullPattern =
                  expected.every((d) => mdays.includes(d)) &&
                  mdays.every((d) => expected.includes(d));
                if (!isFullPattern) {
                  const overlap = mdays
                    .filter((d) => expected.includes(d))
                    .join("");
                  daysIndicator = overlap ? ` (${overlap})` : ` (${c.days})`;
                }
                return `<div class="class-entry-wrapper">
                            <button class="delete-entry-btn export-ignore" data-action="delete-class" title="Remove">×</button>
                            <div class="class-entry" contenteditable="true">${c.class}.${c.section}${daysIndicator}</div>
                            <div class="prof-entry" contenteditable="true">${c.professor}</div>
                        </div>`;
              })
              .join("")
            : "";

        return `
                <tr>
                    <td class="time-slot">${slot.replace(/ am/g, "").replace(/ pm/g, "")}</td>
                    <td data-slot="${slot}">
                        <div class="slot-toolbar export-ignore"><button type="button" class="slot-add-btn export-ignore" data-action="add-class" title="Add entry">＋</button></div>
                        <div class="class-list">${classContent}</div>
                    </td>
                </tr>
            `;
      })
      .join("");

    const exportName = escapeHtmlAttribute(
      buildExportName(building, room, dayType, semester),
    );
    const htmlUnsafe = `
            <div class="schedule-sheet" data-export-name="${exportName}">
                <table class="schedule-table">
                    <thead>
                        <tr>
                            <th colspan="2">${tableHeader}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableBody}
                    </tbody>
                </table>
            </div>
        `;
    return {
      html: DOMPurify.sanitize(htmlUnsafe, { USE_PROFILES: { html: true } }),
      hasClasses: relevantClasses.length > 0,
    };
  };

  const getTargetsForGeneration = () => {
    if (multiRoomMode) {
      const buildingList = selectedBuildings.length
        ? selectedBuildings
        : selectedBuilding
          ? [selectedBuilding]
          : [];
      const sortedBuildings = Array.from(new Set(buildingList)).sort();
      return sortedBuildings.flatMap((building) => {
        const rooms = buildings[building]
          ? Array.from(buildings[building]).sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true }),
          )
          : [];
        return rooms.map((room) => ({ building, room }));
      });
    }
    if (!selectedBuilding || !selectedRoom) return [];
    return [{ building: selectedBuilding, room: selectedRoom }];
  };

  const generateSchedule = () => {
    const targets = getTargetsForGeneration();
    if (targets.length === 0) {
      showMessage(
        multiRoomMode
          ? "Please select at least one building."
          : "Please select a building and a room.",
      );
      return;
    }

    if (selectedDayType === "WEEK") {
      if (multiRoomMode) {
        const schedules = targets.map(({ building, room }) => ({
          id: `${building}-${room}-WEEK`,
          kind: "week",
          building,
          room,
          dayType: "WEEK",
          semester,
          classes: allClassData.filter(
            (c) => c.building === building && c.room === room,
          ),
        }));
        setGeneratedSchedules(schedules);
        setShowExportableWeek(false);
        setWeeklyClasses([]);
        setScheduleHtml("");
        const buildingCount = new Set(targets.map((t) => t.building)).size;
        showMessage(
          `Generated weekly schedules for ${targets.length} rooms across ${buildingCount} building${buildingCount === 1 ? "" : "s"}.`,
          "success",
        );
      } else {
        setGeneratedSchedules([]);
        generateExportableWeeklySchedule();
      }
      return;
    }

    if (multiRoomMode) {
      const schedules = targets.map(({ building, room }) => {
        const result = buildTableScheduleHtml(building, room, selectedDayType);
        return {
          id: `${building}-${room}-${selectedDayType}`,
          kind: "table",
          building,
          room,
          dayType: selectedDayType,
          semester,
          html: result.html,
        };
      });
      setGeneratedSchedules(schedules);
      setShowExportableWeek(false);
      setWeeklyClasses([]);
      setScheduleHtml("");
      const buildingCount = new Set(targets.map((t) => t.building)).size;
      showMessage(
        `Generated ${targets.length} room grids across ${buildingCount} building${buildingCount === 1 ? "" : "s"}.`,
        "success",
      );
      return;
    }

    const singleResult = buildTableScheduleHtml(
      selectedBuilding,
      selectedRoom,
      selectedDayType,
    );
    if (!singleResult.hasClasses) {
      setGeneratedSchedules([]);
      setShowExportableWeek(false);
      setWeeklyClasses([]);
      setScheduleHtml(
        `<div class="text-center p-8 text-gray-500">No classes found for ${selectedBuilding} ${selectedRoom} on ${selectedDayType} days.</div>`,
      );
      return;
    }

    setGeneratedSchedules([]);
    setShowExportableWeek(false);
    setWeeklyClasses([]);
    setScheduleHtml(singleResult.html);
    showMessage(
      "Schedule generated. Click on fields to edit before printing.",
      "success",
    );
  };

  const parseDaysToChars = (daysStr) => {
    const str = (daysStr || "").replace(/\s/g, "");
    if (!str) return [];
    const chars = [];
    const add = (d) => {
      if (!chars.includes(d)) chars.push(d);
    };
    if (/M/.test(str)) add("M");
    if (/(T(?!h)|Tu)/i.test(str) || /\bT\b/.test(str)) add("T");
    if (/W/.test(str)) add("W");
    if (/(Th|R)/i.test(str)) add("R");
    if (/F/.test(str)) add("F");
    // Common shorthands
    if (/MWF/i.test(str)) return ["M", "W", "F"];
    if (/(TTh|TR)/i.test(str)) return ["T", "R"];
    return chars;
  };

  const formatTimeLabel = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const period = h >= 12 ? "PM" : "AM";
    let hour = h % 12;
    if (hour === 0) hour = 12;
    return `${hour}:${m.toString().padStart(2, "0")} ${period}`.replace(
      ":00",
      "",
    );
  };

  const roundDownTo = (mins, step) => Math.floor(mins / step) * step;
  const roundUpTo = (mins, step) => Math.ceil(mins / step) * step;

  // New exportable weekly schedule using the clean React component
  const generateExportableWeeklySchedule = () => {
    const relevant = allClassData.filter(
      (c) => c.building === selectedBuilding && c.room === selectedRoom,
    );
    if (relevant.length === 0) {
      setWeeklyClasses([]);
      setShowExportableWeek(false);
      setGeneratedSchedules([]);
      setScheduleHtml(
        `<div class="text-center p-8 text-gray-500">No classes found for ${selectedBuilding} ${selectedRoom}.</div>`,
      );
      return;
    }

    // Set up the classes for the exportable component
    setWeeklyClasses(relevant);
    setShowExportableWeek(true);
    setGeneratedSchedules([]);
    setScheduleHtml(""); // Clear the old HTML-based schedule
    showMessage(
      "Weekly schedule generated. Click Export to save as PNG.",
      "success",
    );
  };

  // Legacy weekly schedule (kept for reference, but no longer used)
  const generateWeeklySchedule = () => {
    const relevant = allClassData.filter(
      (c) => c.building === selectedBuilding && c.room === selectedRoom,
    );
    if (relevant.length === 0) {
      setScheduleHtml(
        `<div class="text-center p-8 text-gray-500">No classes found for ${selectedBuilding} ${selectedRoom}.</div>`,
      );
      return;
    }

    // Determine time range
    let earliest = timeToMinutes("8:00 am");
    let latest = timeToMinutes("5:00 pm");
    try {
      const starts = relevant.map((c) => parseTimeRange(c.time)[0]);
      const ends = relevant.map((c) => parseTimeRange(c.time)[1]);
      if (starts.length) earliest = Math.min(earliest, ...starts);
      if (ends.length) latest = Math.max(latest, ...ends);
    } catch (error) {
      console.warn(error);
    }
    const step = 15; // minutes per grid row (visual height scales to fit the sheet)
    const start = roundDownTo(earliest, 60); // snap to hour for cleaner labels
    const end = roundUpTo(latest, 30);
    const slots = Math.max(1, Math.round((end - start) / step));

    // Build hour labels and horizontal gridlines
    const hourMarks = [];
    const headerOffset = 2; // reserve row 1 for day headers
    for (let t = start; t <= end; t += 60) {
      const row = Math.round((t - start) / step) + headerOffset;
      const span = 60 / step;
      hourMarks.push(`
                <div class="hour-label" style="grid-column: 1; grid-row: ${row} / span ${span};">${formatTimeLabel(t)}</div>
                <div class="hour-line" style="grid-column: 2 / -1; grid-row: ${row};"></div>
            `);
    }

    // Build class blocks per day
    const dayToColumn = { M: 2, T: 3, W: 4, R: 5, F: 6 };
    const blocks = relevant
      .flatMap((c) => {
        const [classStart, classEnd] = parseTimeRange(c.time);
        const startRow = Math.floor((classStart - start) / step) + headerOffset;
        const endRow = Math.ceil((classEnd - start) / step) + headerOffset;
        return parseDaysToChars(c.days)
          .filter((d) => dayToColumn[d])
          .map((d) => {
            const col = dayToColumn[d];
            return `
                    <div class="class-block" style="grid-column: ${col}; grid-row: ${startRow} / ${endRow};">
                        <button class="delete-entry-btn delete-block-btn export-ignore" data-action="delete-block" title="Remove">×</button>
                        <div class="class-title" contenteditable="true">${c.class}.${c.section}</div>
                        <div class="class-instructor" contenteditable="true">${c.professor}</div>
                        <div class="class-time">${c.time}</div>
                    </div>
                `;
          });
      })
      .join("");

    const vLines = Object.values(dayToColumn)
      .slice(0, -1)
      .map(
        (col) =>
          `<div style="grid-column: ${col}; grid-row: 1 / -1; border-right: 1px solid var(--neutral-border);"></div>`,
      )
      .join("");

    const grid = `
            <div class="weekly-grid" style="--rows:${slots};" data-start="${start}" data-end="${end}" data-step="${step}" data-headeroffset="${headerOffset}">
                ${hourMarks.join("")}
                ${vLines}
                ${blocks}
                <div class="day-header" style="grid-column: 2;">Monday</div>
                <div class="day-header" style="grid-column: 3;">Tuesday</div>
                <div class="day-header" style="grid-column: 4;">Wednesday</div>
                <div class="day-header" style="grid-column: 5;">Thursday</div>
                <div class="day-header" style="grid-column: 6;">Friday</div>
            </div>
        `;

    const header = `
            <div class="weekly-header">
                <div class="header-left">
                    <div class="text-2xl font-bold" contenteditable="true">${selectedBuilding.replace(" Bldg", "").toUpperCase()} ${selectedRoom} Schedule</div>
                    <div class="text-md" contenteditable="true">${semester}</div>
                </div>
                <div class="header-actions export-ignore">
                    <button type="button" class="slot-add-btn export-ignore" data-action="add-week-block" title="Add class to week">＋ Add</button>
                </div>
            </div>
        `;

    const htmlUnsafe = `
            <div class="schedule-sheet weekly-sheet">
                ${header}
                ${grid}
            </div>
        `;
    setScheduleHtml(
      DOMPurify.sanitize(htmlUnsafe, { USE_PROFILES: { html: true } }),
    );
    showMessage(
      "Weekly grid generated. Click on fields to edit before printing.",
      "success",
    );
  };

  const findClassesInSlot = (classes, slot) => {
    try {
      const [slotStart, slotEnd] = parseTimeRange(slot);
      return classes.filter((c) => {
        try {
          const [classStart, classEnd] = parseTimeRange(c.time);
          return classStart < slotEnd && classEnd > slotStart;
        } catch (e) {
          console.warn(
            `Could not parse time for class, skipping:`,
            c,
            `Error:`,
            e,
          );
          return false;
        }
      });
    } catch (e) {
      console.error("Error parsing time slot:", slot, e);
      return [];
    }
  };

  const timeToMinutes = (timeStr) => {
    const cleanedTimeStr = timeStr.toLowerCase().trim();
    const match = cleanedTimeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
    if (!match) throw new Error(`Invalid time format: "${timeStr}"`);
    let [_, hours, minutes, modifier] = match;
    hours = parseInt(hours, 10);
    minutes = parseInt(minutes, 10) || 0;
    if (modifier === "pm" && hours < 12) hours += 12;
    if (modifier === "am" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  };

  const parseTimeRange = (rangeStr) => {
    const parts = rangeStr.replace(/\s/g, "").toLowerCase().split("-");
    if (parts.length === 1) {
      const singleTime = timeToMinutes(parts[0]);
      return [singleTime, singleTime + 1];
    }
    if (parts.length !== 2)
      throw new Error(`Invalid time range format: "${rangeStr}"`);
    let [startStr, endStr] = parts;
    const startModifierMatch = startStr.match(/(am|pm)/);
    const endModifierMatch = endStr.match(/(am|pm)/);
    if (!startModifierMatch && endModifierMatch)
      startStr += endModifierMatch[0];
    else if (startModifierMatch && !endModifierMatch)
      endStr += startModifierMatch[0];
    return [timeToMinutes(startStr), timeToMinutes(endStr)];
  };

  const fileUploaderRef = useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const triggerFileUpload = () => {
    fileUploaderRef.current.click();
  };

  const updateTableSizing = useCallback(() => {
    const containers = [printRef.current, multiExportRef.current].filter(
      Boolean,
    );
    if (containers.length === 0) return;
    containers.forEach((container) => {
      const sheets = container.querySelectorAll(".schedule-sheet");
      sheets.forEach((sheet) => {
        const table = sheet.querySelector(".schedule-table");
        if (!table) return;
        const header = table.querySelector("thead");
        const rows = table.querySelectorAll("tbody tr");
        if (!header || rows.length === 0) return;
        const sheetStyles = getComputedStyle(sheet);
        const paddingTop = parseFloat(sheetStyles.paddingTop) || 0;
        const paddingBottom = parseFloat(sheetStyles.paddingBottom) || 0;
        const availableHeight =
          sheet.clientHeight - paddingTop - paddingBottom - header.offsetHeight;
        if (availableHeight <= 0) return;
        const rowHeight = Math.floor(availableHeight / rows.length);
        sheet.style.setProperty("--rowHeight", `${rowHeight}px`);
      });
    });
  }, []);

  // Delegated events for add/delete within rendered HTML
  useEffect(() => {
    const containers = [printRef.current, multiExportRef.current].filter(
      Boolean,
    );
    if (containers.length === 0) return;
    const handleClick = (e) => {
      const root = e.currentTarget;
      let target = e.target;
      // If target is a text node, normalize to its parent element
      if (target && target.nodeType !== 1 && target.parentElement) {
        target = target.parentElement;
      }
      const actionEl =
        target && target.closest ? target.closest("[data-action]") : null;
      if (!actionEl) return;
      const action = actionEl.getAttribute("data-action");
      if (action === "add-class") {
        const td = actionEl.closest("td[data-slot]");
        if (!td) return;
        const list = td.querySelector(".class-list");
        if (!list) return;
        const wrapper = document.createElement("div");
        wrapper.className = "class-entry-wrapper";
        wrapper.innerHTML = `
                    <button class="delete-entry-btn export-ignore" data-action="delete-class" title="Remove">×</button>
                    <div class="class-entry" contenteditable="true">NEW 000.01</div>
                    <div class="prof-entry" contenteditable="true">Instructor Name</div>
                `;
        list.appendChild(wrapper);
      } else if (action === "delete-class") {
        const wrapper = actionEl.closest(".class-entry-wrapper");
        if (wrapper) wrapper.remove();
      } else if (action === "delete-block") {
        const block = actionEl.closest(".class-block");
        if (block) block.remove();
      } else if (action === "add-week-block") {
        const grid = root.querySelector(".weekly-grid");
        if (!grid) return;
        const existing = root.querySelector(".weekly-add-form");
        if (existing) {
          existing.remove();
          return;
        }
        const formEl = document.createElement("div");
        formEl.className = "weekly-add-form export-ignore";
        formEl.innerHTML = `
                    <div class="inline-form">
                        <label>Days</label>
                        <div class="day-checkboxes">
                            <label class="day-checkbox">
                                <input type="checkbox" value="M" class="day-input">
                                <span>Mon</span>
                            </label>
                            <label class="day-checkbox">
                                <input type="checkbox" value="T" class="day-input">
                                <span>Tue</span>
                            </label>
                            <label class="day-checkbox">
                                <input type="checkbox" value="W" class="day-input">
                                <span>Wed</span>
                            </label>
                            <label class="day-checkbox">
                                <input type="checkbox" value="R" class="day-input">
                                <span>Thu</span>
                            </label>
                            <label class="day-checkbox">
                                <input type="checkbox" value="F" class="day-input">
                                <span>Fri</span>
                            </label>
                        </div>
                        <label>Start</label>
                        <input class="inline-input start" placeholder="10:00 am" />
                        <label>End</label>
                        <input class="inline-input end" placeholder="10:50 am" />
                        <button class="btn-primary inline-btn" data-action="submit-week-form" type="button">Add</button>
                        <button class="btn-secondary inline-btn" data-action="add-week-block" type="button">Cancel</button>
                    </div>
                `;
        grid.insertAdjacentElement("beforebegin", formEl);
      } else if (action === "submit-week-form") {
        const form = actionEl.closest(".weekly-add-form");
        if (!form) return;
        const grid = root.querySelector(".weekly-grid");
        if (!grid) return;

        // Get selected days
        const selectedDays = Array.from(
          form.querySelectorAll(".day-input:checked"),
        ).map((cb) => cb.value);
        if (selectedDays.length === 0) {
          setAlertDialog({
            isOpen: true,
            title: "Validation Error",
            message: "Please select at least one day.",
          });
          return;
        }

        const startStr = form.querySelector("input.start").value;
        const endStr = form.querySelector("input.end").value;
        if (!startStr || !endStr) {
          setAlertDialog({
            isOpen: true,
            title: "Validation Error",
            message: "Please enter both start and end times.",
          });
          return;
        }

        const timeStr = `${startStr} - ${endStr}`;
        try {
          const colMap = { M: 2, T: 3, W: 4, R: 5, F: 6 };
          const start = parseInt(grid.getAttribute("data-start"), 10);
          const step = parseInt(grid.getAttribute("data-step"), 10);
          const headerOffset = parseInt(
            grid.getAttribute("data-headeroffset"),
            10,
          );
          const [startMin, endMin] = parseTimeRange(timeStr);
          const startRow = Math.floor((startMin - start) / step) + headerOffset;
          const endRow = Math.ceil((endMin - start) / step) + headerOffset;

          // Create a block for each selected day
          selectedDays.forEach((day) => {
            const col = colMap[day];
            if (col) {
              const html = `
                                <div class="class-block" style="grid-column: ${col}; grid-row: ${startRow} / ${endRow};">
                                    <button class="delete-entry-btn delete-block-btn export-ignore" data-action="delete-block" title="Remove">×</button>
                                    <div class="class-title" contenteditable="true">NEW 000.01</div>
                                    <div class="class-instructor" contenteditable="true">Instructor Name</div>
                                    <div class="class-time">${timeStr}</div>
                                </div>
                            `;
              grid.insertAdjacentHTML("beforeend", html);
            }
          });
          form.remove();
        } catch (err) {
          setAlertDialog({
            isOpen: true,
            title: "Invalid Time Format",
            message: 'Please use format like "10:00 am - 10:50 am"',
          });
        }
      }
    };
    containers.forEach((container) =>
      container.addEventListener("click", handleClick),
    );
    const resizeId = requestAnimationFrame(updateTableSizing);
    return () => {
      cancelAnimationFrame(resizeId);
      containers.forEach((container) =>
        container.removeEventListener("click", handleClick),
      );
    };
  }, [scheduleHtml, generatedSchedules, updateTableSizing]);

  // Firestore: saved grids
  const fetchSavedGrids = useCallback(async () => {
    setIsLoadingSaved(true);
    try {
      const gridsRef = collection(db, "roomGrids");
      const q = query(gridsRef, orderBy("createdAt", "desc"), limit(25));
      const snap = await getDocs(q);
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSavedGrids(results);
    } catch (err) {
      console.error("Error loading saved grids:", err);
    } finally {
      setIsLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    fetchSavedGrids();
  }, [fetchSavedGrids]);

  const saveGrid = async () => {
    if (!canEditHere) {
      showMessage("You do not have permission to save grids.", "error");
      return;
    }
    if (!scheduleHtml || !selectedBuilding || !selectedRoom) {
      showMessage(
        "Generate a schedule first, and ensure building/room are selected.",
      );
      return;
    }
    setIsSaving(true);
    try {
      const htmlRaw = printRef.current
        ? printRef.current.innerHTML
        : scheduleHtml;
      const html = DOMPurify.sanitize(htmlRaw, {
        USE_PROFILES: { html: true },
      });
      const payload = {
        title: `${selectedBuilding}-${selectedRoom}-${selectedDayType}-${semester}`,
        building: selectedBuilding,
        room: selectedRoom,
        dayType: selectedDayType,
        semester,
        html,
        createdAt: Date.now(),
      };
      const ref = await addDoc(collection(db, "roomGrids"), payload);
      logCreate(
        `Room Grid - ${payload.title}`,
        "roomGrids",
        ref.id,
        payload,
        "RoomGridGenerator.jsx - saveGrid",
      ).catch(() => { });
      showMessage("Grid saved.", "success");
      fetchSavedGrids();
    } catch (err) {
      console.error("Save failed:", err);
      showMessage("Failed to save grid.");
    } finally {
      setIsSaving(false);
    }
  };

  const loadGrid = (grid) => {
    if (!grid) return;
    setMultiRoomMode(false);
    setSelectedBuildings([]);
    setGeneratedSchedules([]);
    setShowExportableWeek(false);
    setWeeklyClasses([]);
    setSelectedBuilding(grid.building || selectedBuilding);
    setSelectedRoom(grid.room || selectedRoom);
    setSelectedDayType(grid.dayType || selectedDayType);
    setSemester(grid.semester || semester);
    setScheduleHtml(
      DOMPurify.sanitize(grid.html || "", { USE_PROFILES: { html: true } }),
    );
    showMessage("Loaded saved grid.", "success");
  };

  const deleteSavedGrid = async (grid) => {
    if (!canEditHere) {
      showMessage("You do not have permission to delete grids.", "error");
      return;
    }
    if (!grid) return;
    setDeleteGridConfirm({ isOpen: true, grid });
  };

  const handleConfirmDelete = async () => {
    if (!deleteGridConfirm.grid) return;
    if (!canEditHere) {
      showMessage("You do not have permission to delete grids.", "error");
      return;
    }
    try {
      await deleteDoc(
        doc(collection(db, "roomGrids"), deleteGridConfirm.grid.id),
      );
      logDelete(
        `Room Grid - ${deleteGridConfirm.grid.title}`,
        "roomGrids",
        deleteGridConfirm.grid.id,
        deleteGridConfirm.grid,
        "RoomGridGenerator.jsx - deleteGrid",
      ).catch(() => { });
      showMessage("Grid deleted.", "success");
      fetchSavedGrids();
    } catch (err) {
      console.error("Error deleting grid:", err);
      showMessage("Failed to delete grid.", "error");
    } finally {
      setDeleteGridConfirm({ isOpen: false, grid: null });
    }
  };

  const handleCancelDelete = () => {
    setDeleteGridConfirm({ isOpen: false, grid: null });
  };

  const buildingOptions = Object.keys(buildings)
    .sort()
    .map((name) => (
      <option key={name} value={name}>
        {name}
      </option>
    ));

  const roomOptions =
    selectedBuilding && buildings[selectedBuilding]
      ? Array.from(buildings[selectedBuilding])
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((room) => (
          <option key={room} value={room}>
            {room}
          </option>
        ))
      : [];

  const hasGeneratedSchedules = generatedSchedules.length > 0;
  const exportTargetRef = hasGeneratedSchedules
    ? multiExportRef
    : showExportableWeek
      ? exportableRef
      : printRef;
  const exportTitle = hasGeneratedSchedules
    ? `Room-Grids-${selectedDayType}-${semester || "Schedule"}`
    : `${selectedBuilding}-${selectedRoom}-${selectedDayType}-${semester}`;
  const exportButtonLabel =
    hasGeneratedSchedules && generatedSchedules.length > 1
      ? "Export All"
      : "Export";
  const exportNeedsSizing = hasGeneratedSchedules
    ? generatedSchedules.some((schedule) => schedule.kind === "table")
    : !showExportableWeek;

  return (
    <div className="page-content">
      <div className="university-header rounded-xl p-8 mb-8">
        <h1 className="university-title">Room Grid Generator</h1>
        <p className="university-subtitle">
          Create printable room schedules for door signage. Select a semester,
          choose a building and room, then generate a visual grid showing when
          classes meet.
        </p>
      </div>

      {/* Mode Selection Wizard */}
      {dataMode === null && (
        <div className="university-card mb-8">
          <div className="university-card-content">
            <h3 className="text-lg font-semibold text-baylor-green mb-4">
              Select Data Source
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Auto-Populate Option */}
              <div
                onClick={() => handleModeChange("auto")}
                className="border-2 border-gray-200 rounded-xl p-6 cursor-pointer hover:border-baylor-green hover:bg-green-50 transition-all duration-200 group"
              >
                <div className="flex items-center mb-3">
                  <Database className="w-8 h-8 text-baylor-green mr-3" />
                  <h4 className="text-lg font-semibold text-gray-900 group-hover:text-baylor-green">
                    Auto-Populate from Dashboard
                  </h4>
                </div>
                <p className="text-gray-600 text-sm mb-3">
                  Uses existing schedule data already in the application. Select
                  a semester and instantly generate room grids.
                </p>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-baylor-green text-white">
                  Recommended
                </span>
              </div>

              {/* CSV Import Option */}
              <div
                onClick={() => handleModeChange("csv")}
                className="border-2 border-gray-200 rounded-xl p-6 cursor-pointer hover:border-baylor-green hover:bg-green-50 transition-all duration-200 group"
              >
                <div className="flex items-center mb-3">
                  <Upload className="w-8 h-8 text-baylor-gold mr-3" />
                  <h4 className="text-lg font-semibold text-gray-900 group-hover:text-baylor-green">
                    Import CLSS CSV
                  </h4>
                </div>
                <p className="text-gray-600 text-sm mb-3">
                  Upload a fresh CLSS export CSV file. Use this for the most
                  up-to-date data or when working with a new semester not yet
                  imported.
                </p>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
                  Manual Upload
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Mode Button - shown when a mode is selected */}
      {dataMode !== null && (
        <div className="mb-4">
          <button
            onClick={() => {
              resetUI();
              setDataMode(null);
              setDashboardSchedules(null);
            }}
            className="btn-secondary text-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Change Data Source
          </button>
          <span className="ml-4 text-sm text-gray-600">
            Current:{" "}
            <strong>
              {dataMode === "auto" ? "Dashboard Data" : "CLSS CSV Import"}
            </strong>
          </span>
        </div>
      )}

      {message.text && (
        <div
          className={`alert mb-6 ${message.type === "success" ? "alert-success" : "alert-error"}`}
          role="alert"
        >
          <strong className="font-bold">Notice:</strong>
          <span className="block sm:inline"> {message.text}</span>
          <span
            onClick={() => setMessage({ text: "", type: "" })}
            className="absolute top-0 bottom-0 right-0 px-4 py-3 cursor-pointer"
          >
            <X
              className={`h-6 w-6 ${message.type === "success" ? "text-baylor-green" : "text-red-500"}`}
            />
          </span>
        </div>
      )}

      {/* Configuration Panel - only shown when mode is selected */}
      {dataMode !== null && (
        <div className="university-card">
          <div className="university-card-content">
            {isLoadingDashboard && (
              <div className="flex items-center justify-center py-8" role="status" aria-live="polite">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-baylor-green mr-3" aria-hidden="true"></div>
                <span className="text-gray-600">Loading schedule data...</span>
              </div>
            )}

            {!isLoadingDashboard && (
              <>
                {/* Form grid - responsive 2-column layout */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* CSV Upload - only for csv mode */}
                  {dataMode === "csv" && (
                    <div className="sm:col-span-2 lg:col-span-1">
                      <label
                        htmlFor="csvFile"
                        className="block text-sm font-semibold text-gray-700 mb-2"
                      >
                        CLSS Export File
                      </label>
                      <input
                        type="file"
                        ref={fileUploaderRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept=".csv"
                        aria-describedby="csv-help"
                      />
                      <button
                        onClick={triggerFileUpload}
                        className="btn-secondary w-full justify-center"
                        aria-label="Upload CLSS CSV file"
                      >
                        <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
                        {isProcessing ? "Processing..." : "Choose File..."}
                      </button>
                      <p id="csv-help" className="text-xs text-gray-500 mt-1">
                        Export from CLSS with room assignments
                      </p>
                    </div>
                  )}

                  {/* Semester Selection */}
                  <div>
                    <label
                      htmlFor="semesterSelect"
                      className="block text-sm font-semibold text-gray-700 mb-2"
                    >
                      Semester
                      <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                    </label>
                    {dataMode === "auto" && availableSemesters.length > 0 ? (
                      <select
                        id="semesterSelect"
                        value={semester}
                        onChange={(e) => setSemester(e.target.value)}
                        className="form-select"
                        aria-required="true"
                        aria-describedby="semester-help"
                      >
                        <option value="">Choose semester...</option>
                        {availableSemesters.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        id="semesterInput"
                        value={semester}
                        onChange={(e) => setSemester(e.target.value)}
                        className="form-input"
                        placeholder="e.g., Fall 2025"
                        aria-required="true"
                        aria-describedby="semester-help"
                      />
                    )}
                    <p id="semester-help" className="text-xs text-gray-500 mt-1">
                      {Object.keys(buildings).length > 0
                        ? `${Object.keys(buildings).length} buildings available`
                        : dataMode === "auto" ? "Select to load buildings" : "Upload CSV first"}
                    </p>
                  </div>

                  {/* Building Selection */}
                  <div>
                    <label
                      htmlFor="buildingSelect"
                      className="block text-sm font-semibold text-gray-700 mb-2"
                    >
                      Building
                      <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                    </label>
                    <select
                      id="buildingSelect"
                      value={multiRoomMode ? "" : selectedBuilding}
                      onChange={(e) => {
                        setSelectedBuilding(e.target.value);
                        setSelectedBuildings(
                          e.target.value ? [e.target.value] : [],
                        );
                        setSelectedRoom("");
                      }}
                      className="form-select"
                      disabled={Object.keys(buildings).length === 0}
                      aria-required="true"
                      aria-describedby="building-help"
                      {...(multiRoomMode && { multiple: true, value: selectedBuildings, onChange: handleSelectedBuildingsChange })}
                    >
                      {!multiRoomMode && <option value="">Choose building...</option>}
                      {buildingOptions}
                    </select>
                    <p id="building-help" className="text-xs text-gray-500 mt-1">
                      {Object.keys(buildings).length === 0
                        ? "No buildings loaded yet"
                        : selectedBuilding && buildings[selectedBuilding]
                          ? `${Array.from(buildings[selectedBuilding]).length} rooms`
                          : "Select a building to see rooms"}
                    </p>
                  </div>

                  {/* Room Selection */}
                  <div>
                    <label
                      htmlFor="roomSelect"
                      className="block text-sm font-semibold text-gray-700 mb-2"
                    >
                      Room
                      {!multiRoomMode && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
                    </label>
                    {multiRoomMode ? (
                      <div
                        className="form-input bg-gray-50 text-gray-600 cursor-not-allowed"
                        aria-live="polite"
                      >
                        <span className="flex items-center">
                          <Info className="w-4 h-4 mr-2 text-baylor-green" aria-hidden="true" />
                          All rooms will be generated
                        </span>
                      </div>
                    ) : (
                      <select
                        id="roomSelect"
                        value={selectedRoom}
                        onChange={(e) => setSelectedRoom(e.target.value)}
                        className="form-select"
                        disabled={!selectedBuilding}
                        aria-required="true"
                        aria-describedby="room-help"
                      >
                        <option value="">
                          {!selectedBuilding ? "Select building first" : "Choose room..."}
                        </option>
                        {roomOptions}
                      </select>
                    )}
                    {!multiRoomMode && (
                      <p id="room-help" className="text-xs text-gray-500 mt-1">
                        {!selectedBuilding
                          ? "Building required"
                          : roomOptions.length === 0
                            ? "No rooms found"
                            : "Select a specific room"}
                      </p>
                    )}
                  </div>
                </div>

                {/* Day Pattern Selection - separate row for clarity */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="flex flex-wrap items-center gap-4">
                    <div>
                      <label
                        htmlFor="dayTypeSelect"
                        className="block text-sm font-semibold text-gray-700 mb-2"
                      >
                        Day Pattern
                      </label>
                      <select
                        id="dayTypeSelect"
                        value={selectedDayType}
                        onChange={(e) => setSelectedDayType(e.target.value)}
                        className="form-select w-auto min-w-[180px]"
                        disabled={Object.keys(buildings).length === 0}
                        aria-describedby="daytype-help"
                      >
                        <option value="WEEK">Full Week (Mon–Fri)</option>
                        <option value="MWF">Mon / Wed / Fri only</option>
                        <option value="TR">Tue / Thu only</option>
                      </select>
                    </div>
                    <p id="daytype-help" className="text-sm text-gray-500 self-end pb-2">
                      Choose which days to include in the schedule grid
                    </p>
                  </div>
                </div>

                {/* Advanced Options - collapsible */}
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                    className="flex items-center text-sm text-gray-600 hover:text-baylor-green transition-colors"
                    aria-expanded={showAdvancedOptions}
                    aria-controls="advanced-options"
                  >
                    {showAdvancedOptions ? (
                      <ChevronUp className="w-4 h-4 mr-1" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4 mr-1" aria-hidden="true" />
                    )}
                    Advanced Options
                  </button>
                  {showAdvancedOptions && (
                    <div
                      id="advanced-options"
                      className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <div className="flex items-start gap-3">
                        <input
                          id="multiRoomToggle"
                          type="checkbox"
                          checked={multiRoomMode}
                          onChange={handleMultiRoomToggle}
                          className="h-4 w-4 text-baylor-green border-gray-300 rounded mt-0.5"
                        />
                        <div>
                          <label
                            htmlFor="multiRoomToggle"
                            className="text-sm font-medium text-gray-700 cursor-pointer"
                          >
                            Batch Mode: Generate all rooms at once
                          </label>
                          <p className="text-xs text-gray-500 mt-1">
                            Creates a grid for every room in the selected building(s).
                            {multiRoomMode && " Hold Cmd/Ctrl to select multiple buildings."}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="mt-6 flex flex-wrap justify-between items-center gap-4">
                  <button
                    onClick={() => setResetConfirmDialog(true)}
                    className="btn-ghost text-gray-600 hover:text-gray-800"
                    aria-label="Reset form to default values"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" aria-hidden="true" />
                    Reset Form
                  </button>

                  <div className="flex flex-wrap gap-3">
                    {/* Generate Button with contextual disabled state */}
                    <div className="relative group">
                      <button
                        onClick={generateSchedule}
                        className="btn-primary"
                        disabled={
                          Object.keys(buildings).length === 0 ||
                          (!multiRoomMode && (!selectedBuilding || !selectedRoom))
                        }
                        aria-describedby="generate-help"
                      >
                        <FileText className="w-4 h-4 mr-2" aria-hidden="true" />
                        Generate Schedule
                      </button>
                      {/* Tooltip for disabled state */}
                      {(Object.keys(buildings).length === 0 ||
                        (!multiRoomMode && (!selectedBuilding || !selectedRoom))) && (
                          <div
                            id="generate-help"
                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10"
                            role="tooltip"
                          >
                            {Object.keys(buildings).length === 0
                              ? "Load schedule data first"
                              : !selectedBuilding
                                ? "Select a building"
                                : "Select a room"}
                          </div>
                        )}
                    </div>

                    {/* Save Grid Button - only when schedule is generated */}
                    {canEditHere && !multiRoomMode && scheduleHtml && (
                      <button
                        onClick={saveGrid}
                        disabled={isSaving}
                        className="btn-secondary"
                        aria-label={isSaving ? "Saving grid..." : "Save this grid to view later"}
                      >
                        <SaveIcon className="w-4 h-4 mr-2" aria-hidden="true" />
                        {isSaving ? "Saving..." : "Save Grid"}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      <ConfirmDialog
        isOpen={resetConfirmDialog}
        title="Reset Form"
        message="This will clear all selections and the generated schedule. Are you sure?"
        variant="warning"
        confirmText="Reset"
        cancelText="Cancel"
        onConfirm={() => {
          resetUI();
          setResetConfirmDialog(false);
        }}
        onCancel={() => setResetConfirmDialog(false)}
      />

      {/* Schedule Preview - MOVED ABOVE Saved Grids for better visibility */}
      <div className="university-card mt-6">
        <div className="university-card-header flex items-center justify-between">
          <div>
            <h2 className="university-card-title">Schedule Preview</h2>
            <p className="university-card-subtitle">
              {scheduleHtml || showExportableWeek || hasGeneratedSchedules
                ? "Click any text to edit before exporting"
                : "Generate a schedule to see the preview"}
            </p>
          </div>
          {/* Export button - show for either old HTML schedules or new exportable component */}
          {(scheduleHtml || showExportableWeek || hasGeneratedSchedules) && (
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="btn-primary"
              aria-label="Export schedule as image"
            >
              <Download className="w-4 h-4 mr-2" aria-hidden="true" />
              {exportButtonLabel}
            </button>
          )}
        </div>
        <div className="university-card-content min-h-[300px]">
          {isProcessing ? (
            <div className="text-center text-gray-500 flex flex-col items-center justify-center h-full py-12" role="status" aria-live="polite">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-baylor-green mb-4" aria-hidden="true"></div>
              <p>Processing file...</p>
            </div>
          ) : hasGeneratedSchedules ? (
            <div
              ref={multiExportRef}
              className="flex flex-col items-center gap-6"
            >
              {generatedSchedules.map((schedule) =>
                schedule.kind === "week" ? (
                  <div key={schedule.id} className="flex justify-center">
                    <ExportableRoomSchedule
                      spaceLabel={schedule.room}
                      buildingName={schedule.building}
                      semester={schedule.semester}
                      classes={schedule.classes}
                      exportName={buildExportName(
                        schedule.building,
                        schedule.room,
                        schedule.dayType,
                        schedule.semester,
                      )}
                    />
                  </div>
                ) : (
                  <div
                    key={schedule.id}
                    dangerouslySetInnerHTML={{ __html: schedule.html }}
                  ></div>
                ),
              )}
            </div>
          ) : showExportableWeek ? (
            /* New exportable weekly schedule component */
            <div style={{ display: "flex", justifyContent: "center" }}>
              <ExportableRoomSchedule
                ref={exportableRef}
                spaceLabel={selectedRoom}
                buildingName={selectedBuilding}
                semester={semester}
                classes={weeklyClasses}
                exportName={buildExportName(
                  selectedBuilding,
                  selectedRoom,
                  selectedDayType,
                  semester,
                )}
              />
            </div>
          ) : scheduleHtml ? (
            /* Legacy HTML-based schedules (MWF/TR) */
            <div
              ref={printRef}
              style={{ margin: "0 auto" }}
              dangerouslySetInnerHTML={{ __html: scheduleHtml }}
            ></div>
          ) : (
            /* Empty state with better guidance */
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-6">
                <FileText className="w-10 h-10 text-gray-400" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                No Schedule Generated Yet
              </h3>
              <p className="text-gray-500 max-w-md mx-auto">
                {dataMode === null
                  ? "Choose a data source above to get started."
                  : Object.keys(buildings).length === 0
                    ? "Select a semester to load available buildings and rooms."
                    : !selectedBuilding
                      ? "Select a building to continue."
                      : !selectedRoom && !multiRoomMode
                        ? "Select a room, then click Generate Schedule."
                        : "Click Generate Schedule to create your room grid."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Saved Grids - Collapsible Section */}
      <div className="university-card mt-6">
        <button
          onClick={() => setSavedGridsExpanded(!savedGridsExpanded)}
          className="w-full university-card-header flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
          aria-expanded={savedGridsExpanded}
          aria-controls="saved-grids-content"
        >
          <div className="flex items-center gap-3">
            {savedGridsExpanded ? (
              <ChevronUp className="w-5 h-5 text-baylor-green" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-5 h-5 text-baylor-green" aria-hidden="true" />
            )}
            <div className="text-left">
              <h2 className="text-lg font-semibold text-baylor-green">
                Saved Grids
              </h2>
              <p className="text-sm text-gray-500">
                {savedGrids.length} saved schedule{savedGrids.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              fetchSavedGrids();
            }}
            className="btn-ghost text-sm"
            aria-label="Refresh saved grids list"
          >
            Refresh
          </button>
        </button>

        {savedGridsExpanded && (
          <div id="saved-grids-content" className="university-card-content border-t border-gray-200">
            {isLoadingSaved ? (
              <div className="text-gray-500 py-4" role="status" aria-live="polite">
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-baylor-green mr-3" aria-hidden="true"></div>
                  Loading saved grids...
                </div>
              </div>
            ) : savedGrids.length === 0 ? (
              <div className="text-gray-500 py-8 text-center">
                <p>No saved grids yet.</p>
                <p className="text-sm mt-1">Generate a schedule and click "Save Grid" to save it for later.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="university-table min-w-full" role="table">
                  <thead>
                    <tr>
                      <th className="table-header-cell" scope="col">Title</th>
                      <th className="table-header-cell" scope="col">Building</th>
                      <th className="table-header-cell" scope="col">Room</th>
                      <th className="table-header-cell" scope="col">Pattern</th>
                      <th className="table-header-cell" scope="col">Semester</th>
                      <th className="table-header-cell" scope="col">Created</th>
                      <th className="table-header-cell" scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedGrids.map((g) => (
                      <tr key={g.id}>
                        <td className="table-cell font-medium">{g.title}</td>
                        <td className="table-cell">{g.building}</td>
                        <td className="table-cell">{g.room}</td>
                        <td className="table-cell">
                          {g.dayType === "WEEK" ? "Full Week" : g.dayType === "MWF" ? "Mon/Wed/Fri" : "Tue/Thu"}
                        </td>
                        <td className="table-cell">{g.semester}</td>
                        <td className="table-cell text-gray-600">
                          {g.createdAt
                            ? new Date(g.createdAt).toLocaleDateString()
                            : "Unknown"}
                        </td>
                        <td className="table-cell space-x-2">
                          <button
                            onClick={() => loadGrid(g)}
                            className="btn-secondary text-sm py-1 px-3"
                            aria-label={`Load ${g.title}`}
                          >
                            Load
                          </button>
                          <button
                            onClick={() => deleteSavedGrid(g)}
                            className="btn-danger text-sm py-1 px-3"
                            aria-label={`Delete ${g.title}`}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        scheduleTableRef={exportTargetRef}
        title={exportTitle}
        exportScale={3}
        onExport={exportNeedsSizing ? () => updateTableSizing() : undefined}
      />

      {/* Alert Dialog */}
      <ConfirmDialog
        isOpen={alertDialog.isOpen}
        title={alertDialog.title}
        message={alertDialog.message}
        variant="warning"
        confirmText="OK"
        onConfirm={() =>
          setAlertDialog({ isOpen: false, message: "", title: "" })
        }
        onCancel={() =>
          setAlertDialog({ isOpen: false, message: "", title: "" })
        }
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteGridConfirm.isOpen}
        title="Delete Saved Grid"
        message={`Are you sure you want to delete "${deleteGridConfirm.grid?.title}"? This action cannot be undone.`}
        variant="danger"
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      <style>{`
                /* Baylor brand palette */
                .schedule-sheet { 
                    --baylor-green: #154734; 
                    --baylor-gold: #FFB81C; 
                    /* neutrals & semantic tokens for this sheet */
                    --sheet-bg: #ffffff;
                    --neutral-border: #e5e7eb;
                    --neutral-border-strong: #d1d5db;
                    --text-strong: #111827;
                    --text-muted: #374151;
                    --accent-bg: #f6f9f6;
                    --row-bg: #f7faf7;
                    --block-bg: #f0fff0;
                    --form-bg: #f8fffa;
                    --edit-bg: #e5efe9;
                    --edit-border: #c7d7cf;
                    --danger-bg: #fee2e2;
                    --danger-text: #991b1b;
                    --danger-border: #fecaca;
                    --green-dark: #0f3a2a;
                    background: var(--sheet-bg);
                    box-sizing: border-box;
                    width: 7in;
                    height: 5in;
                    margin: 0 auto;
                    padding: 0.35in;
                    border: 1px solid var(--neutral-border);
                    border-radius: 10px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.08);
                    overflow: hidden;
                }
                .schedule-table {
                    border-collapse: collapse;
                    width: 100%;
                    height: 100%;
                    table-layout: fixed;
                    font-size: 11px;
                    line-height: 1.2;
                    color: var(--text-strong);
                }
                .schedule-table th, .schedule-table td {
                    border: 1px solid var(--neutral-border);
                    padding: 6px;
                    text-align: left;
                    vertical-align: top;
                }
                .schedule-table td {
                    overflow: hidden;
                    word-break: break-word;
                }
                .schedule-table tbody tr {
                    height: var(--rowHeight, auto);
                }
                .schedule-table thead th {
                    background-color: var(--baylor-green);
                    color: #ffffff;
                    text-align: center;
                    border-bottom: 3px solid var(--baylor-gold);
                    padding-top: 10px;
                    padding-bottom: 10px;
                }
                .schedule-table thead .text-2xl {
                    font-size: 16px;
                    letter-spacing: 0.5px;
                }
                .schedule-table thead .text-lg {
                    font-size: 12px;
                    opacity: 0.95;
                }
                .schedule-table thead .text-md {
                    font-size: 11px;
                    opacity: 0.9;
                }
                .time-slot {
                    font-weight: 700;
                    width: 1.05in;
                    background-color: var(--accent-bg);
                    color: var(--baylor-green);
                    text-align: center;
                    font-size: 11px;
                }
                .class-entry {
                    font-weight: 700;
                    color: var(--baylor-green);
                    font-size: 11px;
                    line-height: 1.1;
                }
                .prof-entry {
                    font-size: 10px;
                    color: var(--text-muted);
                    line-height: 1.1;
                }
                .schedule-table hr {
                    border: 0;
                    border-top: 1px solid var(--neutral-border);
                    margin: 4px 0;
                }
                [contenteditable="true"] {
                    cursor: pointer;
                }
                [contenteditable="true"]:hover {
                    background-color: rgba(21,71,52,0.05);
                }
                [contenteditable="true"]:focus {
                    outline: 2px solid var(--baylor-green);
                    background-color: rgba(21,71,52,0.06);
                    border-radius: 2px;
                }
                @media print {
                    @page { size: 7in 5in; margin: 0.35in; }
                    .schedule-sheet { 
                        -webkit-print-color-adjust: exact; 
                        print-color-adjust: exact; 
                        box-shadow: none; 
                        border-radius: 0; 
                        border: none;
                        width: 7in !important;
                        height: 5in !important;
                        padding: 0; 
                        margin: 0 auto;
                    }
                    .weekly-sheet {
                        padding: 0.25in;
                        padding-top: 0;
                    }
                    .weekly-grid .class-block {
                        padding: 4px 6px;
                        margin: 1px 2px;
                    }
                    .weekly-grid .class-title { font-size: 11px; }
                    .weekly-grid .class-instructor { font-size: 10px; }
                    .weekly-grid .class-time { font-size: 9px; }
                    .schedule-table { font-size: 10pt; }
                    .schedule-table th, .schedule-table td { padding: 6pt; }
                }
 
                 /* Weekly grid layout */
                .weekly-sheet { 
                    padding: 0.35in; 
                    padding-top: 0; 
                    display: flex;
                    flex-direction: column;
                }
                .weekly-header {
                    background-color: var(--baylor-green);
                    color: #ffffff;
                    text-align: center;
                    border-bottom: 3px solid var(--baylor-gold);
                    padding: 10px;
                    margin: 0 0 8px 0;
                    position: relative;
                }
                .weekly-header .header-left { display: table; margin: 0 auto; }
                .weekly-header .header-actions { position: absolute; right: 12px; top: 12px; display: flex; align-items: center; gap: 8px; }
                .inline-form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
                .inline-form label { font-size: 12px; color: var(--text-muted); }
                .inline-input { border: 1px solid var(--neutral-border-strong); border-radius: 4px; padding: 4px 6px; font-size: 12px; }
                .inline-btn { padding: 4px 8px; font-size: 12px; }
                .weekly-header .text-2xl { font-size: 16px; letter-spacing: 0.4px; }
                .weekly-header .text-md { font-size: 11px; opacity: 0.9; }
                .weekly-grid { 
                    display: grid; 
                    grid-template-columns: 0.9in repeat(5, 1fr);
                    grid-template-rows: auto repeat(var(--rows), minmax(0, 1fr));
                    position: relative; 
                    gap: 0; 
                    border: 1px solid var(--neutral-border);
                    min-width: 100%;
                    flex: 1 1 auto;
                    min-height: 0;
                }
                .weekly-grid .day-header {
                    position: sticky; top: 0; z-index: 2;
                    grid-row: 1;
                    background: var(--baylor-green);
                    color: #fff;
                    font-size: 12px;
                    font-weight: 700;
                    text-align: center;
                    padding: 6px 4px;
                    border-bottom: 2px solid var(--baylor-gold);
                }
                .weekly-grid .hour-label { 
                    font-weight: 700; 
                    font-size: 10px;
                    color: var(--baylor-green); 
                    display: flex; 
                    align-items: flex-start; 
                    justify-content: center; 
                    text-align: center;
                    padding: 4px 2px; 
                    border-top: 1px solid var(--neutral-border); 
                    border-right: 1px solid var(--neutral-border);
                    background: var(--row-bg); 
                    line-height: 1.1;
                }
                .weekly-grid .hour-line { 
                    border-top: 1px solid var(--neutral-border); 
                }
                .weekly-grid .class-block { 
                    background-color: var(--block-bg);
                    border: 1px solid var(--baylor-green);
                    border-left: 3px solid var(--baylor-green);
                    border-radius: 4px;
                    padding: 4px 6px; 
                    margin: 1px 2px; 
                    box-shadow: 0 2px 4px rgba(0,0,0,0.08);
                    display: flex; 
                    flex-direction: column; 
                    justify-content: center;
                    align-items: center;
                    text-align: center;
                    gap: 2px; 
                    overflow: hidden;
                    word-break: break-word;
                    font-size: 11px;
                    position: relative;
                    line-height: 1.1;
                }
                .weekly-grid .class-title { font-weight: 700; color: var(--baylor-green); font-size: 11px; line-height: 1.1; letter-spacing: 0.2px; }
                .weekly-grid .class-instructor { font-size: 10px; color: var(--text-muted); line-height: 1.1; }
                .weekly-grid .class-time { font-size: 9px; color: var(--text-strong); line-height: 1.1; font-weight: 500; }

                /* Editing helpers */
                .slot-toolbar { display: flex; justify-content: flex-end; }
                .slot-add-btn { background: var(--edit-bg); color: var(--baylor-green); border: 1px solid var(--edit-border); border-radius: 4px; padding: 2px 6px; font-size: 11px; cursor: pointer; }
                .class-list { display: flex; flex-direction: column; gap: 4px; }
                .class-entry-wrapper { position: relative; padding-right: 18px; }
                .delete-entry-btn { position: absolute; top: 0; right: 0; background: var(--danger-bg); color: var(--danger-text); border: 1px solid var(--danger-border); width: 16px; height: 16px; line-height: 14px; text-align: center; border-radius: 4px; cursor: pointer; font-size: 12px; }
                .delete-block-btn { top: 4px; right: 4px; }
                .weekly-add-form {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                    margin: 15px 0;
                    padding: 15px;
                    background-color: var(--form-bg);
                    border: 2px solid var(--baylor-green);
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(21,71,52,0.15);
                }
                .weekly-add-form .inline-form {
                    display: flex;
                    gap: 12px;
                    align-items: center;
                    flex-wrap: wrap;
                }
                .weekly-add-form .inline-form label {
                    font-size: 12px;
                    color: var(--baylor-green);
                    font-weight: 600;
                    min-width: 40px;
                }
                .weekly-add-form .inline-input {
                    padding: 8px 12px;
                    border: 1px solid var(--edit-border);
                    border-radius: 6px;
                    font-size: 12px;
                    color: var(--text-strong);
                    min-width: 100px;
                    background: white;
                }
                .weekly-add-form .inline-input:focus {
                    outline: none;
                    border-color: var(--baylor-green);
                    box-shadow: 0 0 0 2px rgba(21,71,52,0.1);
                }
                .weekly-add-form .inline-btn {
                    padding: 8px 16px;
                    font-size: 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.2s;
                }
                .weekly-add-form .btn-primary { 
                    background: var(--baylor-green); 
                    color: white; 
                    border: 1px solid var(--baylor-green); 
                }
                .weekly-add-form .btn-primary:hover { 
                    background: var(--green-dark); 
                    border-color: var(--green-dark); 
                }
                .weekly-add-form .btn-secondary { 
                    background: var(--form-bg); 
                    color: var(--baylor-green); 
                    border: 1px solid var(--baylor-green); 
                }
                .weekly-add-form .btn-secondary:hover { 
                    background: var(--edit-bg); 
                }
                
                /* Day checkbox styling */
                .day-checkboxes {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .day-checkbox {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    cursor: pointer;
                    padding: 4px 8px;
                    border: 1px solid var(--edit-border);
                    border-radius: 4px;
                    background: white;
                    transition: all 0.2s;
                }
                .day-checkbox:hover {
                    background: var(--block-bg);
                    border-color: var(--baylor-green);
                }
                .day-checkbox input[type="checkbox"] {
                    margin: 0;
                    cursor: pointer;
                }
                .day-checkbox input[type="checkbox"]:checked + span {
                    color: var(--baylor-green);
                    font-weight: 600;
                }
                .day-checkbox input[type="checkbox"]:checked {
                    accent-color: var(--baylor-green);
                }
                @media print {
                  .export-ignore { display: none !important; }
                }
            `}</style>
    </div>
  );
};

export default RoomGridGenerator;
