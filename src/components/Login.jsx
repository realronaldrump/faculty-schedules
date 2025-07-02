import React, { useState } from 'react';
import { Shield, GraduationCap, Users, Calendar } from 'lucide-react';

function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Simulate a small delay for better UX
    await new Promise(resolve => setTimeout(resolve, 800));

    if (password === 'baylorFall2025_hsd') {
      onLogin(true);
      localStorage.setItem('isAuthenticated', 'true');
    } else {
      setError('Incorrect password. Please try again.');
      setPassword('');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center px-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-baylor-green/5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-baylor-gold/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-md">
        {/* University Header Card */}
        <div className="university-card mb-6 animate-fade-in">
          <div className="university-header rounded-t-xl p-6">
            <div className="text-center">
              <div className="university-logo mx-auto mb-4">
                <GraduationCap className="w-8 h-8 text-white" />
              </div>
              <h1 className="university-title text-center">Baylor University</h1>
              <p className="university-subtitle text-center">Human Sciences & Design</p>
            </div>
          </div>
          
          <div className="university-card-content">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-baylor-green mb-2">
                Faculty System Access
              </h2>
              <p className="text-gray-600 mb-6">
                Secure login required for faculty schedule management
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="form-group">
                <label htmlFor="password" className="form-label">
                  <Shield className="w-4 h-4 inline mr-2" />
                  Access Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className={`form-input ${
                    error ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''
                  }`}
                  placeholder="Enter system password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                {error && (
                  <div className="form-error animate-shake flex items-center">
                    <span className="w-4 h-4 mr-1">⚠️</span>
                    {error}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading || !password.trim()}
                className={`btn-primary w-full justify-center ${
                  isLoading || !password.trim() ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isLoading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Authenticating...
                  </span>
                ) : (
                  <>
                    <Shield className="w-4 h-4 mr-2" />
                    Access System
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* System Information Card */}
        <div className="university-card animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="university-card-content">
            <h3 className="text-lg font-semibold text-baylor-green mb-4 text-center">
              System Features
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <Users className="w-5 h-5 text-baylor-green flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Faculty Directory</p>
                  <p className="text-xs text-gray-600">Comprehensive faculty information</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <Calendar className="w-5 h-5 text-baylor-green flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Schedule Management</p>
                  <p className="text-xs text-gray-600">Course and room scheduling tools</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <Shield className="w-5 h-5 text-baylor-green flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Secure Access</p>
                  <p className="text-xs text-gray-600">Protected university data</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-gray-500">
          <p>© 2024 Baylor University - Human Sciences & Design</p>
          <p className="mt-1">Authorized personnel only</p>
        </div>
      </div>
    </div>
  );
}

export default Login; 