/**
 * TutorialPage - Main tutorials and help center page
 *
 * Displays available tutorials, tracks completion progress,
 * and provides access to help resources.
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Play,
  CheckCircle,
  Clock,
  ChevronRight,
  Search,
  Filter,
  RotateCcw,
  HelpCircle,
  Lightbulb,
  Settings,
  Users,
  Mail,
  Calendar,
  Building,
  BarChart3,
  Database,
  Eye,
  EyeOff,
} from "lucide-react";
import { useTutorial, TUTORIALS } from "../../contexts/TutorialContext";

// Category icons mapping
const categoryIcons = {
  "People Management": Users,
  Scheduling: Calendar,
  Analytics: BarChart3,
  Administration: Settings,
  Resources: Building,
  "Data Management": Database,
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
        <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {tutorial.estimatedTime}
          </div>
          <div className="flex items-center gap-1">
            <BookOpen className="w-4 h-4" />
            {tutorial.steps.length} steps
          </div>
        </div>

        {/* Category badge */}
        <div className="mb-4">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            {tutorial.category}
          </span>
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

// Quick tip card
const QuickTipCard = ({ icon: Icon, title, description }) => (
  <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
    <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
      <Icon className="w-5 h-5 text-amber-600" />
    </div>
    <div>
      <h4 className="font-medium text-gray-900 mb-1">{title}</h4>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  </div>
);

const TutorialPage = () => {
  const navigate = useNavigate();
  const {
    startTutorial,
    isTutorialCompleted,
    completedTutorials,
    showTooltips,
    setShowTooltips,
    resetAllProgress,
    resetHints,
  } = useTutorial();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Get all tutorials as array
  const tutorialList = Object.values(TUTORIALS);

  // Get unique categories
  const categories = ["all", ...new Set(tutorialList.map((t) => t.category))];

  // Filter tutorials
  const filteredTutorials = tutorialList.filter((tutorial) => {
    const matchesSearch =
      tutorial.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tutorial.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || tutorial.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Progress stats
  const completionRate =
    tutorialList.length > 0
      ? Math.round((completedTutorials.length / tutorialList.length) * 100)
      : 0;

  // Handle starting a tutorial
  const handleStartTutorial = (tutorialId) => {
    const tutorial = TUTORIALS[tutorialId];
    if (tutorial) {
      // Navigate to the target page first
      navigate(`/${tutorial.targetPage}`);
      // Start the tutorial after a brief delay to allow page to load
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-baylor-green" />
            Help & Tutorials
          </h1>
          <p className="text-gray-600 mt-1">
            Learn how to use the HSD Dashboard with interactive step-by-step
            tutorials
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-4">
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
              <CheckCircle
                className={`w-6 h-6 ${completionRate === 100 ? "text-baylor-green" : "text-gray-300"}`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Tooltip toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
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
              <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                {showTooltips ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
                Show Tooltips & Hints
              </span>
            </label>
          </div>

          {/* Reset button */}
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Progress
          </button>
        </div>
      </div>

      {/* Quick Tips */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickTipCard
          icon={Lightbulb}
          title="Interactive Learning"
          description="Tutorials highlight elements on the actual page, showing you exactly where to click."
        />
        <QuickTipCard
          icon={HelpCircle}
          title="Contextual Help"
          description="Look for the question mark icons throughout the app for helpful tooltips."
        />
        <QuickTipCard
          icon={Mail}
          title="Need More Help?"
          description="Contact Davis for additional assistance with the dashboard."
        />
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search tutorials..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
            />
          </div>

          {/* Category filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === "all" ? "All Categories" : cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tutorials Grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-baylor-green" />
          Available Tutorials
          <span className="text-sm font-normal text-gray-500">
            ({filteredTutorials.length}{" "}
            {filteredTutorials.length === 1 ? "tutorial" : "tutorials"})
          </span>
        </h2>

        {filteredTutorials.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTutorials.map((tutorial) => (
              <TutorialCard
                key={tutorial.id}
                tutorial={tutorial}
                isCompleted={isTutorialCompleted(tutorial.id)}
                onStart={handleStartTutorial}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No tutorials match your search.</p>
            <button
              onClick={() => {
                setSearchTerm("");
                setSelectedCategory("all");
              }}
              className="mt-2 text-baylor-green hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Coming Soon Section */}
      <div className="bg-gradient-to-r from-baylor-green/5 to-baylor-gold/5 rounded-xl border border-baylor-green/20 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          More Tutorials Coming Soon
        </h2>
        <p className="text-gray-600 mb-4">
          I'm working on additional tutorials to help you get the most out of
          the HSD Dashboard. Check back for tutorials on scheduling, analytics,
          and more.
        </p>
        <div className="flex flex-wrap gap-2">
          {["Faculty Schedules", "Data Import", "Reports & Analytics"].map(
            (topic) => (
              <span
                key={topic}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-white border border-gray-200 text-gray-600"
              >
                <Clock className="w-3 h-3 mr-1.5 text-gray-400" />
                {topic}
              </span>
            ),
          )}
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
