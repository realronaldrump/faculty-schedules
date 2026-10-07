// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, act, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
let locationValue = { pathname: "/elsewhere" };
const tutorialState = { current: null };

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
  useLocation: () => locationValue,
}));

vi.mock("../../../contexts/TutorialContext", () => ({
  useTutorial: () => tutorialState.current,
}));

import TutorialOverlay from "../TutorialOverlay";

// A targeted tutorial mirroring the real "room-schedules" shape: an intro step
// with no target, then steps that DEFINE a target selector.
const TUTORIAL = {
  id: "room-schedules",
  targetPage: "scheduling/rooms?tab=browse",
  steps: [
    { id: "welcome", title: "Welcome", content: "", target: null, action: null },
    {
      id: "day-selector",
      title: "Select a Day",
      content: "Pick a weekday.",
      target: '[data-tutorial="day-selector"]',
      action: null,
    },
  ],
};

const setStep = (stepIndex) => {
  tutorialState.current = {
    activeTutorial: TUTORIAL,
    currentStep: TUTORIAL.steps[stepIndex],
    currentStepIndex: stepIndex,
    isPaused: false,
    actionCompleted: false,
    nextStep: vi.fn(),
    prevStep: vi.fn(),
    endTutorial: vi.fn(),
    markActionCompleted: vi.fn(),
  };
};

// The click blocker frame uses the z-[9997] layer; the spotlight uses z-[9998].
const clickBlocker = () => document.querySelector('[class*="9997"]');
const spotlight = () => document.querySelector('[class*="9998"]');

describe("TutorialOverlay missing-target recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigateMock.mockClear();
    locationValue = { pathname: "/elsewhere" };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("updates the viewport even when the window was resized before starting a tutorial", () => {
    let width = 1280;
    vi.spyOn(window, "innerWidth", "get").mockImplementation(() => width);
    tutorialState.current = { activeTutorial: null };
    const view = render(<TutorialOverlay />);
    width = 320;
    act(() => window.dispatchEvent(new Event("resize")));
    setStep(0);
    view.rerender(<TutorialOverlay />);
    const card = document.querySelector('[data-tutorial="instruction-card"]');
    expect(Number.parseFloat(card.style.left)).toBe(16);
  });

  it("scrolls an oversized form into view once without repeatedly pulling the user away from its inputs", () => {
    vi.useFakeTimers();
    const target = document.createElement("div");
    target.dataset.tutorial = "day-selector";
    const scroll = vi.fn();
    target.scrollIntoView = scroll;
    target.getBoundingClientRect = () => ({ left: 40, right: 280, width: 240, top: -400, bottom: 1100, height: 1500 });
    document.body.appendChild(target);
    setStep(1);
    render(<TutorialOverlay />);
    act(() => vi.advanceTimersByTime(2500));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
  });

  it("intro step (target: null) keeps the intentional full-screen dim + card", () => {
    setStep(0);
    render(<TutorialOverlay />);

    // Intro/outro behavior is preserved: full-screen dim + centered card.
    expect(spotlight()).toBeInTheDocument();
    expect(clickBlocker()).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 2/i)).toBeInTheDocument();

    // No recovery should ever kick in for a deliberately target-less step.
    act(() => vi.advanceTimersByTime(2000));
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/Tutorial paused/i)).not.toBeInTheDocument();
  });

  it("does NOT full-screen block when a defined target is missing from the DOM", () => {
    setStep(1); // target selector is not present in the document
    render(<TutorialOverlay />);

    // The core of the bug: no full-screen click blocker, no dim, no misplaced card.
    expect(clickBlocker()).toBeNull();
    expect(spotlight()).toBeNull();
    expect(screen.queryByText(/Step 2 of 2/i)).not.toBeInTheDocument();
  });

  it("recovers after the grace period: shows the notice and navigates back", () => {
    setStep(1);
    render(<TutorialOverlay />);

    // Within the grace window nothing is shown (avoids flashing on transitions).
    expect(screen.queryByText(/Tutorial paused/i)).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1300));

    // Non-blocking notice appears and we navigate back to the tutorial's page.
    expect(screen.getByText(/Tutorial paused/i)).toBeInTheDocument();
    expect(clickBlocker()).toBeNull(); // still no full-screen block
    expect(navigateMock).toHaveBeenCalledWith("/scheduling/rooms?tab=browse");
  });

  it("does not redirect-loop when already on the tutorial page", () => {
    locationValue = { pathname: "/scheduling/rooms" }; // already on target page
    setStep(1);
    render(<TutorialOverlay />);

    act(() => vi.advanceTimersByTime(1300));

    // On the correct page we surface the notice + Exit affordance but do not
    // navigate (the poller will re-acquire the element when it mounts).
    expect(screen.getByText(/Tutorial paused/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exit tutorial/i })).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("offers a way back when a resumed step needs a window that is closed", () => {
    // Mirrors "Resume · Step 10 of 17" in add-student-worker: the Add Job button
    // only exists inside the Add Student wizard, which a fresh page has closed.
    const wizardTutorial = {
      id: "add-student-worker",
      targetPage: "people/directory?tab=student",
      steps: [
        { id: "welcome", title: "Welcome", content: "", target: null, action: null },
        { id: "add-button", title: "Click Add Student", content: "", target: '[data-tutorial="add-student-btn"]', action: null },
        { id: "jobs-intro", title: "Job Assignments", content: "", target: '[data-tutorial="jobs-section"]', action: null },
        { id: "add-job", title: "Add a Job Assignment", content: "", target: '[data-tutorial="add-job-btn"]', action: null },
      ],
    };
    const addStudent = document.createElement("button");
    addStudent.setAttribute("data-tutorial", "add-student-btn");
    document.body.appendChild(addStudent);
    locationValue = { pathname: "/people/directory" };
    const goToStep = vi.fn();
    tutorialState.current = {
      activeTutorial: wizardTutorial,
      currentStep: wizardTutorial.steps[3],
      currentStepIndex: 3,
      isPaused: false,
      actionCompleted: false,
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      goToStep,
      endTutorial: vi.fn(),
      markActionCompleted: vi.fn(),
    };
    render(<TutorialOverlay />);

    act(() => vi.advanceTimersByTime(1300));

    expect(screen.getByText("Step 4 of 4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Back to step 2/i }));
    expect(goToStep).toHaveBeenCalledWith(1);
  });

  it("renders normally when the target IS present in the DOM", () => {
    const el = document.createElement("div");
    el.setAttribute("data-tutorial", "day-selector");
    document.body.appendChild(el);

    setStep(1);
    render(<TutorialOverlay />);

    // Resolvable target → spotlight + instruction card, no recovery.
    expect(spotlight()).toBeInTheDocument();
    expect(screen.getByText(/Step 2 of 2/i)).toBeInTheDocument();
    expect(screen.queryByText(/Tutorial paused/i)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1300));
    expect(navigateMock).not.toHaveBeenCalled();

    document.body.removeChild(el);
  });

  it("keeps the instruction card visible when a completed action removes its target", () => {
    const actionStep = {
      ...TUTORIAL.steps[1],
      action: "Click Save Job",
      actionType: "click",
    };

    tutorialState.current = {
      activeTutorial: {
        ...TUTORIAL,
        steps: [TUTORIAL.steps[0], actionStep],
      },
      currentStep: actionStep,
      currentStepIndex: 1,
      isPaused: false,
      actionCompleted: true,
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      endTutorial: vi.fn(),
      markActionCompleted: vi.fn(),
    };

    render(<TutorialOverlay />);

    expect(screen.getByText(/Step 2 of 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Done!/i)).toBeInTheDocument();
    expect(screen.queryByText(/Tutorial paused/i)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1300));
    expect(screen.queryByText(/Tutorial paused/i)).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

describe("TutorialOverlay action controls and measured layout", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("keeps the real Add Job button uncovered by a wrapped 399px instruction card", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(320);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(568);
    const target = document.createElement("button");
    target.dataset.tutorial = "add-job-btn";
    target.textContent = "Add Job Assignment";
    document.body.appendChild(target);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this === target) return { x: 40, y: 443, left: 40, top: 443, width: 240, height: 62, right: 280, bottom: 505 };
      if (this.classList.contains("z-[9999]")) {
        const top = Number.parseFloat(this.style.top) || 0;
        const left = Number.parseFloat(this.style.left) || 0;
        return { x: left, y: top, left, top, width: 288, height: 399, right: left + 288, bottom: top + 399 };
      }
      return { x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    });
    setStep(1);
    const step = { ...TUTORIAL.steps[1], target: '[data-tutorial="add-job-btn"]', action: "Click Add Job", actionType: "click" };
    tutorialState.current.currentStep = step;
    render(<TutorialOverlay />);
    const card = document.querySelector('[class*="9999"]');
    expect(Number.parseFloat(card.style.top) + 399).toBeLessThanOrEqual(443);
    expect(Number.parseFloat(card.style.left)).toBeGreaterThanOrEqual(0);
    expect(Number.parseFloat(card.style.left) + 288).toBeLessThanOrEqual(320);
    target.remove();
  });

  it("waits for the successful workflow result instead of completing on any click", async () => {
    const target = document.createElement("button");
    target.dataset.tutorial = "save-job-btn";
    document.body.appendChild(target);
    setStep(1);
    tutorialState.current.currentStep = {
      ...TUTORIAL.steps[1],
      target: '[data-tutorial="save-job-btn"]',
      action: "Save a valid job", actionType: "click",
      completionTarget: '[data-tutorial="jobs-section"][data-tutorial-ready="true"]',
    };
    render(<TutorialOverlay />);
    fireEvent.click(target);
    expect(tutorialState.current.markActionCompleted).not.toHaveBeenCalled();
    await act(async () => {
      const result = document.createElement("div");
      result.dataset.tutorial = "jobs-section";
      result.dataset.tutorialReady = "true";
      document.body.appendChild(result);
    });
    expect(tutorialState.current.markActionCompleted).toHaveBeenCalledTimes(1);
    target.remove();
    document.querySelector('[data-tutorial="jobs-section"]').remove();
  });

  it("does not intercept arrow keys and Enter while editing a form input", () => {
    const target = document.createElement("input");
    target.dataset.tutorial = "day-selector";
    document.body.appendChild(target);
    setStep(1);
    render(<TutorialOverlay />);
    fireEvent.keyDown(target, { key: "ArrowRight" });
    fireEvent.keyDown(target, { key: "Enter" });
    expect(tutorialState.current.nextStep).not.toHaveBeenCalled();
    target.remove();
  });
});
