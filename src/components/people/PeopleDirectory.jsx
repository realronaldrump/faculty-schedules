import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import StudentDirectory from "../StudentDirectory";
import PersonDirectory from "./PersonDirectory";
import {
  adjunctDirectoryConfig,
  facultyDirectoryConfig,
  staffDirectoryConfig,
} from "../person-directory-configs/configs-core";
import {
  GraduationCap,
  UserCheck,
  UserPlus,
  User,
  Play,
} from "lucide-react";
import { usePeople } from "../../contexts/PeopleContext";
import { useData } from "../../contexts/DataContext";
import { useTutorial } from "../../contexts/TutorialContext";
import { usePeopleOperations } from "../../hooks";

// Local tab definitions to switch between directory views
const tabs = [
  {
    id: "faculty",
    label: "Faculty",
    icon: GraduationCap,
    description: "Full-time faculty members",
  },
  {
    id: "staff",
    label: "Staff",
    icon: UserCheck,
    description: "Administrative and support staff",
  },
  {
    id: "adjunct",
    label: "Adjunct",
    icon: UserPlus,
    description: "Part-time and adjunct faculty",
  },
  {
    id: "student",
    label: "Student Workers",
    icon: User,
    description: "Departmental student workers",
  },
];

const PeopleDirectory = ({ embedded = false, initialTab = "faculty" }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { loadPeople } = usePeople();
  const { loadPrograms, directoryData, scheduleData, programs } = useData();
  const { startTutorial } = useTutorial();
  const {
    handleFacultyUpdate,
    handleStaffUpdate,
    handleFacultyDelete,
    handleStaffDelete,
  } = usePeopleOperations();

  // Get tab from URL parameter or use initialTab
  const getInitialTab = () => {
    const urlParams = new URLSearchParams(location.search);
    const tabParam = urlParams.get("tab");
    return tabs.find((tab) => tab.id === tabParam) ? tabParam : initialTab;
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  useEffect(() => {
    loadPeople();
    loadPrograms();
  }, [loadPeople, loadPrograms]);

  // Update URL when tab changes
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    const urlParams = new URLSearchParams(location.search);
    urlParams.set("tab", tabId);
    navigate(`${location.pathname}?${urlParams.toString()}`, { replace: true });
  };

  // Update tab if URL parameter changes
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const tabParam = urlParams.get("tab");
    if (tabParam && tabs.find((tab) => tab.id === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location.search]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          {embedded ? (
            <h2 className="text-xl font-semibold text-gray-900 mb-1">
              People Directory
            </h2>
          ) : (
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              People Directory
            </h1>
          )}
          <p className="text-gray-600">
            Browse and manage faculty, staff, adjuncts, and student workers
          </p>
        </div>
        <button
          onClick={() => {
            setActiveTab("faculty");
            startTutorial("people-directory");
          }}
          className="flex min-h-11 items-center gap-2 rounded-lg border border-baylor-green px-3 py-2 text-sm text-baylor-green transition-colors hover:bg-baylor-green/5"
          title="Learn how to use People Directory"
        >
          <Play className="w-4 h-4" />
          Tutorial
        </button>
      </div>

      {/* Quick Access Cards */}
      <div className="overflow-x-auto pb-1 md:overflow-visible" data-tutorial="category-cards">
        <div className="flex gap-3 md:grid md:grid-cols-2 lg:grid-cols-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                aria-pressed={activeTab === tab.id}
                className={`min-h-11 min-w-[15rem] rounded-lg border-2 p-4 transition-all duration-200 hover:shadow-md md:min-w-0 ${activeTab === tab.id
                    ? "border-baylor-green bg-baylor-green/5 shadow-md"
                    : "border-gray-200 bg-white hover:border-baylor-green/30 hover:bg-baylor-green/2"
                  }`}
                {...(tab.id === "student" ? { "data-tutorial": "student-workers-card" } : {})}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`rounded-lg p-2 ${activeTab === tab.id
                        ? "bg-baylor-green text-white"
                        : "bg-gray-100 text-gray-600"
                      }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <h3
                      className={`text-sm font-medium ${activeTab === tab.id
                          ? "text-baylor-green"
                          : "text-gray-900"
                        }`}
                    >
                      {tab.label}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {tab.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Directory Content */}
      <div data-tutorial="directory-content">
            {activeTab === "faculty" && (
              <PersonDirectory
                config={facultyDirectoryConfig}
                data={directoryData}
                scheduleData={scheduleData}
                programs={programs}
                onUpdate={handleFacultyUpdate}
                onRelatedUpdate={handleStaffUpdate}
                onDelete={handleFacultyDelete}
              />
            )}
            {activeTab === "staff" && (
              <PersonDirectory
                config={staffDirectoryConfig}
                data={directoryData}
                programs={programs}
                onUpdate={handleStaffUpdate}
                onRelatedUpdate={handleFacultyUpdate}
                onDelete={handleStaffDelete}
              />
            )}
            {activeTab === "adjunct" && (
              <PersonDirectory
                config={adjunctDirectoryConfig}
                data={directoryData}
                scheduleData={scheduleData}
                programs={programs}
                onUpdate={handleFacultyUpdate}
                onRelatedUpdate={handleStaffUpdate}
                onDelete={handleFacultyDelete}
              />
            )}
            {activeTab === "student" && <StudentDirectory />}
      </div>
    </div>
  );
};

export default PeopleDirectory;
