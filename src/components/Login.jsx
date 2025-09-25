import React, { useState } from 'react';
import { Shield, GraduationCap, Users, Calendar, BarChart3, MapPin, Database } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';

function Login({ onLogin }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Transform Firebase error messages into user-friendly messages
  const getFriendlyErrorMessage = (error) => {
    const message = error?.message || error?.toString() || 'An unexpected error occurred';

    // Remove Firebase prefix if present
    const cleanMessage = message.replace(/^Firebase: /i, '').replace(/^Error: /i, '');

    // Map common Firebase auth error codes to friendly messages
    const errorMappings = {
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/user-disabled': 'This account has been disabled. Please contact support.',
      'auth/user-not-found': 'No account found with this email address.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password': 'Password should be at least 6 characters long.',
      'auth/network-request-failed': 'Network error. Please check your internet connection.',
      'auth/too-many-requests': 'Too many failed attempts. Please wait a few minutes and try again.',
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/invalid-login-credentials': 'Invalid email or password.',
      'auth/missing-password': 'Please enter your password.',
      'auth/missing-email': 'Please enter your email address.',
      'auth/operation-not-allowed': 'This sign-in method is not enabled. Please contact support.',
      'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
      'auth/requires-recent-login': 'Please sign in again to complete this action.',
      'auth/expired-action-code': 'This link has expired. Please request a new one.',
      'auth/invalid-action-code': 'This link is invalid. Please request a new one.',
      'auth/password-does-not-meet-requirements': 'Password does not meet security requirements.',
      'auth/invalid-verification-id': 'Invalid verification ID.',
      'auth/missing-verification-code': 'Please enter the verification code.',
      'auth/quota-exceeded': 'Service temporarily unavailable. Please try again later.',
      'auth/maximum-second-factor-count-exceeded': 'Maximum number of second factors exceeded.',
      'auth/second-factor-already-in-use': 'This second factor is already in use.',
      'auth/unsupported-first-factor': 'Unsupported first factor.',
      'auth/unverified-email': 'Please verify your email address first.',
      'auth/missing-continue-uri': 'Missing continue URI.',
      'auth/invalid-continue-uri': 'Invalid continue URI.',
      'auth/unauthorized-continue-uri': 'Unauthorized continue URI.',
      'auth/missing-ios-bundle-id': 'Missing iOS bundle ID.',
      'auth/missing-android-pkg-name': 'Missing Android package name.',
      'auth/invalid-dynamic-link-domain': 'Invalid dynamic link domain.',
      'auth/argument-error': 'Invalid argument provided.',
      'auth/app-deleted': 'This app has been deleted.',
      'auth/app-not-authorized': 'This app is not authorized.',
      'auth/captcha-check-failed': 'CAPTCHA verification failed.',
      'auth/code-expired': 'Code has expired.',
      'auth/cordova-not-ready': 'Cordova is not ready.',
      'auth/cors-unsupported': 'CORS is not supported.',
      'auth/credential-already-in-use': 'This credential is already associated with another account.',
      'auth/custom-token-mismatch': 'Custom token mismatch.',
      'auth/dependent-sdk-initialized-before-auth': 'Dependent SDK initialized before Auth.',
      'auth/dynamic-link-not-activated': 'Dynamic link not activated.',
      'auth/email-change-needs-verification': 'Email change needs verification.',
      'auth/emulator-config-failed': 'Emulator configuration failed.',
      'auth/invalid-api-key': 'Invalid API key.',
      'auth/invalid-cert-hash': 'Invalid certificate hash.',
      'auth/invalid-custom-token': 'Invalid custom token.',
      'auth/invalid-message-payload': 'Invalid message payload.',
      'auth/invalid-multi-factor-session': 'Invalid multi-factor session.',
      'auth/invalid-oauth-provider': 'Invalid OAuth provider.',
      'auth/invalid-phone-number': 'Invalid phone number.',
      'auth/invalid-photo-url': 'Invalid photo URL.',
      'auth/invalid-provider-id': 'Invalid provider ID.',
      'auth/invalid-recipient-email': 'Invalid recipient email.',
      'auth/invalid-sender': 'Invalid sender.',
      'auth/invalid-verification-code': 'Invalid verification code.',
      'auth/missing-app-credential': 'Missing app credential.',
      'auth/missing-client-type': 'Missing client type.',
      'auth/missing-iframe-start': 'Missing iframe start.',
      'auth/missing-multi-factor-info': 'Missing multi-factor info.',
      'auth/missing-multi-factor-session': 'Missing multi-factor session.',
      'auth/missing-or-invalid-nonce': 'Missing or invalid nonce.',
      'auth/missing-phone-number': 'Missing phone number.',
      'auth/missing-verification-id': 'Missing verification ID.',
      'auth/multi-factor-info-not-found': 'Multi-factor info not found.',
      'auth/multi-factor-auth-required': 'Multi-factor authentication required.',
      'auth/no-auth-event': 'No auth event.',
      'auth/no-such-provider': 'No such provider.',
      'auth/null-user': 'Null user.',
      'auth/provider-already-linked': 'Provider already linked.',
      'auth/redirect-cancelled-by-user': 'Redirect cancelled by user.',
      'auth/redirect-operation-pending': 'Redirect operation pending.',
      'auth/rejected-credential': 'Rejected credential.',
      'auth/second-factor-limit-exceeded': 'Second factor limit exceeded.',
      'auth/tenant-id-mismatch': 'Tenant ID mismatch.',
      'auth/timeout': 'Timeout.',
      'auth/unsupported-persistence-type': 'Unsupported persistence type.',
      'auth/unsupported-tenant-operation': 'Unsupported tenant operation.',
      'auth/user-cancelled': 'User cancelled.',
      'auth/user-mismatch': 'User mismatch.',
      'auth/user-signed-out': 'User signed out.',
      'auth/user-token-expired': 'User token expired.',
      'auth/user-token-revoked': 'User token revoked.',
      'auth/web-storage-unsupported': 'Web storage unsupported.'
    };

    // Check for error code in the message
    for (const [code, friendlyMessage] of Object.entries(errorMappings)) {
      if (cleanMessage.includes(code) || error?.code === code) {
        return friendlyMessage;
      }
    }

    // If no specific mapping found, try to clean up the message
    if (cleanMessage.includes('password') && cleanMessage.includes('6')) {
      return 'Password should be at least 6 characters long.';
    }

    if (cleanMessage.includes('email') && cleanMessage.includes('invalid')) {
      return 'Please enter a valid email address.';
    }

    if (cleanMessage.includes('network') || cleanMessage.includes('connection')) {
      return 'Network error. Please check your internet connection.';
    }

    if (cleanMessage.includes('too many') || cleanMessage.includes('attempts')) {
      return 'Too many failed attempts. Please wait a few minutes and try again.';
    }

    // Return the cleaned message if it's reasonably short, otherwise use a generic message
    if (cleanMessage.length < 100 && cleanMessage.length > 0) {
      return cleanMessage.charAt(0).toUpperCase() + cleanMessage.slice(1);
    }

    return 'Authentication failed. Please try again.';
  };

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
      setError(getFriendlyErrorMessage(err));
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
                  placeholder="Email Address"
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
                  <p className="text-sm font-medium text-gray-900">Advanced Faculty Management</p>
                  <p className="text-xs text-gray-600">Comprehensive faculty directory with contact cards and program assignments</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <Calendar className="w-5 h-5 text-baylor-green flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Intelligent Scheduling System</p>
                  <p className="text-xs text-gray-600">Multi-semester course scheduling with room assignments and conflict detection</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <MapPin className="w-5 h-5 text-baylor-green flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Room & Resource Management</p>
                  <p className="text-xs text-gray-600">Building directory, room grids, and availability tracking with capacity data</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <BarChart3 className="w-5 h-5 text-baylor-green flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Department Analytics</p>
                  <p className="text-xs text-gray-600">Real-time insights on faculty workload, room utilization, and course distribution</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <Database className="w-5 h-5 text-baylor-green flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Smart Data Import/Export</p>
                  <p className="text-xs text-gray-600">CLSS integration, CRN migration, data deduplication, and transaction rollback</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <Shield className="w-5 h-5 text-baylor-green flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Access Control & Audit</p>
                  <p className="text-xs text-gray-600">Role-based permissions with comprehensive change logging and activity tracking</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-gray-500">
          <p>© 2025 Baylor University - Human Sciences & Design</p>
          <p className="mt-1">Authorized HSD Faculty and Staff only</p>
        </div>
      </div>
    </div>
  );
}

export default Login; 