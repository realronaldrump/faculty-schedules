import React from 'react';
import { X, Shield, Mail, User } from 'lucide-react';

const ViewerAccessModal = ({ isOpen, onClose, user }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>

      {/* Modal Content */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
              <Shield className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Limited Access</h2>
              <p className="text-sm text-gray-600">Viewer Account</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* User Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <User className="w-5 h-5 text-gray-500" />
              <div>
                <p className="font-medium text-gray-900">{user?.displayName || user?.email}</p>
                <p className="text-sm text-gray-600">Viewer Role</p>
              </div>
            </div>
          </div>

          {/* Access Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Current Access Level</h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                You currently have <strong>viewer access</strong> to the Faculty Schedules application.
                This gives you access to the dashboard only, where you can view system information and recent changes.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">What you can access:</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  <span>Dashboard with system metrics</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  <span>Recent changes log</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  <span>Basic system information</span>
                </li>
              </ul>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-medium text-red-900 mb-2">What you cannot access:</h4>
              <ul className="text-sm text-red-800 space-y-1">
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                  <span>Schedule management and editing</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                  <span>Faculty and staff directories</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                  <span>Data import and administration tools</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                  <span>Room scheduling and availability</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                  <span>Analytics and reporting</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Contact Information */}
          <div className="bg-baylor-green/5 border border-baylor-green/20 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <Mail className="w-5 h-5 text-baylor-green mt-0.5" />
              <div>
                <h4 className="font-semibold text-baylor-green mb-1">Need More Access?</h4>
                <p className="text-sm text-gray-700 mb-2">
                  To get additional permissions or upgrade your role, please contact:
                </p>
                <div className="bg-white rounded border p-3">
                  <p className="font-medium text-gray-900">Davis Deaton</p>
                  <p className="text-sm text-gray-600">davis_deaton1@baylor.edu</p>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  Include your name, email, and what access you need in your request.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors font-medium"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViewerAccessModal;
