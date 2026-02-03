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

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  SkipForward,
  CheckCircle,
  CheckCircle2,
  Circle,
  Target,
  Hand
} from 'lucide-react';
import { useTutorial } from '../../contexts/TutorialContext';

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

// Calculate optimal position for the instruction card
const calculateCardPosition = (targetRect, cardSize, windowSize) => {
  if (!targetRect) {
    // Center the card if no target
    return {
      position: 'center',
      top: (windowSize.height - cardSize.height) / 2,
      left: (windowSize.width - cardSize.width) / 2
    };
  }

  const { top, left, width, height, bottom, right } = targetRect;
  const padding = 20;
  const positions = [];

  // Check space below
  const spaceBelow = windowSize.height - bottom;
  if (spaceBelow >= cardSize.height + padding) {
    positions.push({
      position: 'bottom',
      top: bottom + padding,
      left: Math.max(padding, Math.min(left + width / 2 - cardSize.width / 2, windowSize.width - cardSize.width - padding)),
      score: spaceBelow
    });
  }

  // Check space above
  if (top >= cardSize.height + padding) {
    positions.push({
      position: 'top',
      top: top - cardSize.height - padding,
      left: Math.max(padding, Math.min(left + width / 2 - cardSize.width / 2, windowSize.width - cardSize.width - padding)),
      score: top
    });
  }

  // Check space to the right
  const spaceRight = windowSize.width - right;
  if (spaceRight >= cardSize.width + padding) {
    positions.push({
      position: 'right',
      top: Math.max(padding, Math.min(top + height / 2 - cardSize.height / 2, windowSize.height - cardSize.height - padding)),
      left: right + padding,
      score: spaceRight
    });
  }

  // Check space to the left
  if (left >= cardSize.width + padding) {
    positions.push({
      position: 'left',
      top: Math.max(padding, Math.min(top + height / 2 - cardSize.height / 2, windowSize.height - cardSize.height - padding)),
      left: left - cardSize.width - padding,
      score: left
    });
  }

  // Return position with most space, or default to bottom-center
  if (positions.length === 0) {
    return {
      position: 'bottom',
      top: Math.min(bottom + padding, windowSize.height - cardSize.height - padding),
      left: Math.max(padding, (windowSize.width - cardSize.width) / 2)
    };
  }

  return positions.sort((a, b) => b.score - a.score)[0];
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
  actionCompleted
}) => {
  const cardRef = useRef(null);

  return (
    <div
      ref={cardRef}
      className="fixed z-[9999] w-96 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl overflow-hidden"
      style={{
        top: position.top,
        left: position.left
      }}
    >
      {/* Header */}
      <div className="bg-baylor-green px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Target className="w-5 h-5 text-baylor-gold" />
          <span className="font-semibold">Step {stepNumber} of {totalSteps}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/20 rounded transition-colors"
          aria-label="Close tutorial"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200">
        <div
          className="h-full bg-baylor-gold transition-all duration-300"
          style={{ width: `${(stepNumber / totalSteps) * 100}%` }}
        />
      </div>

      {/* Content */}
      <div className="p-5">
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
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
        <button
          onClick={onSkip}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Skip tutorial
        </button>
        <div className="flex items-center gap-2">
          {!isFirst && (
            <button
              onClick={onPrev}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}
          <button
            onClick={onNext}
            disabled={!canAdvance}
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
    markActionCompleted
  } = useTutorial();

  const [targetRect, setTargetRect] = useState(null);
  const [targetElement, setTargetElement] = useState(null);
  const [cardPosition, setCardPosition] = useState({ top: 0, left: 0, position: 'center' });
  const cardSize = { width: 384, height: 300 }; // Approximate card dimensions

  // Calculate if user can advance to next step
  const canAdvance = !currentStep?.action || actionCompleted;

  // Find and track the target element
  const updateTargetPosition = useCallback(() => {
    if (!currentStep || !currentStep.target) {
      setTargetRect(null);
      setTargetElement(null);
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

      // Scroll element into view if needed
      const isInViewport =
        rect.top >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.left >= 0 &&
        rect.right <= window.innerWidth;

      if (!isInViewport) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center'
        });
      }
    } else {
      setTargetRect(null);
      setTargetElement(null);
    }
  }, [currentStep]);

  // Update card position when target changes
  useEffect(() => {
    const windowSize = { width: window.innerWidth, height: window.innerHeight };
    const newPosition = calculateCardPosition(targetRect, cardSize, windowSize);
    setCardPosition(newPosition);
  }, [targetRect]);

  // Track target element position
  useEffect(() => {
    if (!activeTutorial || isPaused) return;

    updateTargetPosition();

    // Update on scroll and resize
    const handleUpdate = () => {
      requestAnimationFrame(updateTargetPosition);
    };

    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    // Poll for dynamic elements that may not exist immediately
    const pollInterval = setInterval(updateTargetPosition, 500);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
      clearInterval(pollInterval);
    };
  }, [activeTutorial, currentStep, isPaused, updateTargetPosition]);

  // Listen for action completion on target element
  useEffect(() => {
    if (!currentStep?.action || !targetElement || actionCompleted) return;

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
  }, [currentStep, targetElement, actionCompleted, markActionCompleted]);

  // Keyboard navigation
  useEffect(() => {
    if (!activeTutorial) return;

    const handleKeyDown = (e) => {
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
  }, [activeTutorial, nextStep, prevStep, endTutorial]);

  // Don't render if no active tutorial or paused
  if (!activeTutorial || isPaused || !currentStep) {
    return null;
  }

  return (
    <>
      {/* Spotlight overlay */}
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
      />
    </>
  );
};

export default TutorialOverlay;
