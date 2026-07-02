import { useMemo } from "react";
import { CheckCircle2, GraduationCap, Users } from "lucide-react";
import Badge from "../../shared/Badge";
import { TUTORIALS } from "../../../contexts/TutorialContext";
import { EmptyState, LoadingBlock, MetricCard } from "./ActivityWidgets";

const TUTORIAL_LIST = Object.values(TUTORIALS).map((tutorial) => ({
  id: tutorial.id,
  title: tutorial.title,
  category: tutorial.category,
  totalSteps: tutorial.steps.length,
}));

export const buildTutorialCompletionModel = (rows) => {
  const users = rows
    .map((row) => {
      const tutorials = row.tutorials || {};
      const byId = {};
      let completedCount = 0;
      let inProgressCount = 0;

      TUTORIAL_LIST.forEach((tutorial) => {
        const entry = tutorials[tutorial.id];
        let status = "not_started";
        if (entry?.status === "completed") {
          status = "completed";
          completedCount += 1;
        } else if (entry?.status === "started") {
          status = "started";
          inProgressCount += 1;
        }
        byId[tutorial.id] = {
          status,
          currentStepIndex: entry?.currentStepIndex ?? 0,
          totalSteps: entry?.totalSteps || tutorial.totalSteps,
        };
      });

      return {
        uid: row.uid || row.id,
        displayName: row.displayName || row.email || row.uid || row.id,
        email: row.email || "",
        completedCount,
        inProgressCount,
        byId,
      };
    })
    .sort(
      (left, right) =>
        right.completedCount - left.completedCount ||
        left.displayName.localeCompare(right.displayName),
    );

  const perTutorial = TUTORIAL_LIST.map((tutorial) => {
    let completed = 0;
    let started = 0;
    users.forEach((user) => {
      const status = user.byId[tutorial.id]?.status;
      if (status === "completed") completed += 1;
      else if (status === "started") started += 1;
    });
    return { ...tutorial, completed, started };
  });

  return {
    users,
    perTutorial,
    totalCompletions: users.reduce((sum, user) => sum + user.completedCount, 0),
    usersWithActivity: users.length,
    usersFullyComplete: users.filter(
      (user) => user.completedCount === TUTORIAL_LIST.length,
    ).length,
  };
};

const TutorialStatusCell = ({ cell }) => {
  if (cell?.status === "completed") {
    return (
      <span className="inline-flex items-center justify-center text-baylor-green">
        <CheckCircle2 className="h-4 w-4" />
      </span>
    );
  }
  if (cell?.status === "started") {
    const total = cell.totalSteps || 0;
    const current = Math.min((cell.currentStepIndex || 0) + 1, total || 1);
    return (
      <Badge tone="warning" size="sm">
        {current}/{total}
      </Badge>
    );
  }
  return <span className="text-gray-300">–</span>;
};

const TutorialsTab = ({ tutorialProgressRows, loading }) => {
  const model = useMemo(
    () => buildTutorialCompletionModel(tutorialProgressRows),
    [tutorialProgressRows],
  );

  if (loading) {
    return <LoadingBlock label="Loading tutorial progress…" />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Tutorials"
          value={TUTORIAL_LIST.length}
          hint="Available step-by-step tutorials"
          icon={GraduationCap}
        />
        <MetricCard
          label="Completions"
          value={model.totalCompletions}
          hint={`${model.usersFullyComplete} user${model.usersFullyComplete === 1 ? "" : "s"} finished all of them`}
          icon={CheckCircle2}
        />
        <MetricCard
          label="Users with Progress"
          value={model.usersWithActivity}
          hint="Started or completed at least one"
          icon={Users}
        />
      </div>

      <div className="university-card">
        <div className="university-card-header">
          <h3 className="text-base font-semibold text-baylor-green">Completion matrix</h3>
          <p className="mt-0.5 text-sm text-gray-500">
            A check means completed; a gold count shows the furthest step reached.
          </p>
        </div>
        {model.users.length === 0 ? (
          <div className="p-5">
            <EmptyState>No tutorial activity recorded yet.</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="university-table">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-50">User</th>
                  {model.perTutorial.map((tutorial) => (
                    <th
                      key={tutorial.id}
                      className="text-center align-bottom"
                      title={`${tutorial.title}: ${tutorial.completed} completed, ${tutorial.started} in progress`}
                    >
                      <div className="mx-auto max-w-[7rem] text-xs font-semibold">
                        {tutorial.title}
                      </div>
                      <div className="mt-1 text-2xs font-medium text-gray-400">
                        {tutorial.completed}✓
                        {tutorial.started ? ` · ${tutorial.started}…` : ""}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.users.map((user) => (
                  <tr key={user.uid}>
                    <td className="sticky left-0 z-10 bg-white">
                      <p className="font-medium text-gray-900">{user.displayName}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {user.completedCount}/{TUTORIAL_LIST.length} done
                        {user.inProgressCount ? ` · ${user.inProgressCount} in progress` : ""}
                      </p>
                    </td>
                    {model.perTutorial.map((tutorial) => (
                      <td key={tutorial.id} className="text-center align-middle">
                        <TutorialStatusCell cell={user.byId[tutorial.id]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TutorialsTab;
