import { useState } from "react";
import SelectDropdown from "../../SelectDropdown";
import { downloadCsv, formatCount, formatMinutes } from "./activityDisplay";
import { ExplorerCard, ExplorerEmpty, EntityLink } from "./ExplorerWidgets";
import { TrendChart } from "./ActivityWidgets";

export default function ExplorerUsage({
  model,
  group,
  onGroup,
  onPerson,
  onFeature,
  search,
  startDateKey,
  endDateKey,
}) {
  const [sort, setSort] = useState("activeDays");
  const people = group === "people";
  const needle = search.toLowerCase().trim();
  const rows = [...(people ? model.people : model.features)]
    .filter(
      (row) =>
        !needle ||
        `${row.label} ${row.email || ""} ${row.section || ""}`
          .toLowerCase()
          .includes(needle),
    )
    .sort((a, b) =>
      sort === "label"
        ? a.label.localeCompare(b.label)
        : (b[sort] || 0) - (a[sort] || 0),
    );
  const exportRows = () =>
    downloadCsv(
      `activity-${group}-${startDateKey}-${endDateKey}.csv`,
      [
        people ? "Person" : "Feature",
        "Days used",
        "Page views",
        people ? "Distinct features" : "People",
        "Visible-tab minutes",
        "Last recorded date",
      ],
      rows.map((row) => [
        row.label,
        row.activeDays,
        row.pageViews,
        people ? row.featureCount : row.peopleCount,
        row.minutes,
        row.lastDateKey,
      ]),
    );
  return (
    <div className="activity-sections">
      <ExplorerCard
        title="Explore usage"
        description="Follow a person’s visits or see how a feature fits into their work."
      >
        <div className="activity-table-toolbar">
          <div className="activity-segment" aria-label="Explore usage by">
            <button aria-pressed={people} onClick={() => onGroup("people")}>
              People
            </button>
            <button aria-pressed={!people} onClick={() => onGroup("features")}>
              Features
            </button>
          </div>
          <div className="activity-table-actions">
            <SelectDropdown
              aria-label="Sort usage"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="activeDays">Days used</option>
              <option value="pageViews">Page views</option>
              <option value="minutes">Visible-tab time</option>
              <option value="label">Name</option>
            </SelectDropdown>
            <button
              className="activity-button"
              onClick={exportRows}
              disabled={!rows.length}
            >
              Export CSV
            </button>
          </div>
        </div>
        {rows.length ? (
          <div className="activity-table-scroll">
            <table className="activity-table">
              <thead>
                <tr>
                  <th>{people ? "Person" : "Feature"}</th>
                  <th>Days used</th>
                  <th>{people ? "Features" : "People"}</th>
                  <th>Page views</th>
                  <th>Last used</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <EntityLink
                        onClick={() =>
                          people ? onPerson(row.id) : onFeature(row.id)
                        }
                      >
                        {row.label}
                      </EntityLink>
                      <small>{people ? row.email : row.section}</small>
                    </td>
                    <td>
                      {row.activeDays}
                      <small>
                        {row.activeDays > 1
                          ? "Used on multiple days"
                          : "Recorded on one day"}
                      </small>
                    </td>
                    <td>{people ? row.featureCount : row.peopleCount}</td>
                    <td>
                      {formatCount(row.pageViews)}
                      <small>
                        {formatMinutes(row.minutes)} visible-tab time
                      </small>
                    </td>
                    <td>{row.lastDateKey}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ExplorerEmpty>
            No {people ? "people" : "features"} match the current filters.
          </ExplorerEmpty>
        )}
      </ExplorerCard>
      <ExplorerCard
        title="Daily use"
        description="People with recorded activity each day. Today is still in progress."
      >
        <TrendChart
          rows={model.trendRows}
          dataKey="uniqueUsers"
          formatter={formatCount}
        />
        <details className="activity-definitions">
          <summary>Read daily values</summary>
          <div className="activity-table-scroll">
            <table className="activity-table">
              <thead>
                <tr>
                  <th>Date (Central)</th>
                  <th>People</th>
                  <th>Page views</th>
                </tr>
              </thead>
              <tbody>
                {model.trendRows.map((row) => (
                  <tr key={row.dateKey}>
                    <td>
                      {row.dateKey}
                      {row.isPartial && " · in progress"}
                    </td>
                    <td>{row.uniqueUsers}</td>
                    <td>{row.pageEnterCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </ExplorerCard>
      <p className="activity-footnote">
        Days used and features are distinct counts within this period. Page
        views count page openings. Visible-tab time is measured while the tab is
        visible; it does not measure work or task completion. Reading a schedule
        or directory can be useful without a recorded action.
      </p>
    </div>
  );
}
