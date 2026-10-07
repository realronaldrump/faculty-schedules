import { useState } from "react";
import { GraduationCap, Clock, Ban } from "lucide-react";
import { useAuth } from "../contexts/AuthContext.jsx";

// Shown instead of the app to signed-in accounts that are not approved, before
// any data providers mount (so unapproved accounts never request app data).
const AccountStatusScreen = () => {
  const { user, userProfile, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const isDisabled =
    userProfile?.disabled === true || userProfile?.status === "disabled";
  const Icon = isDisabled ? Ban : Clock;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="university-card w-full max-w-md animate-fade-in">
        <div className="university-header rounded-t-xl p-6 text-center">
          <div className="university-logo mx-auto mb-4">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="university-title text-center">HSD Dashboard</h1>
        </div>
        <div className="university-card-content text-center">
          <Icon className="w-10 h-10 mx-auto mb-3 text-baylor-gold" aria-hidden="true" />
          <h2 className="text-xl font-bold text-baylor-green mb-2">
            {isDisabled ? "Your account is disabled" : "Your account is awaiting approval"}
          </h2>
          <p className="text-gray-600 mb-6">
            {isDisabled
              ? "Contact the dashboard administrator if you need access again."
              : "Your request is waiting on the dashboard administrator's Accounts page. You'll have full access once it's approved."}
          </p>
          <p className="text-sm text-gray-500 mb-6">Signed in as {user?.email}</p>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountStatusScreen;
