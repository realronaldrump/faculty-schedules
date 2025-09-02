import React from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';

const ProtectedContent = ({ pageId, children }) => {
  const { loading, user, canAccess } = useAuth();

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

  if (!canAccess(pageId)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-700">You do not have access to this page. Contact an administrator.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedContent;


