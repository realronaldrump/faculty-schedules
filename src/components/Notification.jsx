import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info, Shield } from 'lucide-react';

const Notification = ({ show, type, title, message, onClose }) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  if (!show) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-600" />;
      default:
        return <Shield className="w-5 h-5 text-baylor-green" />;
    }
  };

  const getNotificationClass = () => {
    const baseClass = 'notification animate-slide-down';
    switch (type) {
      case 'success':
        return `${baseClass} notification-success`;
      case 'error':
        return `${baseClass} notification-error`;
      case 'warning':
        return `${baseClass} notification-warning`;
      case 'info':
        return `${baseClass} notification-info`;
      default:
        return `${baseClass} border-l-4 border-baylor-green`;
    }
  };

  return (
    <div className={getNotificationClass()}>
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            {getIcon()}
          </div>
          <div className="ml-3 flex-1">
            {title && (
              <h4 className="text-sm font-semibold text-gray-900 mb-1">
                {title}
              </h4>
            )}
            {message && (
              <p className="text-sm text-gray-600">
                {message}
              </p>
            )}
          </div>
          <div className="ml-4 flex-shrink-0">
            <button
              onClick={onClose}
              className="inline-flex text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notification; 