import fs from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const STATIC_ALLOWED_ORIGINS = new Set([
  "https://faculty-schedules.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (STATIC_ALLOWED_ORIGINS.has(origin)) return true;
  // Vercel preview deployments: https://faculty-schedules-<hash>.vercel.app
  return /^https:\/\/faculty-schedules(?:-[a-z0-9-]+)?\.vercel\.app$/.test(
    origin,
  );
}

function setCors(res, origin) {
  // Only set ACAO when we explicitly allow the origin.
  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization,content-type",
  );
  // If you need cookies in the future: also set Allow-Credentials: true.
}

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function loadServiceAccount() {
  const envJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT;
  if (envJson) {
    const parsed = JSON.parse(envJson);
    if (typeof parsed.private_key === "string") {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  }

  // Local-only fallback (do not rely on this in Vercel).
  const localPath = path.join(process.cwd(), "firebase-service-account.json");
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, "utf8"));
  }

  throw new Error(
    "Missing FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_SERVICE_ACCOUNT) env var.",
  );
}

function normalizeRoleList(roles) {
  if (Array.isArray(roles)) return roles.filter(Boolean);
  if (roles && typeof roles === "object") {
    return Object.keys(roles).filter((key) => roles[key]);
  }
  if (typeof roles === "string" && roles.trim()) return [roles.trim()];
  return [];
}

function ensureAdminInitialized() {
  if (getApps().length) return;
  const serviceAccount = loadServiceAccount();
  initializeApp({ credential: cert(serviceAccount) });
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  setCors(res, origin);

  if (req.method === "OPTIONS") {
    // Preflight
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }

  if (!isAllowedOrigin(origin)) {
    json(res, 403, { error: "forbidden_origin" });
    return;
  }

  try {
    ensureAdminInitialized();

    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      json(res, 401, { error: "missing_auth" });
      return;
    }

    const decoded = await getAuth().verifyIdToken(match[1]);
    const callerUid = decoded?.uid;
    if (!callerUid) {
      json(res, 401, { error: "invalid_auth" });
      return;
    }

    const body = await readJsonBody(req);
    const targetUid = body?.uid;
    if (!targetUid || typeof targetUid !== "string") {
      json(res, 400, { error: "invalid_argument", message: "uid is required" });
      return;
    }
    if (targetUid === callerUid) {
      json(res, 400, { error: "failed_precondition", message: "self_delete" });
      return;
    }

    const db = getFirestore();
    const callerSnap = await db.doc(`users/${callerUid}`).get();
    if (!callerSnap.exists) {
      json(res, 403, { error: "permission_denied", message: "caller_not_found" });
      return;
    }

    const callerRoles = normalizeRoleList(callerSnap.data()?.roles);
    if (!callerRoles.includes("admin")) {
      json(res, 403, { error: "permission_denied", message: "admin_required" });
      return;
    }

    const targetRef = db.doc(`users/${targetUid}`);
    const targetSnap = await targetRef.get();
    const targetData = targetSnap.exists ? targetSnap.data() : null;

    let authDeleted = false;
    try {
      await getAuth().deleteUser(targetUid);
      authDeleted = true;
    } catch (error) {
      // Ignore if already missing.
      if (error?.code !== "auth/user-not-found") {
        json(res, 500, { error: "internal", message: "auth_delete_failed" });
        return;
      }
    }

    try {
      await targetRef.delete();
    } catch (_) {
      json(res, 500, { error: "internal", message: "profile_delete_failed" });
      return;
    }

    await db.collection("changeLog").add({
      timestamp: new Date().toISOString(),
      action: "DELETE",
      entity: `User Profile - ${targetData?.email || targetUid}`,
      collection: "users",
      documentId: targetUid,
      originalData: targetData || null,
      source: "vercel.api.deleteUser",
      metadata: {
        authDeleted,
        profileExisted: targetSnap.exists,
      },
      userId: callerUid,
    });

    json(res, 200, {
      success: true,
      authDeleted,
      profileDeleted: targetSnap.exists,
    });
  } catch (err) {
    json(res, 500, {
      error: "internal",
      message:
        err && typeof err.message === "string" ? err.message : "unknown_error",
    });
  }
}

