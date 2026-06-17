/**
 * TutorialPage - Main tutorials and help center page
 *
 * Displays available tutorials, tracks completion progress,
 * and provides access to help resources.
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Play, CheckCircle, Clock, RotateCcw, Lightbulb, Settings, Users, Calendar, Building, BarChart3, Database, Eye, EyeOff, Trophy } from "lucide-react";
import { useTutorial, TUTORIALS } from "../../contexts/TutorialContext";
import ConfirmDialog from "../shared/ConfirmDialog";

// Category icons mapping
const categoryIcons = {
  "Getting Started": Lightbulb,
  "People Management": Users,
  Scheduling: Calendar,
  Analytics: BarChart3,
  Administration: Settings,
  Resources: Building,
  "Data Management": Database,
  Facilities: Building,
};

// Tutorial card component
const TutorialCard = ({ tutorial, isCompleted, progress, onStart }) => {
  const CategoryIcon = categoryIcons[tutorial.category] || BookOpen;

  const totalSteps = tutorial.steps.length;
  const isInProgress = !isCompleted && progress?.status === "started";
  const resumeStep = isInProgress
    ? Math.min(Math.max(0, progress.currentStepIndex || 0), totalSteps - 1)
    : 0;
  const completedSteps = isInProgress ? resumeStep : 0;
  const percent = isInProgress
    ? Math.round((completedSteps / totalSteps) * 100)
    : 0;

  return (
    <div
      className={`bg-white rounded-xl border-2 transition-all duration-200 hover:shadow-lg ${
        isCompleted
          ? "border-green-200 bg-green-50/30"
          : isInProgress
            ? "border-baylor-gold/50 bg-baylor-gold/5"
            : "border-gray-200 hover:border-baylor-green/50"
      }`}
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div
            className={`p-3 rounded-lg ${isCompleted ? "bg-green-100" : "bg-baylor-green/10"}`}
          >
            <CategoryIcon
              className={`w-6 h-6 ${isCompleted ? "text-green-600" : "text-baylor-green"}`}
            />
          </div>
          {isCompleted ? (
            <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
              <CheckCircle className="w-4 h-4" />
              Completed
            </div>
          ) : isInProgress ? (
            <div className="flex items-center gap-1 text-amber-600 text-sm font-medium">
              <Clock className="w-4 h-4" />
              In progress
            </div>
          ) : null}
        </div>

        {/* Content */}
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {tutorial.title}
        </h3>
        <p className="text-gray-600 text-sm mb-4 line-clamp-2">
          {tutorial.description}
        </p>

        {/* Meta */}
        <div className="flex items-center gap-4 text-sm text-gray-500 mb-6">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {tutorial.estimatedTime}
          </div>
          <div className="flex items-center gap-1">
            <BookOpen className="w-4 h-4" />
            {totalSteps} steps
          </div>
        </div>

        {/* In-progress bar */}
        {isInProgress && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>
                Step {resumeStep + 1} of {totalSteps}
              </span>
              <span>{percent}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-baylor-gold transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Action button */}
        <button
          onClick={() => onStart(tutorial.id, isInProgress ? resumeStep : 0)}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
            isCompleted
              ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
              : "bg-baylor-green text-white hover:bg-baylor-green/90"
          }`}
        >
          <Play className="w-4 h-4" />
          {isCompleted
            ? "Review Tutorial"
            : isInProgress
              ? `Resume · Step ${resumeStep + 1} of ${totalSteps}`
              : "Start Tutorial"}
        </button>
      </div>
    </div>
  );
};

const TutorialPage = () => {
  const navigate = useNavigate();
  const {
    startTutorial,
    isTutorialCompleted,
    completedTutorials,
    tutorialProgressById,
    showTooltips,
    setShowTooltips,
    resetAllProgress,
  } = useTutorial();

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(null);

  // Category display order
  const categoryOrder = [
    "Getting Started",
    "Scheduling",
    "People Management",
    "Facilities",
    "Administration",
    "Analytics",
    "Resources",
    "Data Management",
  ];

  // Get all tutorials as array, sorted by category priority then title
  const tutorialList = Object.values(TUTORIALS).sort((a, b) => {
    const ai = categoryOrder.indexOf(a.category);
    const bi = categoryOrder.indexOf(b.category);
    const categoryDiff = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    if (categoryDiff !== 0) return categoryDiff;
    return a.title.localeCompare(b.title);
  });

  // Progress stats
  const completionRate =
    tutorialList.length > 0
      ? Math.round((completedTutorials.length / tutorialList.length) * 100)
      : 0;

  // Close settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setShowSettings(false);
      }
    };
    if (showSettings) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSettings]);

  // Handle starting (or resuming) a tutorial
  const handleStartTutorial = (tutorialId, startStepIndex = 0) => {
    const tutorial = TUTORIALS[tutorialId];
    if (tutorial) {
      navigate(`/${tutorial.targetPage}`);
      setTimeout(() => {
        startTutorial(tutorialId, startStepIndex);
      }, 500);
    }
  };

  // Handle reset
  const handleReset = () => {
    resetAllProgress();
    setShowResetConfirm(false);
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-baylor-green" />
            Help & Tutorials
          </h1>
          <p className="text-gray-600 mt-1">
            Learn how to use the dashboard with interactive step-by-step tutorials
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Progress ring */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm text-gray-500">Your Progress</div>
              <div className="text-2xl font-bold text-baylor-green">
                {completionRate}%
              </div>
            </div>
            <div className="w-16 h-16 relative">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  stroke="#e5e7eb"
                  strokeWidth="8"
                  fill="none"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  stroke="#154734"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${completionRate * 1.76} 176`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                {completionRate === 100 ? (
                  <Trophy className="w-5 h-5 text-baylor-green" />
                ) : (
                  <span className="text-xs font-semibold text-gray-500">
                    {completedTutorials.length}/{tutorialList.length}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Settings gear */}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setShowSettings((s) => !s)}
              className={`p-2 rounded-lg border transition-colors ${
                showSettings
                  ? "bg-gray-100 border-gray-300 text-gray-800"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}
              aria-label="Tutorial settings"
            >
              <Settings className="w-5 h-5" />
            </button>

            {showSettings && (
              <div className="app-dropdown-menu absolute right-0 z-10 mt-2 w-64">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Tutorial Settings</p>
                </div>
                <div className="p-4 space-y-3">
                  {/* Tooltip toggle */}
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-gray-700 flex items-center gap-1.5">
                      {showTooltips ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                      Show Tooltips & Hints
                    </span>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={showTooltips}
                        onChange={(e) => setShowTooltips(e.target.checked)}
                        className="sr-only"
                      />
                      <div
                        className={`w-11 h-6 rounded-full transition-colors ${showTooltips ? "bg-baylor-green" : "bg-gray-300"}`}
                      >
                        <div
                          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${showTooltips ? "translate-x-5" : ""}`}
                        />
                      </div>
                    </div>
                  </label>

                  <div className="border-t border-gray-100 pt-3">
                    <button
                      onClick={() => {
                        setShowSettings(false);
                        setShowResetConfirm(true);
                      }}
                      className="app-dropdown-option flex items-center gap-2 text-red-600 hover:bg-red-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Reset Progress
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tutorials Grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-baylor-green" />
          Available Tutorials
          <span className="text-sm font-normal text-gray-500">
            ({tutorialList.length}{" "}
            {tutorialList.length === 1 ? "tutorial" : "tutorials"})
          </span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tutorialList.map((tutorial) => (
            <TutorialCard
              key={tutorial.id}
              tutorial={tutorial}
              isCompleted={isTutorialCompleted(tutorial.id)}
              progress={tutorialProgressById[tutorial.id]}
              onStart={handleStartTutorial}
            />
          ))}
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Reset Tutorial Progress"
        message={
          <>
            This will reset all your tutorial completion progress and dismissed
            hints. You'll be able to go through the tutorials again from the
            beginning.
            <span className="mt-2 block text-sm text-gray-500">
              This action cannot be undone.
            </span>
          </>
        }
        confirmText="Reset Progress"
        variant="danger"
        icon={RotateCcw}
        onConfirm={handleReset}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
};

export default TutorialPage;
