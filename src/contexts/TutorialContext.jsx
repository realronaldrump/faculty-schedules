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
