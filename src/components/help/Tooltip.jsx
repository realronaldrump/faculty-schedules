/**
 * Tooltip - Reusable tooltip component for contextual help
 *
 * Features:
 * - Multiple positions (top, bottom, left, right)
 * - Optional "learn more" link to tutorials
 * - Dismissible hints
 * - Respects user tooltip preferences
 */

import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, X, BookOpen, Info, AlertCircle, Lightbulb } from 'lucide-react';
import { useTutorial } from '../../contexts/TutorialContext';

// Icon variants for different tooltip types
const iconVariants = {
  help: HelpCircle,
  info: Info,
  warning: AlertCircle,
  tip: Lightbulb
};

// Style variants
const styleVariants = {
  help: {
    icon: 'text-gray-400 hover:text-baylor-green',
    tooltip: 'bg-gray-900 text-white',
    arrow: 'border-gray-900'
  },
  info: {
    icon: 'text-blue-400 hover:text-blue-600',
    tooltip: 'bg-blue-900 text-white',
    arrow: 'border-blue-900'
  },
  warning: {
    icon: 'text-amber-500 hover:text-amber-600',
    tooltip: 'bg-amber-600 text-white',
    arrow: 'border-amber-600'
  },
  tip: {
    icon: 'text-baylor-gold hover:text-baylor-gold/80',
    tooltip: 'bg-baylor-green text-white',
    arrow: 'border-baylor-green'
  }
};

/**
 * Basic Tooltip component
 * Appears on hover/focus
 */
export const Tooltip = ({
  content,
  children,
  position = 'top',
  variant = 'help',
  maxWidth = 250,
  delay = 200
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const timeoutRef = useRef(null);
  const { showTooltips } = useTutorial();

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  // Calculate position
  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const trigger = triggerRef.current.getBoundingClientRect();
      const tooltip = tooltipRef.current.getBoundingClientRect();
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;

      let x, y;

      switch (position) {
        case 'top':
          x = trigger.left + scrollX + trigger.width / 2 - tooltip.width / 2;
          y = trigger.top + scrollY - tooltip.height - 8;
          break;
        case 'bottom':
          x = trigger.left + scrollX + trigger.width / 2 - tooltip.width / 2;
          y = trigger.bottom + scrollY + 8;
          break;
        case 'left':
          x = trigger.left + scrollX - tooltip.width - 8;
          y = trigger.top + scrollY + trigger.height / 2 - tooltip.height / 2;
          break;
        case 'right':
          x = trigger.right + scrollX + 8;
          y = trigger.top + scrollY + trigger.height / 2 - tooltip.height / 2;
          break;
        default:
          x = trigger.left + scrollX;
          y = trigger.bottom + scrollY + 8;
      }

      // Keep tooltip within viewport
      const padding = 8;
      x = Math.max(padding, Math.min(x, window.innerWidth - tooltip.width - padding));
      y = Math.max(padding + scrollY, y);

      setCoords({ x, y });
    }
  }, [isVisible, position]);

  const styles = styleVariants[variant];
  const arrowPositionClasses = {
    top: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'top-0 left-1/2 -translate-x-1/2 -translate-y-full border-l-transparent border-r-transparent border-t-transparent',
    left: 'right-0 top-1/2 -translate-y-1/2 translate-x-full border-t-transparent border-b-transparent border-r-transparent',
    right: 'left-0 top-1/2 -translate-y-1/2 -translate-x-full border-t-transparent border-b-transparent border-l-transparent'
  };

  if (!showTooltips) {
    return children || null;
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
        className="inline-flex items-center"
        tabIndex={0}
      >
        {children}
      </span>
      {isVisible && (
        <div
          ref={tooltipRef}
          className={`fixed z-[9999] px-3 py-2 text-sm rounded-lg shadow-lg ${styles.tooltip}`}
          style={{
            left: coords.x,
            top: coords.y,
            maxWidth: maxWidth
          }}
          role="tooltip"
        >
          {content}
          <span
            className={`absolute w-0 h-0 border-4 ${styles.arrow} ${arrowPositionClasses[position]}`}
          />
        </div>
      )}
    </>
  );
};

/**
 * HelpTooltip - Icon-based help tooltip
 * Shows a help icon that reveals tooltip on hover
 */
export const HelpTooltip = ({
  content,
  position = 'top',
  variant = 'help',
  size = 16,
  className = ''
}) => {
  const { showTooltips } = useTutorial();
  const Icon = iconVariants[variant];
  const styles = styleVariants[variant];

  if (!showTooltips) {
    return null;
  }

  return (
    <Tooltip content={content} position={position} variant={variant}>
      <Icon
        size={size}
        className={`cursor-help transition-colors ${styles.icon} ${className}`}
      />
    </Tooltip>
  );
};

/**
 * HintBanner - Dismissible hint/tip banner
 * Shows contextual help that users can dismiss
 */
export const HintBanner = ({
  hintId,
  title,
  content,
  variant = 'tip',
  tutorialId,
  onStartTutorial
}) => {
  const { showTooltips, isHintDismissed, dismissHint, startTutorial } = useTutorial();

  if (!showTooltips || isHintDismissed(hintId)) {
    return null;
  }

  const Icon = iconVariants[variant];

  const handleStartTutorial = () => {
    if (tutorialId) {
      if (onStartTutorial) {
        onStartTutorial(tutorialId);
      } else {
        startTutorial(tutorialId);
      }
    }
  };

  const bannerStyles = {
    help: 'bg-gray-50 border-gray-200 text-gray-700',
    info: 'bg-blue-50 border-blue-200 text-blue-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    tip: 'bg-baylor-green/5 border-baylor-green/20 text-gray-700'
  };

  const iconStyles = {
    help: 'bg-gray-100 text-gray-500',
    info: 'bg-blue-100 text-blue-600',
    warning: 'bg-amber-100 text-amber-600',
    tip: 'bg-baylor-green/10 text-baylor-green'
  };

  return (
    <div className={`relative flex items-start gap-3 p-4 rounded-lg border ${bannerStyles[variant]}`}>
      <div className={`p-2 rounded-lg flex-shrink-0 ${iconStyles[variant]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        {title && <h4 className="font-medium mb-1">{title}</h4>}
        <p className="text-sm">{content}</p>
        {tutorialId && (
          <button
            onClick={handleStartTutorial}
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-baylor-green hover:underline"
          >
            <BookOpen className="w-4 h-4" />
            Learn more in tutorial
          </button>
        )}
      </div>
      <button
        onClick={() => dismissHint(hintId)}
        className="flex-shrink-0 p-1 rounded hover:bg-black/5 transition-colors"
        aria-label="Dismiss hint"
      >
        <X className="w-4 h-4 text-gray-400" />
      </button>
    </div>
  );
};

/**
 * FeatureHighlight - Highlights new or important features
 */
export const FeatureHighlight = ({
  featureId,
  title,
  description,
  children,
  position = 'bottom'
}) => {
  const { showTooltips, isHintDismissed, dismissHint } = useTutorial();
  const [isVisible, setIsVisible] = useState(true);

  if (!showTooltips || isHintDismissed(featureId) || !isVisible) {
    return children;
  }

  return (
    <div className="relative inline-block">
      {children}
      <div
        className={`absolute z-50 w-64 p-4 bg-baylor-green text-white rounded-lg shadow-xl ${
          position === 'bottom' ? 'top-full mt-2 left-1/2 -translate-x-1/2' :
          position === 'top' ? 'bottom-full mb-2 left-1/2 -translate-x-1/2' :
          position === 'left' ? 'right-full mr-2 top-1/2 -translate-y-1/2' :
          'left-full ml-2 top-1/2 -translate-y-1/2'
        }`}
      >
        <div className="flex items-start justify-between mb-2">
          <h4 className="font-semibold flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-baylor-gold" />
            {title}
          </h4>
          <button
            onClick={() => {
              dismissHint(featureId);
              setIsVisible(false);
            }}
            className="p-0.5 hover:bg-white/20 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-white/90">{description}</p>
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => {
              dismissHint(featureId);
              setIsVisible(false);
            }}
            className="text-sm font-medium text-baylor-gold hover:text-white transition-colors"
          >
            Got it!
          </button>
        </div>
        {/* Arrow */}
        <div
          className={`absolute w-3 h-3 bg-baylor-green transform rotate-45 ${
            position === 'bottom' ? '-top-1.5 left-1/2 -translate-x-1/2' :
            position === 'top' ? '-bottom-1.5 left-1/2 -translate-x-1/2' :
            position === 'left' ? '-right-1.5 top-1/2 -translate-y-1/2' :
            '-left-1.5 top-1/2 -translate-y-1/2'
          }`}
        />
      </div>
    </div>
  );
};

export default Tooltip;
