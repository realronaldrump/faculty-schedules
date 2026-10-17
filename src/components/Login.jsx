import { useState } from 'react';
import { AlertCircle, GraduationCap, Loader2, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';

function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Email/password sign-in and sign-up errors, in plain language. Anything else
  // gets a general message rather than raw Firebase text.
  const getFriendlyErrorMessage = (error) => {
    const errorMappings = {
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/user-disabled': 'This account has been disabled. Please contact support.',
      'auth/user-not-found': 'No account found with this email address.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/invalid-login-credentials': 'Invalid email or password.',
      'auth/missing-password': 'Please enter your password.',
      'auth/missing-email': 'Please enter your email address.',
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password': 'Password should be at least 6 characters long.',
      'auth/password-does-not-meet-requirements': 'Password does not meet security requirements.',
      'auth/too-many-requests': 'Too many failed attempts. Please wait a few minutes and try again.',
      'auth/network-request-failed': 'Network error. Please check your internet connection.',
      'auth/operation-not-allowed': 'This sign-in method is not enabled. Please contact support.',
      'auth/quota-exceeded': 'Service temporarily unavailable. Please try again later.',
    };

    const message = String(error?.message || '');
    const code = error?.code || Object.keys(errorMappings).find((key) => message.includes(key));
    return errorMappings[code] || 'Something went wrong. Please try again.';
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
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
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
                HSD Dashboard Access
              </h2>
              <p className="text-gray-600 mb-6 max-w-sm mx-auto">
                Sign in to manage schedules, people records, spaces, and department workflows.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="form-group">
                <label htmlFor="email" className="form-label">
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
                  <div className="form-error animate-shake flex items-center gap-1.5" role="alert">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {error}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading || !email.trim() || !password.trim()}
                className={`btn-primary w-full gap-2 ${isLoading || !email.trim() || !password.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {mode === 'signin' ? 'Signing in…' : 'Creating account…'}
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
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

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-gray-500">
          <p>© {new Date().getFullYear()} Baylor University – Human Sciences & Design</p>
          <p className="mt-1">Authorized users only</p>
        </div>
      </div>
    </div>
  );
}

export default Login; 
