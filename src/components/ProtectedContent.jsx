import React from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';

const ProtectedContent = ({ pageId, children }) => {
  const { loading, user, canAccess, isAdmin, isPending, isDisabled } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="loading-shimmer w-16 h-16 rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading permissions...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-700">Please sign in to continue.</p>
        </div>
      </div>
    );
  }

  if (!isAdmin && isPending) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center max-w-md">
          <p className="text-gray-700 font-medium mb-2">
            Your account is awaiting approval.
          </p>
          <p className="text-gray-600 text-sm">
            An administrator must approve your account and assign a role before
            you can access the system.
          </p>
        </div>
      </div>
    );
  }

  if (!isAdmin && isDisabled) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center max-w-md">
          <p className="text-gray-700 font-medium mb-2">
            Your account has been disabled.
          </p>
          <p className="text-gray-600 text-sm">
            Please contact an administrator if you believe this is a mistake.
          </p>
        </div>
      </div>
    );
  }

  if (!canAccess(pageId)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-700">You do not have access to this page. Please contact Davis (davis_deaton1@baylor.edu) to request access.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedContent;

