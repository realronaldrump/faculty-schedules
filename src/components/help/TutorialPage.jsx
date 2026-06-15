/**
 * TutorialPage - Main tutorials and help center page
 *
 * Displays available tutorials, tracks completion progress,
 * and provides access to help resources.
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Play, CheckCircle, Clock, RotateCcw, Lightbulb, Settings, Users, Calendar, Building, BarChart3, Database, Eye, EyeOff } from "lucide-react";
import { useTutorial, TUTORIALS } from "../../contexts/TutorialContext";

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
const TutorialCard = ({ tutorial, isCompleted, onStart }) => {
  const CategoryIcon = categoryIcons[tutorial.category] || BookOpen;

  return (
    <div
      className={`bg-white rounded-xl border-2 transition-all duration-200 hover:shadow-lg ${
        isCompleted
          ? "border-green-200 bg-green-50/30"
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
          {isCompleted && (
            <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
              <CheckCircle className="w-4 h-4" />
              Completed
            </div>
          )}
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
            {tutorial.steps.length} steps
          </div>
        </div>

        {/* Action button */}
        <button
          onClick={() => onStart(tutorial.id)}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
            isCompleted
              ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
              : "bg-baylor-green text-white hover:bg-baylor-green/90"
          }`}
        >
          <Play className="w-4 h-4" />
          {isCompleted ? "Review Tutorial" : "Start Tutorial"}
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
    showTooltips,
    setShowTooltips,
    resetAllProgress,
  } = useTutorial();

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(null);

  // Get all tutorials as array
  const tutorialList = Object.values(TUTORIALS);

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

  // Handle starting a tutorial
  const handleStartTutorial = (tutorialId) => {
    const tutorial = TUTORIALS[tutorialId];
    if (tutorial) {
      navigate(`/${tutorial.targetPage}`);
      setTimeout(() => {
        startTutorial(tutorialId);
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
          {/* Progress badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-baylor-green/10 text-baylor-green rounded-full text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            {completedTutorials.length} / {tutorialList.length} completed
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
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl border border-gray-200 shadow-lg z-10 overflow-hidden">
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
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
              onStart={handleStartTutorial}
            />
          ))}
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Reset Tutorial Progress
              </h3>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">
                This will reset all your tutorial completion progress and
                dismissed hints. You'll be able to go through the tutorials
                again from the beginning.
              </p>
              <p className="text-sm text-gray-500">
                This action cannot be undone.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Reset Progress
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TutorialPage;
