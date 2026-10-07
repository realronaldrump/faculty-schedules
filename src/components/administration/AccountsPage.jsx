import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { Ban, CheckCircle2, RotateCcw } from "lucide-react";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useUI } from "../../contexts/UIContext";
import { logUpdate } from "../../utils/changeLogger";
import { toDate } from "../../utils/activityAnalytics";
import { isOwnerUid } from "../../utils/owner";
import PageHeader from "../shared/PageHeader";
import Badge from "../shared/Badge";
import ConfirmDialog from "../shared/ConfirmDialog";

const STATUS_ORDER = { pending: 0, active: 1, disabled: 2 };
const STATUS_TONES = { pending: "warning", active: "success", disabled: "muted" };
const STATUS_LABELS = { pending: "Awaiting approval", active: "Approved", disabled: "Disabled" };

// The owner is always approved, whatever their profile says.
const accountStatus = (account) => {
  if (isOwnerUid(account.id)) return "active";
  if (account.disabled === true || account.status === "disabled") return "disabled";
  return account.status === "active" ? "active" : "pending";
};

const formatDate = (value) =>
  toDate(value)?.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) || "—";

// Owner-only: approve sign-ups and disable or re-enable accounts. Every
// approved account has full access to the app.
const AccountsPage = () => {
  const { user } = useAuth();
  const { showNotification } = useUI();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [pendingDisable, setPendingDisable] = useState(null);

  useEffect(
    () =>
      onSnapshot(
        collection(db, "users"),
        (snapshot) => {
          setAccounts(snapshot.docs.map((d) => ({ ...d.data(), id: d.id })));
          setLoading(false);
        },
        (error) => {
          console.error("Failed to load accounts:", error);
          setLoading(false);
        },
      ),
    [],
  );

  const sortedAccounts = useMemo(
    () =>
      [...accounts].sort(
        (a, b) =>
          STATUS_ORDER[accountStatus(a)] - STATUS_ORDER[accountStatus(b)] ||
          (a.displayName || a.email || "").localeCompare(b.displayName || b.email || ""),
      ),
    [accounts],
  );
  const pendingCount = accounts.filter((a) => accountStatus(a) === "pending").length;

  const setStatus = async (account, status) => {
    const now = new Date().toISOString();
    const updates =
      status === "disabled"
        ? { status, disabled: true, disabledAt: now, updatedAt: now }
        : { status, disabled: false, approvedAt: now, updatedAt: now };
    setBusyId(account.id);
    try {
      await updateDoc(doc(db, "users", account.id), updates);
      await logUpdate(
        `Account - ${account.email} (${STATUS_LABELS[status].toLowerCase()})`,
        "users",
        account.id,
        updates,
        account,
        "AccountsPage.jsx - setStatus",
      );
    } catch (error) {
      console.error("Failed to update account:", error);
      showNotification("error", "Update Failed", `Could not update ${account.email}.`);
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        subtitle="Approve new sign-ups and disable accounts that no longer need access. Approved accounts can use every part of the dashboard."
      />

      {pendingCount > 0 && (
        <div className="rounded-lg border border-baylor-gold/40 bg-baylor-gold/10 px-4 py-3 text-sm text-baylor-green">
          {pendingCount === 1
            ? "1 account is waiting for approval."
            : `${pendingCount} accounts are waiting for approval.`}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {loading && <p className="p-6 text-sm text-gray-500">Loading accounts…</p>}
        {!loading && sortedAccounts.length === 0 && (
          <p className="p-6 text-sm text-gray-500">No accounts yet.</p>
        )}
        {sortedAccounts.map((account) => {
          const status = accountStatus(account);
          const isSelf = account.id === user?.uid;
          const isBusy = busyId === account.id;
          return (
            <div key={account.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
              <div className="min-w-0 flex-1 basis-64">
                <p className="font-medium text-gray-900 truncate">
                  {account.displayName || account.email}
                  {isSelf && <span className="ml-2 text-xs font-normal text-gray-500">(you, owner)</span>}
                </p>
                <p className="text-sm text-gray-600 truncate">{account.email}</p>
                <p className="mt-1 text-xs text-gray-500">
                  Joined {formatDate(account.createdAt)} · Last active {formatDate(account.lastActiveAt)}
                </p>
              </div>
              <Badge tone={STATUS_TONES[status]} size="sm" showDot>
                {STATUS_LABELS[status]}
              </Badge>
              {!isSelf && (
                <div className="flex gap-2">
                  {status === "pending" && (
                    <button type="button" className="btn-primary" disabled={isBusy} onClick={() => setStatus(account, "active")}>
                      <CheckCircle2 className="w-4 h-4" />
                      Approve
                    </button>
                  )}
                  {status === "disabled" ? (
                    <button type="button" className="btn-secondary" disabled={isBusy} onClick={() => setStatus(account, "active")}>
                      <RotateCcw className="w-4 h-4" />
                      Re-enable
                    </button>
                  ) : (
                    <button type="button" className="btn-secondary" disabled={isBusy} onClick={() => setPendingDisable(account)}>
                      <Ban className="w-4 h-4" />
                      {status === "pending" ? "Decline" : "Disable"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        isOpen={Boolean(pendingDisable)}
        title="Disable account?"
        message={`${pendingDisable?.email} will immediately lose access to the dashboard until you re-enable the account.`}
        confirmText="Disable account"
        variant="danger"
        icon={Ban}
        onConfirm={async () => {
          const account = pendingDisable;
          setPendingDisable(null);
          await setStatus(account, "disabled");
        }}
        onCancel={() => setPendingDisable(null)}
      />
    </div>
  );
};

export default AccountsPage;
