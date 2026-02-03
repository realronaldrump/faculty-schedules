/**
 * TutorialContext - Centralized tutorial and help system management
 *
 * This context handles:
 * - Active tutorial state (which tutorial is running)
 * - Tutorial step progression
 * - Tooltip visibility preferences
 * - First-time user hints
 * - Tutorial completion tracking
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

const TutorialContext = createContext(null);

// Tutorial definitions - each tutorial has steps with targets and content
export const TUTORIALS = {
  "email-lists": {
    id: "email-lists",
    title: "Email Lists Tutorial",
    description:
      "Learn how to filter, select, and export email lists for faculty and staff.",
    estimatedTime: "5 min",
    category: "People Management",
    targetPage: "people/email-lists?tab=email-lists",
    steps: [
      {
        id: "welcome",
        title: "Welcome to Email Lists",
        content:
          "This tool helps you create customized email lists for faculty, staff, and student workers. You can filter by department, role, building, and more.",
        target: null, // No specific element - intro step
        position: "center",
        action: null,
      },
      {
        id: "tabs",
        title: "Choose Your Audience",
        content:
          "Use these tabs to switch between Faculty & Staff or Student Workers. Each tab has its own filters and selection.",
        target: '[data-tutorial="audience-tabs"]',
        position: "bottom",
        action: null,
      },
      {
        id: "search",
        title: "Search for People",
        content:
          "Use the search bar to quickly find specific people by name, email, job title, or office location.",
        target: '[data-tutorial="search-input"]',
        position: "bottom",
        action: "Try typing a name in the search box",
        actionType: "type",
      },
      {
        id: "presets",
        title: "Use Saved Presets",
        content:
          "Load previously saved email lists from the preset dropdown. This is perfect for recurring communications to the same group.",
        target: '[data-tutorial="preset-dropdown"]',
        position: "bottom",
        action: null,
      },
      {
        id: "adjunct-filter",
        title: "Quick Adjunct Filter",
        content:
          "By default, adjunct faculty are hidden. Use this checkbox to quickly include or exclude them from your list.",
        target: '[data-tutorial="adjunct-checkbox"]',
        position: "bottom",
        action: null,
      },
      {
        id: "advanced-filters",
        title: "Advanced Filters",
        content:
          "Click here to access powerful filtering options including programs, job titles, buildings, tenure status, and more.",
        target: '[data-tutorial="advanced-filters-btn"]',
        position: "bottom",
        action: "Click to expand the advanced filters panel",
        actionType: "click",
      },
      {
        id: "filter-programs",
        title: "Filter by Program",
        content:
          'Include or exclude specific academic programs. Use "Include Programs" to show only certain programs, or "Exclude Programs" to hide them.',
        target: '[data-tutorial="program-filters"]',
        position: "bottom",
        action: null,
        requiresExpanded: "advanced-filters",
      },
      {
        id: "select-people",
        title: "Select People",
        content:
          'Click the checkbox next to each person to select them, or use "Select All" to select everyone in the filtered list.',
        target: '[data-tutorial="select-all-checkbox"]',
        position: "top",
        action: "Try selecting a few people from the list",
        actionType: "click",
      },
      {
        id: "export-options",
        title: "Export Your List",
        content:
          "Once you have selected people, use these buttons to copy emails to clipboard or download a CSV file with all contact details.",
        target: '[data-tutorial="export-buttons"]',
        position: "top",
        action: null,
      },
      {
        id: "outlook-version",
        title: "Outlook Compatibility",
        content:
          'Choose between "New" (comma-separated) or "Old" (semicolon-separated) Outlook format depending on your email client version.',
        target: '[data-tutorial="outlook-version"]',
        position: "left",
        action: null,
      },
      {
        id: "save-preset",
        title: "Save for Later",
        content:
          'After selecting people, click "Save Preset" to save this list for future use. Give it a memorable name like "All Faculty" or "Remote Staff".',
        target: '[data-tutorial="save-preset-btn"]',
        position: "bottom",
        action: null,
      },
      {
        id: "complete",
        title: "You're All Set!",
        content:
          "You now know how to create and manage email lists. Remember: filter first, then select, then export. Happy emailing!",
        target: null,
        position: "center",
        action: null,
      },
    ],
  },
  "room-schedules": {
    id: "room-schedules",
    title: "Room Schedules Tutorial",
    description:
      "Learn how to view room schedules, utilization, and availability.",
    estimatedTime: "3 min",
    category: "Scheduling",
    targetPage: "scheduling/rooms?tab=browse",
    steps: [
      {
        id: "welcome",
        title: "Welcome to Room Schedules",
        content:
          "This tool helps you visualize classroom usage across the department. You can see which rooms are occupied, find available spaces, and analyze utilization patterns.",
        target: null,
        position: "center",
        action: null,
      },
      {
        id: "day-selector",
        title: "Select a Day",
        content:
          "Use these buttons to switch between weekdays. The schedule will update to show classes for the selected day.",
        target: '[data-tutorial="day-selector"]',
        position: "bottom",
        action: "Try clicking a different day to see how the schedule changes",
        actionType: "click",
      },
      {
        id: "building-filter",
        title: "Filter by Building",
        content:
          "Use this dropdown to show only rooms in a specific building. Great for focusing on classrooms in your area.",
        target: '[data-tutorial="building-filter"]',
        position: "bottom",
        action: null,
      },
      {
        id: "room-selector",
        title: "Select a Specific Room",
        content:
          "Choose a single room to view its complete schedule. This isolates one room for detailed viewing.",
        target: '[data-tutorial="room-selector"]',
        position: "bottom",
        action: null,
      },
      {
        id: "view-mode",
        title: "Choose Your View",
        content:
          "Switch between different visualizations: Timeline shows a Gantt-style chart, List shows detailed cards, Week shows the full week, and Calendar shows a monthly view.",
        target: '[data-tutorial="view-mode-toggle"]',
        position: "bottom",
        action: "Try switching to a different view mode",
        actionType: "click",
      },
      {
        id: "only-in-use",
        title: "Filter Active Rooms",
        content:
          "Toggle this on to hide rooms with no scheduled classes. This helps you focus on rooms that are actively being used for classes.",
        target: '[data-tutorial="only-in-use-toggle"]',
        position: "top",
        action: null,
      },
      {
        id: "density",
        title: "Adjust Display Density",
        content:
          "Switch between Comfortable (more spacing) and Compact (more rooms visible) layouts depending on your preference.",
        target: '[data-tutorial="density-toggle"]',
        position: "top",
        action: null,
      },
      {
        id: "sort-by",
        title: "Sort Rooms",
        content:
          "Sort rooms alphabetically by name, by number of sessions, or by utilization percentage to find the most or least used classrooms.",
        target: '[data-tutorial="sort-by"]',
        position: "top",
        action: null,
      },
      {
        id: "stats-cards",
        title: "Utilization Statistics",
        content:
          "These cards show key metrics: total rooms displayed, number of class sessions, total teaching hours, and average utilization (based on a 9-hour day from 8AM-5PM).",
        target: '[data-tutorial="stats-cards"]',
        position: "top",
        action: null,
      },
      {
        id: "schedule-display",
        title: "Explore the Schedule",
        content:
          "Click on any class block to see course details including the instructor, meeting pattern, and room information. You can also click instructor names to view their contact card.",
        target: '[data-tutorial="schedule-display"]',
        position: "top",
        action: null,
      },
      {
        id: "complete",
        title: "You're Ready!",
        content:
          "You now know how to navigate Room Schedules. Use this tool to check room availability, analyze classroom usage, and find the best spaces for your needs.",
        target: null,
        position: "center",
        action: null,
      },
    ],
  },
  "people-directory": {
    id: "people-directory",
    title: "People Directory Tutorial",
    description:
      "Learn how to browse, search, and manage faculty, staff, and student workers in the directory.",
    estimatedTime: "3 min",
    category: "People Management",
    targetPage: "people/directory?tab=directory",
    steps: [
      {
        id: "welcome",
        title: "Welcome to People Directory",
        content:
          "This is your central hub for viewing and managing information about faculty, staff, adjuncts, and student workers in the department.",
        target: null,
        position: "center",
        action: null,
      },
      {
        id: "category-cards",
        title: "Quick Access Cards",
        content:
          "Click any of these cards to quickly jump to a specific category. The active category is highlighted with a green border.",
        target: '[data-tutorial="category-cards"]',
        position: "bottom",
        action: "Try clicking a different category card",
        actionType: "click",
      },
      {
        id: "directory-tabs",
        title: "Directory Tabs",
        content:
          "The tab bar provides another way to switch between categories. Both the cards above and these tabs stay in sync.",
        target: '[data-tutorial="directory-tabs"]',
        position: "bottom",
        action: null,
      },
      {
        id: "directory-content",
        title: "Directory Table",
        content:
          "This table displays all people in the selected category. Each row shows key information like name, email, phone, office, and job title. Click column headers to sort.",
        target: '[data-tutorial="directory-content"]',
        position: "top",
        action: null,
      },
      {
        id: "row-click",
        title: "View Contact Details",
        content:
          "Click any row to open a detailed contact card with full information, including weekly schedule for faculty members.",
        target: '[data-tutorial="directory-content"]',
        position: "top",
        action: null,
      },
      {
        id: "complete",
        title: "You're All Set!",
        content:
          "You now know how to navigate the People Directory. Use the category cards or tabs to switch views, and click any person to see their full details.",
        target: null,
        position: "center",
        action: null,
      },
    ],
  },
  "temperature-monitoring": {
    id: "temperature-monitoring",
    title: "Temperature Monitoring Tutorial",
    description:
      "Learn how to view temperature data, import sensor readings, and configure temperature settings for buildings.",
    estimatedTime: "4 min",
    category: "Facilities",
    targetPage: "facilities/temperature",
    steps: [
      {
        id: "welcome",
        title: "Welcome to Temperature Monitoring",
        content:
          "This tool helps you track room temperatures across buildings using Govee sensor data. You can view daily snapshots, analyze trends, import sensor readings, and configure ideal temperature ranges.",
        target: null,
        position: "center",
        action: null,
      },
      {
        id: "building-selector",
        title: "Select a Building",
        content:
          "Use the building selector to choose which building's temperature data you want to view. The selected building determines which rooms and sensors are displayed.",
        target: '[data-tutorial="building-selector"]',
        position: "bottom",
        action: null,
      },
      {
        id: "date-selector",
        title: "Choose a Date",
        content:
          "Select a date to view temperature snapshots for that day. The system captures readings at configured snapshot times (typically morning and afternoon).",
        target: '[data-tutorial="date-selector"]',
        position: "bottom",
        action: null,
      },
      {
        id: "snapshot-time",
        title: "Snapshot Time",
        content:
          "Choose which snapshot time to view. Buildings typically have two snapshot times: 8:30 AM and 4:30 PM. You can configure these in Settings.",
        target: '[data-tutorial="snapshot-time-selector"]',
        position: "bottom",
        action: null,
      },
      {
        id: "quick-stats",
        title: "Quick Stats Overview",
        content:
          "These cards show at-a-glance metrics: total rooms in the building, rooms with temperature data, coverage percentage, and the building's timezone.",
        target: '[data-tutorial="quick-stats"]',
        position: "bottom",
        action: null,
      },
      {
        id: "data-views",
        title: "Data View Modes",
        content:
          "Switch between different views: Floorplan shows temperatures on a building map, Daily shows a table of all rooms, Historical tracks data over time, and Trends displays charts and analytics.",
        target: '[data-tutorial="data-view-tabs"]',
        position: "bottom",
        action: "Try clicking a different view mode",
        actionType: "click",
      },
      {
        id: "action-tabs",
        title: "Admin Actions",
        content:
          "These buttons access administrative functions: Import to upload sensor data, Export to download temperature records, and Settings to configure temperature ranges and snapshot times.",
        target: '[data-tutorial="action-tabs"]',
        position: "bottom",
        action: null,
      },
      {
        id: "daily-table",
        title: "Daily Snapshot Table",
        content:
          "This table shows temperature readings for each room at the configured snapshot times. Color coding indicates temperature status: green for ideal range, blue for too cold, and red for too hot.",
        target: '[data-tutorial="daily-table"]',
        position: "top",
        action: null,
        requiresViewMode: "daily",
      },
      {
        id: "temperature-colors",
        title: "Temperature Color Coding",
        content:
          "Temperature readings are color-coded for quick scanning: Green means within the ideal range (typically 68-72°F), Blue means below ideal (too cold), Red means above ideal (too hot), and Gray means no data available.",
        target: null,
        position: "center",
        action: null,
      },
      {
        id: "import-section",
        title: "Importing Data",
        content:
          "The Import section lets you upload Govee CSV exports. Simply drag files here or click to browse. The system auto-maps devices to rooms based on device labels, and you can correct any mappings before importing.",
        target: '[data-tutorial="import-section"]',
        position: "top",
        action: null,
        requiresViewMode: "import",
      },
      {
        id: "settings-section",
        title: "Temperature Settings",
        content:
          "In Settings, you can configure the building timezone, set ideal temperature ranges (with optional overrides per space type), manage snapshot times, and recompute historical data if needed.",
        target: '[data-tutorial="settings-section"]',
        position: "top",
        action: null,
        requiresViewMode: "settings",
      },
      {
        id: "complete",
        title: "You're Ready!",
        content:
          "You now know how to use Temperature Monitoring. Start by selecting a building and date to view snapshots, use Import to add new sensor data, and configure ideal ranges in Settings.",
        target: null,
        position: "center",
        action: null,
      },
    ],
  },
  "add-student-worker": {
    id: "add-student-worker",
    title: "Add Student Worker Tutorial",
    description:
      "Hands-on tutorial: Create a test student worker (auto-deleted after).",
    estimatedTime: "5 min",
    category: "People Management",
    targetPage: "people/directory?tab=student",
    isInteractive: true, // Flag for interactive mode
    steps: [
      {
        id: "welcome",
        title: "Interactive Tutorial",
        content:
          "In this hands-on tutorial, you'll create a REAL test student worker to practice the workflow. Don't worry - the test data will be automatically deleted when the tutorial ends. Look for the [TUTORIAL] prefix to identify test records.",
        target: null,
        position: "center",
        action: null,
      },
      {
        id: "student-tab",
        title: "Student Workers Tab",
        content:
          "Make sure you're on the Student Workers tab. Click it now if you're not already there.",
        target: '[data-tutorial="student-workers-card"]',
        position: "bottom",
        action: "Click to select Student Workers tab",
        actionType: "click",
      },
      {
        id: "add-button",
        title: "Open the Add Student Wizard",
        content:
          "Click the 'Add Student' button to open the wizard. We'll create a test student named '[TUTORIAL] Test Student'.",
        target: '[data-tutorial="add-student-btn"]',
        position: "bottom",
        action: "Click to open the Add Student wizard",
        actionType: "click",
      },
      {
        id: "wizard-overview",
        title: "The Student Worker Wizard",
        content:
          "You're now in the 4-step wizard. Notice the stepper at the top showing: Basic Info → Employment → Jobs → Review. The name field has been pre-filled with '[TUTORIAL] Test Student'.",
        target: '[data-tutorial="wizard-stepper"]',
        position: "bottom",
        action: null,
      },
      {
        id: "basic-info-enter",
        title: "Enter Basic Information",
        content:
          "Fill in the form: The name '[TUTORIAL] Test Student' should already be entered. Add an email like 'tutorial.test@example.edu'. You can check 'No Phone' to skip the phone field.",
        target: '[data-tutorial="basic-info-form"]',
        position: "right",
        action: "Enter the required name and email",
        actionType: "input",
        validationTarget: '[data-tutorial="basic-info-form"] input[type="text"]',
      },
      {
        id: "basic-info-next",
        title: "Continue to Employment",
        content:
          "Great! Now click the 'Next' button at the bottom to proceed to the Employment step.",
        target: '[data-tutorial="wizard-navigation"]',
        position: "top",
        action: "Click Next to continue",
        actionType: "click",
      },
      {
        id: "employment-dates",
        title: "Set Employment Dates",
        content:
          "Set a Start Date (today is fine). The End Date is optional - leave it blank for ongoing employment. Make sure 'Active Student Worker' is checked.",
        target: '[data-tutorial="employment-form"]',
        position: "right",
        action: null,
      },
      {
        id: "employment-next",
        title: "Continue to Jobs",
        content:
          "Click 'Next' to proceed to the Job Assignments step. This is where you'll define what work the student does.",
        target: '[data-tutorial="wizard-navigation"]',
        position: "top",
        action: "Click Next to continue",
        actionType: "click",
      },
      {
        id: "jobs-intro",
        title: "Job Assignments",
        content:
          "Each student needs at least one job assignment. A job includes: title, supervisor, pay rate, schedule, and work locations. Let's add one now.",
        target: '[data-tutorial="jobs-section"]',
        position: "top",
        action: null,
      },
      {
        id: "add-job",
        title: "Add a Job Assignment",
        content:
          "Click the 'Add Job Assignment' button to create a new job entry for this student.",
        target: '[data-tutorial="add-job-btn"]',
        position: "top",
        action: "Click to add a job assignment",
        actionType: "click",
      },
      {
        id: "job-title",
        title: "Enter Job Details",
        content:
          "Enter a job title like 'Tutorial Example Job'. Select any supervisor from the dropdown. Set an hourly rate (e.g., $12.50).",
        target: '[data-tutorial="job-form"]',
        position: "left",
        action: "Fill in job title and rate",
        actionType: "input",
      },
      {
        id: "schedule-builder",
        title: "Set the Weekly Schedule",
        content:
          "Use the visual schedule builder to set work hours. Click on a day (like Monday) and set a time range (e.g., 9:00 AM - 11:00 AM). Add at least one shift.",
        target: '[data-tutorial="schedule-builder"]',
        position: "top",
        action: "Add at least one work shift",
        actionType: "click",
      },
      {
        id: "save-job",
        title: "Save the Job Assignment",
        content:
          "Click 'Save Job' to save this job assignment, then click 'Next' to proceed to the review step.",
        target: '[data-tutorial="job-form"]',
        position: "top",
        action: "Save the job and click Next",
        actionType: "click",
      },
      {
        id: "review-step",
        title: "Review Your Entry",
        content:
          "Review all the information you entered. You'll see the student info, employment period, and job assignments summarized here. Make sure it shows '[TUTORIAL] Test Student'.",
        target: '[data-tutorial="review-section"]',
        position: "top",
        action: null,
      },
      {
        id: "save-student",
        title: "Save the Test Student",
        content:
          "Click 'Save Student' to create the test record. After saving, the tutorial will automatically delete this test student when you finish or exit.",
        target: '[data-tutorial="save-student-btn"]',
        position: "top",
        action: "Click Save Student to create the record",
        actionType: "click",
      },
      {
        id: "complete",
        title: "Tutorial Complete! 🎉",
        content:
          "Excellent work! You've learned how to add a student worker. The test student '[TUTORIAL] Test Student' will be automatically deleted now. In real use, you would enter actual student information following these same steps.",
        target: null,
        position: "center",
        action: null,
      },
    ],
  },
};

// Help hints that appear throughout the app
export const HELP_HINTS = {
  "email-lists-adjunct": {
    id: "email-lists-adjunct",
    title: "About Adjuncts",
    content:
      'Adjunct faculty are part-time instructors. They are hidden by default because most communications are for full-time faculty. Uncheck "Exclude Adjuncts" to include them.',
    learnMoreTutorial: "email-lists",
  },
  "email-lists-presets": {
    id: "email-lists-presets",
    title: "Email List Presets",
    content:
      "Presets save your selected people (not filters). When you load a preset, it restores your exact selection regardless of current filters.",
    learnMoreTutorial: "email-lists",
  },
  "email-lists-courses": {
    id: "email-lists-courses",
    title: "Course Count Filter",
    content:
      'The "Only show faculty with at least 1 course" filter helps identify active instructors for the current semester.',
    learnMoreTutorial: "email-lists",
  },
};

export const TutorialProvider = ({ children }) => {
  // Active tutorial state
  const [activeTutorial, setActiveTutorial] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [actionCompleted, setActionCompleted] = useState(false);

  // Tutorial-created data tracking (for cleanup)
  const [tutorialStudentId, setTutorialStudentId] = useState(null);
  const cleanupCallbackRef = useRef(null);

  // User preferences
  const [showTooltips, setShowTooltips] = useState(() => {
    try {
      const saved = localStorage.getItem("tutorialShowTooltips");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  // Track completed tutorials
  const [completedTutorials, setCompletedTutorials] = useState(() => {
    try {
      const saved = localStorage.getItem("completedTutorials");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Track dismissed hints
  const [dismissedHints, setDismissedHints] = useState(() => {
    try {
      const saved = localStorage.getItem("dismissedHints");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persist preferences
  useEffect(() => {
    localStorage.setItem("tutorialShowTooltips", JSON.stringify(showTooltips));
  }, [showTooltips]);

  useEffect(() => {
    localStorage.setItem(
      "completedTutorials",
      JSON.stringify(completedTutorials),
    );
  }, [completedTutorials]);

  useEffect(() => {
    localStorage.setItem("dismissedHints", JSON.stringify(dismissedHints));
  }, [dismissedHints]);

  // Start a tutorial
  const startTutorial = useCallback((tutorialId) => {
    const tutorial = TUTORIALS[tutorialId];
    if (tutorial) {
      setActiveTutorial(tutorial);
      setCurrentStepIndex(0);
      setIsPaused(false);
      setActionCompleted(false);
    }
  }, []);

  // End/exit tutorial
  const endTutorial = useCallback(
    async (markComplete = false) => {
      // Run cleanup callback if registered (e.g., delete tutorial student)
      if (cleanupCallbackRef.current && tutorialStudentId) {
        try {
          await cleanupCallbackRef.current(tutorialStudentId);
        } catch (error) {
          console.error("Tutorial cleanup failed:", error);
        }
      }

      if (markComplete && activeTutorial) {
        setCompletedTutorials((prev) =>
          prev.includes(activeTutorial.id)
            ? prev
            : [...prev, activeTutorial.id],
        );
      }
      setActiveTutorial(null);
      setCurrentStepIndex(0);
      setIsPaused(false);
      setActionCompleted(false);
      setTutorialStudentId(null);
      cleanupCallbackRef.current = null;
    },
    [activeTutorial, tutorialStudentId],
  );

  // Navigate tutorial steps
  const nextStep = useCallback(() => {
    const currentStep = activeTutorial?.steps[currentStepIndex];
    // Block if action is required but not completed
    if (currentStep?.action && !actionCompleted) {
      return;
    }
    if (activeTutorial && currentStepIndex < activeTutorial.steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
      setActionCompleted(false); // Reset for next step
    } else if (activeTutorial) {
      endTutorial(true);
    }
  }, [activeTutorial, currentStepIndex, actionCompleted, endTutorial]);

  // Mark current action as completed
  const markActionCompleted = useCallback(() => {
    setActionCompleted(true);
  }, []);

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [currentStepIndex]);

  const goToStep = useCallback(
    (stepIndex) => {
      if (
        activeTutorial &&
        stepIndex >= 0 &&
        stepIndex < activeTutorial.steps.length
      ) {
        setCurrentStepIndex(stepIndex);
      }
    },
    [activeTutorial],
  );

  // Pause/resume tutorial
  const pauseTutorial = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resumeTutorial = useCallback(() => {
    setIsPaused(false);
  }, []);

  // Hint management
  const dismissHint = useCallback((hintId) => {
    setDismissedHints((prev) =>
      prev.includes(hintId) ? prev : [...prev, hintId],
    );
  }, []);

  const isHintDismissed = useCallback(
    (hintId) => {
      return dismissedHints.includes(hintId);
    },
    [dismissedHints],
  );

  const resetHints = useCallback(() => {
    setDismissedHints([]);
  }, []);

  // Check if tutorial is completed
  const isTutorialCompleted = useCallback(
    (tutorialId) => {
      return completedTutorials.includes(tutorialId);
    },
    [completedTutorials],
  );

  // Reset all progress
  const resetAllProgress = useCallback(() => {
    setCompletedTutorials([]);
    setDismissedHints([]);
    setActiveTutorial(null);
    setCurrentStepIndex(0);
    setTutorialStudentId(null);
    cleanupCallbackRef.current = null;
  }, []);

  // Register cleanup callback for tutorial-created data
  const registerCleanupCallback = useCallback((callback) => {
    cleanupCallbackRef.current = callback;
  }, []);

  // Check if currently in tutorial mode for add-student-worker tutorial
  const isTutorialMode = useMemo(() => {
    return activeTutorial?.id === "add-student-worker";
  }, [activeTutorial]);

  // Current step helper
  const currentStep = useMemo(() => {
    if (activeTutorial && activeTutorial.steps[currentStepIndex]) {
      return activeTutorial.steps[currentStepIndex];
    }
    return null;
  }, [activeTutorial, currentStepIndex]);

  // Progress percentage
  const progress = useMemo(() => {
    if (!activeTutorial) return 0;
    return ((currentStepIndex + 1) / activeTutorial.steps.length) * 100;
  }, [activeTutorial, currentStepIndex]);

  const value = useMemo(
    () => ({
      // Tutorial state
      activeTutorial,
      currentStepIndex,
      currentStep,
      isPaused,
      progress,
      actionCompleted,

      // Tutorial actions
      startTutorial,
      endTutorial,
      nextStep,
      prevStep,
      goToStep,
      pauseTutorial,
      resumeTutorial,
      markActionCompleted,

      // Completion tracking
      completedTutorials,
      isTutorialCompleted,

      // Tooltip preferences
      showTooltips,
      setShowTooltips,

      // Hint management
      dismissedHints,
      dismissHint,
      isHintDismissed,
      resetHints,

      // Reset
      resetAllProgress,

      // Tutorial student management (for interactive tutorials)
      tutorialStudentId,
      setTutorialStudentId,
      registerCleanupCallback,
      isTutorialMode,

      // Static data
      tutorials: TUTORIALS,
      hints: HELP_HINTS,
    }),
    [
      activeTutorial,
      currentStepIndex,
      currentStep,
      isPaused,
      progress,
      actionCompleted,
      startTutorial,
      endTutorial,
      nextStep,
      prevStep,
      goToStep,
      pauseTutorial,
      resumeTutorial,
      markActionCompleted,
      completedTutorials,
      isTutorialCompleted,
      showTooltips,
      dismissedHints,
      dismissHint,
      isHintDismissed,
      resetHints,
      resetAllProgress,
      tutorialStudentId,
      setTutorialStudentId,
      registerCleanupCallback,
      isTutorialMode,
    ],
  );

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
};

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error("useTutorial must be used within a TutorialProvider");
  }
  return context;
};

export default TutorialContext;
