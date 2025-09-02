// Example: How to integrate activity tracking into your components

import React from 'react';
import { logActivity, logInteraction, logPageView, ACTIVITY_TYPES } from '../utils/activityLogger';
import { withActivityTracking, ActivityButton, ActivityLink } from './ActivityTracker';

const ExampleComponent = () => {
  // Manual activity logging
  const handleManualLog = () => {
    logActivity({
      type: ACTIVITY_TYPES.BUTTON_CLICK,
      action: 'Clicked custom action button',
      element: 'custom_action_button',
      metadata: {
        buttonType: 'primary',
        context: 'example_component'
      }
    });
  };

  // Page view logging (call this when component mounts)
  React.useEffect(() => {
    logPageView('example-component', {
      component: 'ExampleComponent',
      purpose: 'demonstration'
    });
  }, []);

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-bold">Activity Tracking Examples</h2>

      {/* Regular button with manual tracking */}
      <button
        onClick={handleManualLog}
        className="px-4 py-2 bg-blue-500 text-white rounded"
      >
        Manual Activity Log
      </button>

      {/* Activity-tracked button */}
      <ActivityButton
        onClick={() => console.log('Activity button clicked')}
        className="px-4 py-2 bg-green-500 text-white rounded ml-4"
        activityLabel="example_activity_button"
        activityMetadata={{ example: true }}
      >
        Activity Button
      </ActivityButton>

      {/* Activity-tracked link */}
      <ActivityLink
        href="/dashboard"
        className="text-blue-600 underline ml-4"
        activityLabel="dashboard_link"
      >
        Go to Dashboard
      </ActivityLink>
    </div>
  );
};

// HOC-wrapped component (automatically tracks all interactions)
const TrackedExampleComponent = withActivityTracking(ExampleComponent, 'ExampleComponent', {
  skipSelectors: ['.skip-tracking'] // Optional: skip certain elements
});

export default TrackedExampleComponent;
