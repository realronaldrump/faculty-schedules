/**
 * TutorialOverlay - Interactive tutorial walkthrough overlay
 *
 * Features:
 * - Highlights target elements on the page
 * - Shows step-by-step instructions
 * - Progress indicator
 * - Keyboard navigation
 * - Responsive positioning
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, CheckCircle, CheckCircle2, Target, Hand, AlertTriangle, Loader2 } from 'lucide-react';
import { useTutorial } from '../../contexts/TutorialContext';
import { calculateTutorialCardPosition } from '../../utils/tutorialLayout';

// How long a defined target may be missing from the DOM before we treat the
// user as having navigated away and recover (navigate back + show a notice).
// Must comfortably exceed the 500ms poll interval so brief transitions (e.g.
// switching tabs within the tutorial page) don't trigger a false recovery.
const TARGET_MISSING_GRACE_MS = 1200;

// Spotlight effect that highlights the target element
const Spotlight = ({ targetRect, padding = 8 }) => {
  // When no target, show a uniform dark overlay (for intro/outro steps)
  if (!targetRect) {
    return (
      <div className="fixed inset-0 z-[9998] pointer-events-none bg-black/60" />
    );
  }

  const { top, left, width, height } = targetRect;

  return (
    <div className="fixed inset-0 z-[9998] pointer-events-none">
      {/* Semi-transparent overlay with cutout */}
      <svg className="w-full h-full">
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={left - padding}
              y={top - padding}
              width={width + padding * 2}
              height={height + padding * 2}
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.75)"
          mask="url(#spotlight-mask)"
        />
      </svg>

      {/* Animated highlight border */}
      <div
        className="absolute border-2 border-baylor-gold rounded-lg animate-pulse"
        style={{
          top: top - padding,
          left: left - padding,
          width: width + padding * 2,
          height: height + padding * 2,
          boxShadow: '0 0 0 4px rgba(255, 184, 28, 0.3), 0 0 20px rgba(255, 184, 28, 0.4)'
        }}
      />
    </div>
  );
};

// Click blocker that creates a "frame" around the target, leaving the target interactable
const ClickBlockerFrame = ({ targetRect, padding = 8 }) => {
  // If no target, block entire screen
  if (!targetRect) {
    return <div className="fixed inset-0 z-[9997]" />;
  }

  const { top, left, width, height } = targetRect;
  const holeTop = top - padding;
  const holeLeft = left - padding;
  const holeWidth = width + padding * 2;
  const holeHeight = height + padding * 2;

  return (
    <>
      {/* Top blocker */}
      <div
        className="fixed left-0 right-0 z-[9997]"
        style={{ top: 0, height: Math.max(0, holeTop) }}
      />
      {/* Bottom blocker */}
      <div
        className="fixed left-0 right-0 bottom-0 z-[9997]"
        style={{ top: holeTop + holeHeight }}
      />
      {/* Left blocker */}
      <div
        className="fixed top-0 bottom-0 z-[9997]"
        style={{ left: 0, width: Math.max(0, holeLeft) }}
      />
      {/* Right blocker */}
      <div
        className="fixed top-0 bottom-0 right-0 z-[9997]"
        style={{ left: holeLeft + holeWidth }}
      />
    </>
  );
};

// Instruction card component
const InstructionCard = ({
  step,
  stepNumber,
  totalSteps,
  position,
  onNext,
  onPrev,
  onSkip,
  onClose,
  isFirst,
  isLast,
  canAdvance,
  actionCompleted,
  onMeasure,
  isBusy = false,
  error = '',
}) => {
  const cardRef = useRef(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  useLayoutEffect(() => {
    setDetailsExpanded(false);
  }, [step.id]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return undefined;
    const measure = () => {
      const { width, height } = card.getBoundingClientRect();
      if (width && height) onMeasure({ width, height });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(card);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [onMeasure, step, actionCompleted, position.compact, detailsExpanded]);

  return (
    <div
      ref={cardRef}
      data-tutorial="instruction-card"
      className="fixed z-[9999] w-96 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col"
      style={{
        top: position.top,
        left: position.left,
        maxHeight: position.maxHeight,
      }}
    >
      {/* Header */}
      <div className="bg-baylor-green px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-white">
          <Target className="w-5 h-5 text-baylor-gold" />
          <span className="font-semibold">Step {stepNumber} of {totalSteps}</span>
        </div>
        {position.compact && (
          <button
            onClick={() => setDetailsExpanded((expanded) => !expanded)}
            className="text-xs text-white underline"
            aria-expanded={detailsExpanded}
            aria-label={detailsExpanded ? 'Hide instructions' : `Show instructions: ${step.title}`}
          >
            {detailsExpanded ? 'Hide' : 'Details'}
          </button>
        )}
        <button
          onClick={onClose}
          disabled={isBusy}
          className="p-1 hover:bg-white/20 rounded transition-colors"
          aria-label="Close tutorial"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {error && <p role="alert" className="p-3 text-sm text-red-700 bg-red-50 shrink-0">{error}</p>}

      {/* Progress bar */}
      <div className="h-1 bg-gray-200">
        <div
          className="h-full bg-baylor-gold transition-all duration-300"
          style={{ width: `${(stepNumber / totalSteps) * 100}%` }}
        />
      </div>

      {/* Content */}
      {(!position.compact || detailsExpanded) && <div className="p-5 min-h-0 overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{step.title}</h3>
        <p className="text-gray-600 mb-4">{step.content}</p>

        {/* Action hint */}
        {step.action && (
          <div className={`flex items-start gap-2 p-3 border rounded-lg mb-4 transition-colors ${actionCompleted
            ? 'bg-green-50 border-green-300'
            : 'bg-baylor-gold/10 border-baylor-gold/30'
            }`}>
            {actionCompleted ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <Hand className="w-5 h-5 text-baylor-gold flex-shrink-0 mt-0.5 animate-bounce" />
            )}
            <div>
              <span className={`text-sm font-medium ${actionCompleted ? 'text-green-700' : 'text-gray-700'}`}>
                {actionCompleted ? 'Done!' : 'Try it:'}
              </span>
              <span className={`text-sm ml-1 ${actionCompleted ? 'text-green-600 line-through' : 'text-gray-600'}`}>
                {step.action}
              </span>
            </div>
          </div>
        )}

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-1 mb-4">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <div
              key={idx}
              className={`w-2 h-2 rounded-full transition-colors ${idx < stepNumber
                ? 'bg-baylor-green'
                : idx === stepNumber - 1
                  ? 'bg-baylor-gold'
                  : 'bg-gray-300'
                }`}
            />
          ))}
        </div>
      </div>}

      {/* Footer */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0">
        <button
          onClick={onSkip}
          disabled={isBusy}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Skip tutorial
        </button>
        <div className="flex items-center gap-2">
          {!isFirst && (
            <button
              onClick={onPrev}
              disabled={isBusy}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}
          <button
            onClick={onNext}
            disabled={isBusy || !canAdvance}
            className={`flex items-center gap-1 px-4 py-1.5 text-sm rounded-lg transition-colors ${canAdvance
              ? 'bg-baylor-green text-white hover:bg-baylor-green/90'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            title={!canAdvance ? 'Complete the action above to continue' : ''}
          >
            {isLast ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Finish
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// Non-blocking notice shown when a step's target element can't be found on the
// current page (e.g. the user navigated away mid-tutorial). Unlike the spotlight
// overlay, this does NOT dim or block the page — it leaves the app fully usable
// while we navigate back to the tutorial's page, and always offers an exit.
const TargetMissingNotice = ({ onTutorialPage, onReturn, onExit }) => (
  <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] w-96 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-200">
    <div className="bg-baylor-green px-4 py-3 flex items-center gap-2 text-white">
      {onTutorialPage ? (
        <AlertTriangle className="w-5 h-5 text-baylor-gold" />
      ) : (
        <Loader2 className="w-5 h-5 text-baylor-gold animate-spin" />
      )}
      <span className="font-semibold">Tutorial paused</span>
    </div>
    <div className="p-5">
      <p className="text-gray-600 mb-4">
        {onTutorialPage
          ? "We can't find this step on the page yet. It may still be loading. You can keep waiting or exit the tutorial."
          : "You've left the tutorial page. Taking you back to where you left off…"}
      </p>
      <div className="flex items-center justify-end gap-2">
        {!onTutorialPage && (
          <button
            onClick={onReturn}
            className="flex items-center gap-1 px-4 py-1.5 text-sm rounded-lg bg-baylor-green text-white hover:bg-baylor-green/90 transition-colors"
          >
            Return now
          </button>
        )}
        <button
          onClick={onExit}
          className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Exit tutorial
        </button>
      </div>
    </div>
  </div>
);

// Main TutorialOverlay component
const TutorialOverlay = () => {
  const {
    activeTutorial,
    currentStep,
    currentStepIndex,
    isPaused,
    nextStep,
    prevStep,
    endTutorial,
    actionCompleted,
    markActionCompleted,
    isTutorialSaving,
    isTutorialEnding,
    tutorialError,
  } = useTutorial();

  const navigate = useNavigate();
  const location = useLocation();

  const [targetRect, setTargetRect] = useState(null);
  const [targetElement, setTargetElement] = useState(null);
  const scrolledTargetRef = useRef(null);
  // True only when the current step DEFINES a target but it isn't in the DOM
  // right now. Distinct from intro/outro steps where `target` is null by design.
  const [targetMissing, setTargetMissing] = useState(false);
  // Becomes true once a missing target has survived the grace period, at which
  // point we surface the recovery notice and navigate back to the tutorial page.
  const [recoveryActive, setRecoveryActive] = useState(false);
  const [cardSize, setCardSize] = useState({ width: 384, height: 0 });
  const [windowSize, setWindowSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const cardPosition = calculateTutorialCardPosition(targetRect, cardSize, windowSize);
  const measureCard = useCallback((size) => {
    setCardSize((current) => current.width === size.width && current.height === size.height ? current : size);
  }, []);

  useLayoutEffect(() => {
    const updateViewport = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setWindowSize((current) => current.width === width && current.height === height ? current : { width, height });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // Calculate if user can advance to next step
  const canAdvance = !currentStep?.action || actionCompleted;
  const completedActionLostTarget =
    targetMissing && currentStep?.action && actionCompleted;

  // Find and track the target element
  const updateTargetPosition = useCallback(() => {
    if (!currentStep || !currentStep.target) {
      // Intro/outro step: no target by design → intentional full-screen dim.
      setTargetRect(null);
      setTargetElement(null);
      setTargetMissing(false);
      return;
    }

    const element = document.querySelector(currentStep.target);
    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        right: rect.right
      });
      setTargetElement(element);
      setTargetMissing(false);

      // Scroll element into view if needed
      const isInViewport =
        rect.top >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.left >= 0 &&
        rect.right <= window.innerWidth;

      if (!isInViewport && scrolledTargetRef.current !== element) {
        scrolledTargetRef.current = element;
        element.scrollIntoView({
          behavior: 'smooth',
          block: rect.height > window.innerHeight ? 'start' : 'center',
          inline: 'center'
        });
      }
    } else {
      // Step expects a target that isn't on the page right now (user likely
      // navigated away). Flag it as missing so we recover instead of trapping
      // the user behind a full-screen dim/click-blocker.
      setTargetRect(null);
      setTargetElement(null);
      setTargetMissing(true);
    }
  }, [currentStep]);

  // Track target element position
  useEffect(() => {
    if (!activeTutorial || isPaused) return;

    scrolledTargetRef.current = null;
    updateTargetPosition();

    // Update on scroll and resize
    const handleUpdate = () => {
      requestAnimationFrame(updateTargetPosition);
    };
    const handleResize = () => {
      scrolledTargetRef.current = null;
      handleUpdate();
    };

    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleResize);

    // Poll for dynamic elements that may not exist immediately
    const pollInterval = setInterval(updateTargetPosition, 500);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleResize);
      clearInterval(pollInterval);
    };
  }, [activeTutorial, currentStep, isPaused, updateTargetPosition]);

  // Recover when a defined target stays missing past the grace period. We treat
  // this as "the user navigated away mid-tutorial": surface the non-blocking
  // notice and navigate back to the tutorial's page so the poller can re-acquire
  // the target. We only auto-navigate when off the tutorial page (avoids a
  // redirect loop if the element is genuinely absent on the correct page).
  useEffect(() => {
    if (!activeTutorial || !targetMissing || completedActionLostTarget) {
      setRecoveryActive(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      setRecoveryActive(true);

      const { targetPage } = activeTutorial;
      if (targetPage) {
        const targetPathname = `/${targetPage.split('?')[0]}`;
        if (location.pathname !== targetPathname) {
          navigate(`/${targetPage}`);
        }
      }
    }, TARGET_MISSING_GRACE_MS);

    return () => clearTimeout(timer);
  }, [
    activeTutorial,
    targetMissing,
    completedActionLostTarget,
    currentStepIndex,
    location.pathname,
    navigate,
  ]);

  // Listen for action completion on target element
  useEffect(() => {
    if (!currentStep?.action || currentStep.completionTarget || !targetElement || actionCompleted || isPaused) return;

    const actionType = currentStep.actionType;

    const handleActionComplete = () => {
      markActionCompleted();
    };

    if (actionType === 'click') {
      // For click actions, listen for click on the target or its descendants
      targetElement.addEventListener('click', handleActionComplete, { capture: true });
      return () => {
        targetElement.removeEventListener('click', handleActionComplete, { capture: true });
      };
    }

    if (actionType === 'type' || actionType === 'input') {
      // For input actions, listen for any input/change within the target (captures text + checkboxes)
      targetElement.addEventListener('input', handleActionComplete, { capture: true });
      targetElement.addEventListener('change', handleActionComplete, { capture: true });
      return () => {
        targetElement.removeEventListener('input', handleActionComplete, { capture: true });
        targetElement.removeEventListener('change', handleActionComplete, { capture: true });
      };
    }

    return;
  }, [currentStep, targetElement, actionCompleted, markActionCompleted, isPaused]);

  // Workflow steps complete when the validated result is present, including
  // when a successful click unmounts its original target or data was pre-filled.
  useEffect(() => {
    if (!currentStep?.action || !currentStep.completionTarget || actionCompleted || isPaused) return undefined;
    let completed = false;
    const check = () => {
      if (!completed && document.querySelector(currentStep.completionTarget)) {
        completed = true;
        markActionCompleted();
      }
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-tutorial-ready'] });
    return () => observer.disconnect();
  }, [currentStep, actionCompleted, markActionCompleted, isPaused]);

  // Keyboard navigation
  useEffect(() => {
    if (!activeTutorial || isPaused || isTutorialSaving || isTutorialEnding) return;

    const handleKeyDown = (e) => {
      if (e.key !== 'Escape' && e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      switch (e.key) {
        case 'ArrowRight':
        case 'Enter':
          e.preventDefault();
          nextStep(); // nextStep already checks canAdvance internally
          break;
        case 'ArrowLeft':
          e.preventDefault();
          prevStep();
          break;
        case 'Escape':
          e.preventDefault();
          endTutorial(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTutorial, nextStep, prevStep, endTutorial, isPaused, isTutorialSaving, isTutorialEnding]);

  // Don't render if no active tutorial or paused
  if (!activeTutorial || isPaused || !currentStep) {
    return null;
  }

  // Target defined but missing from the DOM: never full-screen dim/block. Show
  // the non-blocking recovery notice once the grace period has elapsed (it stays
  // hidden during brief transitions so it doesn't flash mid-tutorial).
  if (targetMissing) {
    if (completedActionLostTarget) {
      return (
        <InstructionCard
          step={currentStep}
          stepNumber={currentStepIndex + 1}
          totalSteps={activeTutorial.steps.length}
          position={cardPosition}
          onNext={nextStep}
          onPrev={prevStep}
          onSkip={() => endTutorial(false)}
          onClose={() => endTutorial(false)}
          isFirst={currentStepIndex === 0}
          isLast={currentStepIndex === activeTutorial.steps.length - 1}
          canAdvance={canAdvance}
          actionCompleted={actionCompleted}
          onMeasure={measureCard}
          isBusy={isTutorialSaving || isTutorialEnding}
          error={tutorialError}
        />
      );
    }

    if (!recoveryActive) return null;

    const targetPage = activeTutorial.targetPage;
    const targetPathname = targetPage ? `/${targetPage.split('?')[0]}` : null;
    const onTutorialPage = targetPathname
      ? location.pathname === targetPathname
      : false;

    return (
      <TargetMissingNotice
        onTutorialPage={onTutorialPage}
        onReturn={() => targetPage && navigate(`/${targetPage}`)}
        onExit={() => endTutorial(false)}
      />
    );
  }

  return (
    <>
      {/* Spotlight overlay (full-screen dim for intro/outro is intentional) */}
      <Spotlight targetRect={targetRect} />

      {/* Click blocker frame - blocks clicks outside target, leaves target fully interactive */}
      <ClickBlockerFrame targetRect={targetRect} />

      {/* Instruction card */}
      <InstructionCard
        step={currentStep}
        stepNumber={currentStepIndex + 1}
        totalSteps={activeTutorial.steps.length}
        position={cardPosition}
        onNext={nextStep}
        onPrev={prevStep}
        onSkip={() => endTutorial(false)}
        onClose={() => endTutorial(false)}
        isFirst={currentStepIndex === 0}
        isLast={currentStepIndex === activeTutorial.steps.length - 1}
        canAdvance={canAdvance}
        actionCompleted={actionCompleted}
        onMeasure={measureCard}
        isBusy={isTutorialSaving || isTutorialEnding}
        error={tutorialError}
      />
    </>
  );
};

export default TutorialOverlay;
