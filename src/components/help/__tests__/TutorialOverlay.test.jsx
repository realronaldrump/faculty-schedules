// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
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
});
