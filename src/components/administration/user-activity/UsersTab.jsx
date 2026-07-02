import { useMemo, useState } from "react";
import { Clock3, Download, Search, Users } from "lucide-react";
import Badge from "../../shared/Badge";
import Modal from "../../shared/Modal";
import SortableHeader from "../../shared/SortableHeader";
import { buildUserDrilldownModel } from "../../../utils/activityAnalytics";
import {
  EmptyState,
  HourBars,
  LoadingBlock,
  MetricCard,
  RankedList,
  TrendChart,
} from "./ActivityWidgets";
import {
  downloadCsv,
  formatCount,
  formatMinutes,
  formatTimeAgo,
  humanizeActionKey,
} from "./activityDisplay";

const ROLE_TONES = {
  admin: "info",
  staff: "success",
  faculty: "warning",
};

const compareValues = (left, right) => {
  if (typeof left === "string" || typeof right === "string") {
    return String(left ?? "").localeCompare(String(right ?? ""));
  }
  return Number(left ?? 0) - Number(right ?? 0);
};

const UserDrilldownModal = ({ user, userDailyRows, rangeDays, onClose }) => {
  const detail = useMemo(
    () =>
      buildUserDrilldownModel({
        rows: userDailyRows.filter((row) => row.uid === user?.uid),
        rangeDays,
      }),
    [rangeDays, user?.uid, userDailyRows],
  );

  if (!user) return null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={user.displayName}
      subtitle={`${user.email || "No email"} · ${user.role || "unknown"} · last ${rangeDays} days`}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MetricCard
            label="Time in App"
            value={formatMinutes(detail.summary.totalMinutesApprox)}
            hint={`${detail.summary.sessionCount} sessions`}
            icon={Clock3}
          />
          <MetricCard
            label="Active Days"
            value={detail.summary.activeDays}
            hint={`${detail.summary.pagesVisitedCount} page visits`}
            icon={Users}
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-baylor-green">Daily time</p>
          <TrendChart rows={detail.trendRows} dataKey="totalMinutesApprox" formatter={formatMinutes} height={180} />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-baylor-green">Hour-of-day profile</p>
          <HourBars rows={detail.heatmapRows} />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-baylor-green">Top pages</p>
            <RankedList rows={detail.topPages} labelKey="pageLabel" />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-baylor-green">Top actions</p>
            <RankedList
              rows={detail.topActions.map((row) => ({
                ...row,
                actionLabel: humanizeActionKey(row.actionKey),
              }))}
              labelKey="actionLabel"
              valueKey="count"
              valueFormatter={formatCount}
              emptyText="No recorded actions in this range."
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};

const UsersTab = ({ model, userDailyRows, rangeDays, loading, todayDateKey }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState({
    key: "totalMinutesApprox",
    direction: "descending",
  });
  const [selectedUser, setSelectedUser] = useState(null);

  const roles = useMemo(
    () =>
      Array.from(
        new Set(model.aggregatedUsers.map((user) => user.role || "unknown")),
      ).sort(),
    [model.aggregatedUsers],
  );

  const visibleUsers = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    const filtered = model.aggregatedUsers.filter((user) => {
      if (roleFilter !== "all" && (user.role || "unknown") !== roleFilter) {
        return false;
      }
      if (!needle) return true;
      return (
        user.displayName.toLowerCase().includes(needle) ||
        (user.email || "").toLowerCase().includes(needle)
      );
    });
    const direction = sortConfig.direction === "ascending" ? 1 : -1;
    return [...filtered].sort(
      (left, right) =>
        compareValues(left[sortConfig.key], right[sortConfig.key]) * direction,
    );
  }, [model.aggregatedUsers, roleFilter, searchTerm, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction:
        current.key === key && current.direction === "descending"
          ? "ascending"
          : "descending",
    }));
  };

  const exportCsv = () => {
    downloadCsv(
      `user-activity-users-${rangeDays}d-${todayDateKey}.csv`,
      [
        "Name",
        "Email",
        "Role",
        "Total Minutes",
        "Sessions",
        "Avg Min/Session",
        "Pages Visited",
        "Active Days",
        "Actions",
        "Last Seen",
      ],
      visibleUsers.map((user) => [
        user.displayName,
        user.email,
        user.role || "unknown",
        user.totalMinutesApprox || 0,
        user.sessionCount || 0,
        user.avgMinutesPerSession || 0,
        user.pagesVisitedCount || 0,
        user.activeDays || 0,
        user.semanticEventCount || 0,
        user.lastSeenDateKey || "",
      ]),
    );
  };

  if (loading) {
    return <LoadingBlock label="Loading user summaries…" />;
  }

  return (
    <div className="university-card">
      <div className="university-card-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-baylor-green">
            Users ({visibleUsers.length})
          </h3>
          <p className="mt-0.5 text-sm text-gray-500">
            Click a user to see their day-by-day detail.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name or email"
              className="w-52 rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-baylor-green focus:outline-none focus:ring-2 focus:ring-baylor-green/20"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-baylor-green focus:outline-none focus:ring-2 focus:ring-baylor-green/20"
            aria-label="Filter by role"
          >
            <option value="all">All roles</option>
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportCsv}
            disabled={visibleUsers.length === 0}
            className="btn-secondary-sm"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {visibleUsers.length === 0 ? (
        <div className="p-5">
          <EmptyState>
            {model.aggregatedUsers.length === 0
              ? "No user activity in this range yet — summaries appear automatically as people use the app."
              : "No users match the current filters."}
          </EmptyState>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="university-table">
            <thead>
              <tr>
                <SortableHeader label="User" columnKey="displayName" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Time" columnKey="totalMinutesApprox" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Sessions" columnKey="sessionCount" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Pages" columnKey="pagesVisitedCount" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Actions" columnKey="semanticEventCount" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Last Seen" columnKey="lastSeenDateKey" sortConfig={sortConfig} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr
                  key={user.uid || user.email}
                  className="cursor-pointer"
                  onClick={() => setSelectedUser(user)}
                >
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{user.displayName}</span>
                      {user.isNewInRange && (
                        <Badge tone="info" size="sm">New</Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                      <span>{user.email}</span>
                      <Badge tone={ROLE_TONES[user.role] || "neutral"} size="sm">
                        {user.role || "unknown"}
                      </Badge>
                    </div>
                  </td>
                  <td>
                    <p className="font-medium">{formatMinutes(user.totalMinutesApprox)}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {user.avgMinutesPerSession}m avg/session
                    </p>
                  </td>
                  <td>
                    <p className="font-medium">{user.sessionCount}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {user.activeDays} active day{user.activeDays === 1 ? "" : "s"}
                    </p>
                  </td>
                  <td>
                    <p className="font-medium">{user.pagesVisitedCount}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{user.avgPagesPerDay} avg/day</p>
                  </td>
                  <td>
                    <p className="font-medium">{formatCount(user.semanticEventCount)}</p>
                  </td>
                  <td>
                    <p className="text-sm text-gray-700">
                      {user.lastSeenAt ? formatTimeAgo(user.lastSeenAt) : user.lastSeenDateKey || "—"}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedUser && (
        <UserDrilldownModal
          user={selectedUser}
          userDailyRows={userDailyRows}
          rangeDays={rangeDays}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
};

export default UsersTab;
