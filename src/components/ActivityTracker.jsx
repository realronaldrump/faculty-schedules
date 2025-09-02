import React, { useEffect, useRef } from 'react';
import { logActivity, logInteraction, ACTIVITY_TYPES } from '../utils/activityLogger';

/**
 * ActivityTracker Higher-Order Component
 *
 * Automatically tracks user interactions within wrapped components
 * Captures clicks, form submissions, navigation, and other events
 */
export const withActivityTracking = (WrappedComponent, componentName, options = {}) => {
  return React.forwardRef((props, ref) => {
    const componentRef = useRef(null);
    const startTimeRef = useRef(Date.now());

    // Track component mount
    useEffect(() => {
      logActivity({
        type: ACTIVITY_TYPES.FEATURE_USAGE,
        action: `Viewed ${componentName} component`,
        component: componentName,
        metadata: {
          props: Object.keys(props).filter(key => !key.startsWith('_')),
          options: options
        }
      });

      // Track time spent on component
      const trackTimeSpent = () => {
        const timeSpent = Date.now() - startTimeRef.current;
        logActivity({
          type: ACTIVITY_TYPES.TIME_SPENT,
          action: `Spent ${Math.round(timeSpent / 1000)}s on ${componentName}`,
          component: componentName,
          metadata: {
            timeSpentMs: timeSpent,
            timeSpentSeconds: Math.round(timeSpent / 1000)
          }
        });
      };

      return trackTimeSpent;
    }, [componentName]);

    // Track component unmount
    useEffect(() => {
      return () => {
        const timeSpent = Date.now() - startTimeRef.current;
        logActivity({
          type: ACTIVITY_TYPES.TIME_SPENT,
          action: `Left ${componentName} component after ${Math.round(timeSpent / 1000)}s`,
          component: componentName,
          metadata: {
            timeSpentMs: timeSpent,
            timeSpentSeconds: Math.round(timeSpent / 1000)
          }
        });
      };
    }, [componentName]);

    // Set up event listeners for user interactions
    useEffect(() => {
      const element = componentRef.current;
      if (!element) return;

      const handleClick = (event) => {
        const target = event.target;

        // Get element information
        const elementInfo = getElementInfo(target);

        // Skip tracking for certain elements
        if (shouldSkipElement(target, options.skipSelectors)) {
          return;
        }

        logInteraction(
          elementInfo.identifier,
          `Clicked ${elementInfo.type} in ${componentName}`,
          {
            elementType: elementInfo.type,
            elementText: elementInfo.text,
            elementId: elementInfo.id,
            elementClass: elementInfo.className,
            component: componentName,
            clickPosition: {
              x: event.clientX,
              y: event.clientY
            }
          }
        );
      };

      const handleFormSubmit = (event) => {
        const form = event.target;
        const formInfo = getFormInfo(form);

        logActivity({
          type: ACTIVITY_TYPES.FORM_SUBMIT,
          action: `Submitted form in ${componentName}`,
          component: componentName,
          element: formInfo.identifier,
          metadata: {
            formId: formInfo.id,
            formName: formInfo.name,
            formAction: formInfo.action,
            fieldCount: formInfo.fieldCount,
            component: componentName
          }
        });
      };

      const handleInputFocus = (event) => {
        const input = event.target;
        if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA' || input.tagName === 'SELECT') {
          logActivity({
            type: ACTIVITY_TYPES.FEATURE_USAGE,
            action: `Focused on ${input.type || input.tagName.toLowerCase()} field`,
            component: componentName,
            element: input.name || input.id || input.placeholder || 'input_field',
            metadata: {
              inputType: input.type,
              inputName: input.name,
              inputId: input.id,
              placeholder: input.placeholder,
              component: componentName
            }
          });
        }
      };

      const handleScroll = (event) => {
        // Throttle scroll events to avoid too many logs
        if (!handleScroll.lastScroll || Date.now() - handleScroll.lastScroll > 1000) {
          logActivity({
            type: ACTIVITY_TYPES.FEATURE_USAGE,
            action: `Scrolled in ${componentName}`,
            component: componentName,
            metadata: {
              scrollTop: element.scrollTop,
              scrollHeight: element.scrollHeight,
              clientHeight: element.clientHeight,
              component: componentName
            }
          });
          handleScroll.lastScroll = Date.now();
        }
      };

      // Attach event listeners
      element.addEventListener('click', handleClick, true);
      element.addEventListener('submit', handleFormSubmit, true);
      element.addEventListener('focusin', handleInputFocus, true);
      element.addEventListener('scroll', handleScroll, true);

      // Cleanup
      return () => {
        element.removeEventListener('click', handleClick, true);
        element.removeEventListener('submit', handleFormSubmit, true);
        element.removeEventListener('focusin', handleInputFocus, true);
        element.removeEventListener('scroll', handleScroll, true);
      };
    }, [componentName, options.skipSelectors]);

    // Combine refs
    const combinedRef = useCombinedRefs(ref, componentRef);

    return (
      <div ref={combinedRef} data-activity-component={componentName}>
        <WrappedComponent {...props} />
      </div>
    );
  });
};

/**
 * Hook to combine multiple refs
 */
function useCombinedRefs(...refs) {
  const targetRef = useRef();

  useEffect(() => {
    refs.forEach(ref => {
      if (!ref) return;

      if (typeof ref === 'function') {
        ref(targetRef.current);
      } else {
        ref.current = targetRef.current;
      }
    });
  }, [refs]);

  return targetRef;
}

/**
 * Get information about a DOM element for activity logging
 */
function getElementInfo(element) {
  const tagName = element.tagName?.toLowerCase();
  const type = element.type || '';
  const id = element.id || '';
  const className = element.className || '';
  const textContent = element.textContent?.trim() || '';
  const innerText = element.innerText?.trim() || '';

  // Determine element type
  let elementType = tagName;
  if (tagName === 'input') {
    elementType = `${type}_input`;
  } else if (tagName === 'button') {
    elementType = 'button';
  } else if (tagName === 'a') {
    elementType = 'link';
  } else if (tagName === 'select') {
    elementType = 'dropdown';
  }

  // Create identifier
  let identifier = id || className.split(' ')[0] || '';
  if (!identifier && textContent) {
    identifier = textContent.substring(0, 50).replace(/\s+/g, '_').toLowerCase();
  }
  if (!identifier) {
    identifier = `${tagName}_${Math.random().toString(36).substr(2, 5)}`;
  }

  return {
    identifier,
    type: elementType,
    text: innerText || textContent,
    id,
    className,
    tagName
  };
}

/**
 * Get information about a form element
 */
function getFormInfo(form) {
  const inputs = form.querySelectorAll('input, textarea, select');
  const fieldCount = inputs.length;

  return {
    identifier: form.id || form.name || form.className?.split(' ')[0] || 'form',
    id: form.id,
    name: form.name,
    action: form.action,
    method: form.method,
    fieldCount
  };
}

/**
 * Determine if an element should be skipped from tracking
 */
function shouldSkipElement(element, skipSelectors = []) {
  if (!element) return true;

  // Default selectors to skip
  const defaultSkipSelectors = [
    '[data-activity-skip]',
    '.activity-skip',
    'script',
    'style',
    'meta',
    'link',
    'noscript'
  ];

  const allSkipSelectors = [...defaultSkipSelectors, ...(skipSelectors || [])];

  // Check if element matches any skip selector
  for (const selector of allSkipSelectors) {
    if (element.matches && element.matches(selector)) {
      return true;
    }

    // Check parent elements too
    let parent = element.parentElement;
    while (parent) {
      if (parent.matches && parent.matches(selector)) {
        return true;
      }
      parent = parent.parentElement;
    }
  }

  return false;
}

/**
 * Activity Button Component - Automatically tracks button clicks
 */
export const ActivityButton = React.forwardRef(({
  onClick,
  children,
  activityLabel,
  activityMetadata = {},
  ...props
}, ref) => {
  const handleClick = (event) => {
    // Log the activity
    logInteraction(
      activityLabel || props.id || props.name || 'button',
      `Clicked button: ${activityLabel || children?.toString() || 'Button'}`,
      {
        buttonText: children?.toString(),
        buttonId: props.id,
        buttonName: props.name,
        ...activityMetadata
      }
    );

    // Call original onClick
    if (onClick) {
      onClick(event);
    }
  };

  return (
    <button
      ref={ref}
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  );
});

ActivityButton.displayName = 'ActivityButton';

/**
 * Activity Link Component - Automatically tracks link clicks
 */
export const ActivityLink = React.forwardRef(({
  onClick,
  href,
  children,
  activityLabel,
  activityMetadata = {},
  ...props
}, ref) => {
  const handleClick = (event) => {
    // Log the navigation
    logActivity({
      type: ACTIVITY_TYPES.NAVIGATION,
      action: `Clicked link to ${href || 'unknown'}`,
      element: activityLabel || href || 'link',
      metadata: {
        destination: href,
        linkText: children?.toString(),
        ...activityMetadata
      }
    });

    // Call original onClick
    if (onClick) {
      onClick(event);
    }
  };

  return (
    <a
      ref={ref}
      onClick={handleClick}
      href={href}
      {...props}
    >
      {children}
    </a>
  );
});

ActivityLink.displayName = 'ActivityLink';

/**
 * Activity Form Component - Automatically tracks form submissions
 */
export const ActivityForm = React.forwardRef(({
  onSubmit,
  children,
  activityLabel,
  activityMetadata = {},
  ...props
}, ref) => {
  const handleSubmit = (event) => {
    // Log the form submission
    logActivity({
      type: ACTIVITY_TYPES.FORM_SUBMIT,
      action: `Submitted form: ${activityLabel || props.name || 'Form'}`,
      element: activityLabel || props.name || props.id || 'form',
      metadata: {
        formName: props.name,
        formId: props.id,
        ...activityMetadata
      }
    });

    // Call original onSubmit
    if (onSubmit) {
      onSubmit(event);
    }
  };

  return (
    <form
      ref={ref}
      onSubmit={handleSubmit}
      {...props}
    >
      {children}
    </form>
  );
});

ActivityForm.displayName = 'ActivityForm';

/**
 * Hook to manually log activities from functional components
 */
export const useActivityLogger = () => {
  return {
    logActivity,
    logInteraction,
    ACTIVITY_TYPES
  };
};

export default {
  withActivityTracking,
  ActivityButton,
  ActivityLink,
  ActivityForm,
  useActivityLogger
};
