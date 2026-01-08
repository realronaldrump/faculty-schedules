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

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';

const TutorialContext = createContext(null);

// Tutorial definitions - each tutorial has steps with targets and content
export const TUTORIALS = {
  'email-lists': {
    id: 'email-lists',
    title: 'Email Lists Tutorial',
    description: 'Learn how to filter, select, and export email lists for faculty and staff.',
    estimatedTime: '5 min',
    category: 'People Management',
    targetPage: 'people/email-lists',
    steps: [
      {
        id: 'welcome',
        title: 'Welcome to Email Lists',
        content: 'This tool helps you create customized email lists for faculty, staff, and student workers. You can filter by department, role, building, and more.',
        target: null, // No specific element - intro step
        position: 'center',
        action: null
      },
      {
        id: 'tabs',
        title: 'Choose Your Audience',
        content: 'Use these tabs to switch between Faculty & Staff or Student Workers. Each tab has its own filters and selection.',
        target: '[data-tutorial="audience-tabs"]',
        position: 'bottom',
        action: null
      },
      {
        id: 'search',
        title: 'Search for People',
        content: 'Use the search bar to quickly find specific people by name, email, job title, or office location.',
        target: '[data-tutorial="search-input"]',
        position: 'bottom',
        action: 'Try typing a name in the search box',
        actionType: 'type'
      },
      {
        id: 'presets',
        title: 'Use Saved Presets',
        content: 'Load previously saved email lists from the preset dropdown. This is perfect for recurring communications to the same group.',
        target: '[data-tutorial="preset-dropdown"]',
        position: 'bottom',
        action: null
      },
      {
        id: 'adjunct-filter',
        title: 'Quick Adjunct Filter',
        content: 'By default, adjunct faculty are hidden. Use this checkbox to quickly include or exclude them from your list.',
        target: '[data-tutorial="adjunct-checkbox"]',
        position: 'bottom',
        action: null
      },
      {
        id: 'advanced-filters',
        title: 'Advanced Filters',
        content: 'Click here to access powerful filtering options including programs, job titles, buildings, tenure status, and more.',
        target: '[data-tutorial="advanced-filters-btn"]',
        position: 'bottom',
        action: 'Click to expand the advanced filters panel',
        actionType: 'click'
      },
      {
        id: 'filter-programs',
        title: 'Filter by Program',
        content: 'Include or exclude specific academic programs. Use "Include Programs" to show only certain programs, or "Exclude Programs" to hide them.',
        target: '[data-tutorial="program-filters"]',
        position: 'bottom',
        action: null,
        requiresExpanded: 'advanced-filters'
      },
      {
        id: 'select-people',
        title: 'Select People',
        content: 'Click the checkbox next to each person to select them, or use "Select All" to select everyone in the filtered list.',
        target: '[data-tutorial="select-all-checkbox"]',
        position: 'top',
        action: 'Try selecting a few people from the list',
        actionType: 'click'
      },
      {
        id: 'export-options',
        title: 'Export Your List',
        content: 'Once you have selected people, use these buttons to copy emails to clipboard or download a CSV file with all contact details.',
        target: '[data-tutorial="export-buttons"]',
        position: 'top',
        action: null
      },
      {
        id: 'outlook-version',
        title: 'Outlook Compatibility',
        content: 'Choose between "New" (comma-separated) or "Old" (semicolon-separated) Outlook format depending on your email client version.',
        target: '[data-tutorial="outlook-version"]',
        position: 'left',
        action: null
      },
      {
        id: 'save-preset',
        title: 'Save for Later',
        content: 'After selecting people, click "Save Preset" to save this list for future use. Give it a memorable name like "All Faculty" or "Remote Staff".',
        target: '[data-tutorial="save-preset-btn"]',
        position: 'bottom',
        action: null
      },
      {
        id: 'complete',
        title: 'You\'re All Set!',
        content: 'You now know how to create and manage email lists. Remember: filter first, then select, then export. Happy emailing!',
        target: null,
        position: 'center',
        action: null
      }
    ]
  },
  'room-schedules': {
    id: 'room-schedules',
    title: 'Room Schedules Tutorial',
    description: 'Learn how to view classroom usage, filter by building and room, switch between view modes, and understand utilization statistics.',
    estimatedTime: '4 min',
    category: 'Scheduling',
    targetPage: 'scheduling/room-schedules',
    steps: [
      {
        id: 'welcome',
        title: 'Welcome to Room Schedules',
        content: 'This tool helps you visualize classroom usage across the department. You can see which rooms are occupied, find available spaces, and analyze utilization patterns.',
        target: null,
        position: 'center',
        action: null
      },
      {
        id: 'day-selector',
        title: 'Select a Day',
        content: 'Use these buttons to switch between weekdays. The schedule will update to show classes for the selected day.',
        target: '[data-tutorial="day-selector"]',
        position: 'bottom',
        action: 'Try clicking a different day to see how the schedule changes',
        actionType: 'click'
      },
      {
        id: 'room-search',
        title: 'Search for Rooms',
        content: 'Type a room number or partial name to quickly filter the room list. This is helpful when you\'re looking for a specific classroom.',
        target: '[data-tutorial="room-search"]',
        position: 'bottom',
        action: null
      },
      {
        id: 'building-filter',
        title: 'Filter by Building',
        content: 'Use this dropdown to show only rooms in a specific building. Great for focusing on classrooms in your area.',
        target: '[data-tutorial="building-filter"]',
        position: 'bottom',
        action: null
      },
      {
        id: 'room-selector',
        title: 'Select a Specific Room',
        content: 'Choose a single room to view its complete schedule. This isolates one room for detailed viewing.',
        target: '[data-tutorial="room-selector"]',
        position: 'bottom',
        action: null
      },
      {
        id: 'view-mode',
        title: 'Choose Your View',
        content: 'Switch between different visualizations: Timeline shows a Gantt-style chart, List shows detailed cards, Week shows the full week, and Calendar shows a monthly view.',
        target: '[data-tutorial="view-mode-toggle"]',
        position: 'bottom',
        action: 'Try switching to a different view mode',
        actionType: 'click'
      },
      {
        id: 'only-in-use',
        title: 'Filter Active Rooms',
        content: 'Toggle this on to hide rooms with no scheduled classes. This helps you focus on rooms that are actively being used for classes.',
        target: '[data-tutorial="only-in-use-toggle"]',
        position: 'top',
        action: null
      },
      {
        id: 'density',
        title: 'Adjust Display Density',
        content: 'Switch between Comfortable (more spacing) and Compact (more rooms visible) layouts depending on your preference.',
        target: '[data-tutorial="density-toggle"]',
        position: 'top',
        action: null
      },
      {
        id: 'sort-by',
        title: 'Sort Rooms',
        content: 'Sort rooms alphabetically by name, by number of sessions, or by utilization percentage to find the most or least used classrooms.',
        target: '[data-tutorial="sort-by"]',
        position: 'top',
        action: null
      },
      {
        id: 'stats-cards',
        title: 'Utilization Statistics',
        content: 'These cards show key metrics: total rooms displayed, number of class sessions, total teaching hours, and average utilization (based on a 9-hour day from 8AM-5PM).',
        target: '[data-tutorial="stats-cards"]',
        position: 'top',
        action: null
      },
      {
        id: 'schedule-display',
        title: 'Explore the Schedule',
        content: 'Click on any class block to see course details including the instructor, meeting pattern, and room information. You can also click instructor names to view their contact card.',
        target: '[data-tutorial="schedule-display"]',
        position: 'top',
        action: null
      },
      {
        id: 'complete',
        title: 'You\'re Ready!',
        content: 'You now know how to navigate Room Schedules. Use this tool to check room availability, analyze classroom usage, and find the best spaces for your needs.',
        target: null,
        position: 'center',
        action: null
      }
    ]
  }
};

// Help hints that appear throughout the app
export const HELP_HINTS = {
  'email-lists-adjunct': {
    id: 'email-lists-adjunct',
    title: 'About Adjuncts',
    content: 'Adjunct faculty are part-time instructors. They are hidden by default because most communications are for full-time faculty. Uncheck "Exclude Adjuncts" to include them.',
    learnMoreTutorial: 'email-lists'
  },
  'email-lists-presets': {
    id: 'email-lists-presets',
    title: 'Email List Presets',
    content: 'Presets save your selected people (not filters). When you load a preset, it restores your exact selection regardless of current filters.',
    learnMoreTutorial: 'email-lists'
  },
  'email-lists-courses': {
    id: 'email-lists-courses',
    title: 'Course Count Filter',
    content: 'The "Only show faculty with at least 1 course" filter helps identify active instructors for the current semester.',
    learnMoreTutorial: 'email-lists'
  }
};

export const TutorialProvider = ({ children }) => {
  // Active tutorial state
  const [activeTutorial, setActiveTutorial] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [actionCompleted, setActionCompleted] = useState(false);

  // User preferences
  const [showTooltips, setShowTooltips] = useState(() => {
    try {
      const saved = localStorage.getItem('tutorialShowTooltips');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  // Track completed tutorials
  const [completedTutorials, setCompletedTutorials] = useState(() => {
    try {
      const saved = localStorage.getItem('completedTutorials');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Track dismissed hints
  const [dismissedHints, setDismissedHints] = useState(() => {
    try {
      const saved = localStorage.getItem('dismissedHints');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persist preferences
  useEffect(() => {
    localStorage.setItem('tutorialShowTooltips', JSON.stringify(showTooltips));
  }, [showTooltips]);

  useEffect(() => {
    localStorage.setItem('completedTutorials', JSON.stringify(completedTutorials));
  }, [completedTutorials]);

  useEffect(() => {
    localStorage.setItem('dismissedHints', JSON.stringify(dismissedHints));
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
  const endTutorial = useCallback((markComplete = false) => {
    if (markComplete && activeTutorial) {
      setCompletedTutorials(prev =>
        prev.includes(activeTutorial.id) ? prev : [...prev, activeTutorial.id]
      );
    }
    setActiveTutorial(null);
    setCurrentStepIndex(0);
    setIsPaused(false);
    setActionCompleted(false);
  }, [activeTutorial]);

  // Navigate tutorial steps
  const nextStep = useCallback(() => {
    const currentStep = activeTutorial?.steps[currentStepIndex];
    // Block if action is required but not completed
    if (currentStep?.action && !actionCompleted) {
      return;
    }
    if (activeTutorial && currentStepIndex < activeTutorial.steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
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
      setCurrentStepIndex(prev => prev - 1);
    }
  }, [currentStepIndex]);

  const goToStep = useCallback((stepIndex) => {
    if (activeTutorial && stepIndex >= 0 && stepIndex < activeTutorial.steps.length) {
      setCurrentStepIndex(stepIndex);
    }
  }, [activeTutorial]);

  // Pause/resume tutorial
  const pauseTutorial = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resumeTutorial = useCallback(() => {
    setIsPaused(false);
  }, []);

  // Hint management
  const dismissHint = useCallback((hintId) => {
    setDismissedHints(prev =>
      prev.includes(hintId) ? prev : [...prev, hintId]
    );
  }, []);

  const isHintDismissed = useCallback((hintId) => {
    return dismissedHints.includes(hintId);
  }, [dismissedHints]);

  const resetHints = useCallback(() => {
    setDismissedHints([]);
  }, []);

  // Check if tutorial is completed
  const isTutorialCompleted = useCallback((tutorialId) => {
    return completedTutorials.includes(tutorialId);
  }, [completedTutorials]);

  // Reset all progress
  const resetAllProgress = useCallback(() => {
    setCompletedTutorials([]);
    setDismissedHints([]);
    setActiveTutorial(null);
    setCurrentStepIndex(0);
  }, []);

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

  const value = useMemo(() => ({
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

    // Static data
    tutorials: TUTORIALS,
    hints: HELP_HINTS
  }), [
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
    resetAllProgress
  ]);

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
};

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
};

export default TutorialContext;
