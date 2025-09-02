import React, { useState } from 'react';
import { Shield, GraduationCap, Users, Calendar } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';

function Login({ onLogin }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, displayName.trim());
      }
      onLogin(true);
      localStorage.setItem('isAuthenticated', 'true');
    } catch (err) {
      setError(err?.message || 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
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
                <label htmlFor="email" className="form-label">
                  <Shield className="w-4 h-4 inline mr-2" />
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className={`form-input ${error ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                  placeholder="you@baylor.edu"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>

              {mode === 'signup' && (
                <div className="form-group">
                  <label htmlFor="displayName" className="form-label">Display Name</label>
                  <input
                    id="displayName"
                    name="displayName"
                    type="text"
                    className="form-input"
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={isLoading}
                    autoComplete="name"
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="password" className="form-label">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className={`form-input ${error ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                  placeholder={mode === 'signin' ? 'Enter your password' : 'Create a strong password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
                  disabled={isLoading}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
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
                disabled={isLoading || !email.trim() || !password.trim()}
                className={`btn-primary w-full justify-center ${isLoading || !email.trim() || !password.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isLoading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
                  </span>
                ) : (
                  <>
                    <Shield className="w-4 h-4 mr-2" />
                    {mode === 'signin' ? 'Sign In' : 'Create Account'}
                  </>
                )}
              </button>

              <div className="text-center text-sm text-gray-600">
                {mode === 'signin' ? (
                  <button type="button" className="text-baylor-green hover:underline" onClick={() => setMode('signup')}>
                    Need an account? Create one
                  </button>
                ) : (
                  <button type="button" className="text-baylor-green hover:underline" onClick={() => setMode('signin')}>
                    Already have an account? Sign in
                  </button>
                )}
              </div>
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