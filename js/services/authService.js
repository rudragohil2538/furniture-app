/**
 * EMPLOYEE AUTHENTICATION & RBAC SERVICE (js/services/authService.js)
 * 
 * Manages employee login, session persistence, role-based access control,
 * password resets, and route protection guards.
 */

import { 
  signInWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail, 
  sendEmailVerification,
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { auth, db, isFirebaseConfigured } from "../config/firebase-config.js";
import { showToast } from "../utils/uiUtils.js";

/**
 * Currently cached employee profile (role, name, email, status).
 */
let currentEmployeeProfile = null;

/**
 * Signs in an employee with email and password.
 * Validates active account status against the `employees` collection.
 * 
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<Object>} Contains user and profile
 */
export async function login(email, password) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase credentials missing. Please configure js/config/firebase-config.js first.");
  }

  // 1. Authenticate with Firebase Auth
  const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
  const user = userCredential.user;

  // 2. Fetch employee profile and role from Firestore (/employees/{uid})
  let profile = await getEmployeeProfile(user.uid);

  // If this is the first login in a new project and no profile exists yet, auto-bootstrap as Admin
  if (!profile) {
    profile = {
      uid: user.uid,
      email: user.email,
      fullName: user.displayName || user.email.split('@')[0],
      role: 'admin', // First user bootstrapped as Admin
      status: 'active',
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp()
    };
    try {
      await setDoc(doc(db, "employees", user.uid), profile);
    } catch (setErr) {
      console.warn("Could not write initial employee record to Firestore (check Security Rules):", setErr.message);
    }
  } else {
    // Check if account is suspended/disabled by Admin
    if (profile.status === 'disabled') {
      await signOut(auth);
      throw new Error("Your employee account has been suspended. Please contact the administrator.");
    }

    // Update last login timestamp
    try {
      await updateDoc(doc(db, "employees", user.uid), {
        lastLogin: serverTimestamp()
      });
    } catch (err) {
      console.warn("Could not update last login timestamp:", err.message);
    }
  }

  currentEmployeeProfile = profile;
  return { user, profile };
}

/**
 * Signs out the current employee and clears local state.
 */
export async function logout() {
  currentEmployeeProfile = null;
  await signOut(auth);
  window.location.href = "login.html";
}

/**
 * Sends a password reset email via Firebase Authentication.
 * @param {string} email 
 */
export async function resetPassword(email) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured yet.");
  }
  await sendPasswordResetEmail(auth, email.trim());
}

/**
 * Sends an email verification link to the currently signed-in employee.
 */
export async function verifyEmail() {
  if (!auth.currentUser) throw new Error("No active user session found.");
  await sendEmailVerification(auth.currentUser);
  showToast("Verification Sent", "Check your inbox for the email verification link.", "success");
}

/**
 * Retrieves employee record from Firestore.
 * @param {string} uid 
 * @returns {Promise<Object|null>}
 */
export async function getEmployeeProfile(uid) {
  try {
    const docRef = doc(db, "employees", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  } catch (error) {
    console.error("Error fetching employee profile:", error);
    return null;
  }
}

/**
 * Gets the cached employee profile or queries Firestore if not loaded yet.
 * @returns {Promise<Object|null>}
 */
export async function getCurrentEmployee() {
  if (currentEmployeeProfile) return currentEmployeeProfile;
  if (!auth.currentUser) return null;
  currentEmployeeProfile = await getEmployeeProfile(auth.currentUser.uid);
  return currentEmployeeProfile;
}

/**
 * Registers a new employee in Firestore (Restricted to Authorized Admins).
 * Note: New Auth accounts can be created by Admins or via Firebase Console.
 * 
 * @param {Object} employeeData 
 * @param {string} employeeData.uid
 * @param {string} employeeData.email
 * @param {string} employeeData.fullName
 * @param {'admin'|'staff'} employeeData.role
 */
export async function registerEmployeeRecord(employeeData) {
  const current = await getCurrentEmployee();
  if (!current || current.role !== 'admin') {
    throw new Error("Access Denied: Only administrators can register or modify employee records.");
  }

  const docRef = doc(db, "employees", employeeData.uid);
  await setDoc(docRef, {
    ...employeeData,
    status: 'active',
    createdAt: serverTimestamp(),
    createdBy: current.uid
  });
}

/**
 * Route protection guard for dashboard and administrative views.
 * Call this at the top of protected pages.
 * 
 * @param {Array<string>} [allowedRoles=[]] Optional allowed roles (e.g. ['admin'])
 * @returns {Promise<Object>} Returns authenticated { user, profile }
 */
export function requireAuth(allowedRoles = []) {
  return new Promise((resolve) => {
    // If Firebase is not configured, warn the user
    if (!isFirebaseConfigured()) {
      showToast("Firebase Config", "Please add your Firebase keys in js/config/firebase-config.js", "warning", 8000);
      resolve({ user: { email: 'demo@furniturestore.com' }, profile: { fullName: 'Demo Admin', role: 'admin' } });
      return;
    }

    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // Redirect unauthenticated visitors to login
        const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `login.html?returnUrl=${returnUrl}`;
        return;
      }

      // Fetch role profile
      const profile = await getEmployeeProfile(user.uid);

      if (!profile || profile.status === 'disabled') {
        await logout();
        return;
      }

      // Role authorization check
      if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
        showToast("Access Denied", "You do not have administrative permission for this area.", "error");
        window.location.href = "index.html";
        return;
      }

      currentEmployeeProfile = profile;

      // Populate sidebar user info if DOM elements are present
      populateUserSidebar(profile);

      resolve({ user, profile });
    });
  });
}

/**
 * Updates UI sidebar with employee details.
 * @param {Object} profile 
 */
export function populateUserSidebar(profile) {
  const nameEl = document.getElementById('sidebar-user-name');
  const roleEl = document.getElementById('sidebar-user-role');
  const avatarEl = document.getElementById('sidebar-user-avatar');
  const logoutBtn = document.getElementById('sidebar-logout-btn');

  if (nameEl && profile.fullName) nameEl.textContent = profile.fullName;
  if (roleEl && profile.role) {
    roleEl.textContent = profile.role.toUpperCase();
    roleEl.className = `badge badge-${profile.role === 'admin' ? 'admin' : 'staff'}`;
  }
  if (avatarEl && profile.fullName) {
    avatarEl.textContent = profile.fullName.charAt(0).toUpperCase();
  }
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      try {
        await logout();
      } catch (err) {
        showToast("Logout Error", err.message, "error");
      }
    };
  }
}

