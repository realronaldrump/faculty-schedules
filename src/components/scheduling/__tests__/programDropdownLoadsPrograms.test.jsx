// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FacultySchedules from "../FacultySchedules";
import GroupMeetings from "../GroupMeetings";

const loadProgramsMock = vi.fn();
const loadPeopleMock = vi.fn();
let programsLoaded = false;

vi.mock("../../../contexts/DataContext", () => ({
  useData: () => ({
    scheduleData: [],
    facultyData: [],
    loadPrograms: loadProgramsMock,
    programsLoaded,
  }),
}));

vi.mock("../../../contexts/PeopleContext", () => ({
  usePeople: () => ({
    loadPeople: loadPeopleMock,
  }),
}));

describe("faculty program dropdown preload", () => {
  beforeEach(() => {
    loadProgramsMock.mockClear();
    loadPeopleMock.mockClear();
    programsLoaded = false;
  });

  it("FacultySchedules calls loadPrograms on mount when programs are not loaded", async () => {
    programsLoaded = false;
    render(<FacultySchedules />);
    await waitFor(() => expect(loadProgramsMock).toHaveBeenCalled());
  });

  it("GroupMeetings calls loadPrograms on mount when programs are not loaded", async () => {
    programsLoaded = false;
    render(<GroupMeetings />);
    await waitFor(() => expect(loadProgramsMock).toHaveBeenCalled());
  });

  it("does not call loadPrograms when programs are already loaded", async () => {
    programsLoaded = true;
    render(<FacultySchedules />);
    render(<GroupMeetings />);
    await waitFor(() => expect(loadPeopleMock).toHaveBeenCalled());
    expect(loadProgramsMock).not.toHaveBeenCalled();
  });
});

