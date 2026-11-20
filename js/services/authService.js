/**
 * EMPLOYEE AUTHENTICATION & RBAC SERVICE (js/services/authService.js)
 * 
 * Manages employee login, session persistence, role-based access control,
 * password resets, and route protection guards.
 */

import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
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
  collection,
  query,
  where,
  getDocs,
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { auth, db, isFirebaseConfigured } from "../config/firebase-config.js";
import { showToast } from "../utils/uiUtils.js";
import { generateCustomerId } from "./customerService.js";
import { sanitizeString } from "../utils/validator.js";

/**
 * Currently cached employee profile (role, name, email, status).
 */
let currentEmployeeProfile = null;

/**
 * Currently cached customer profile.
 */
let currentCustomerProfile = null;

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

/**
 * =========================================================================
 * CUSTOMER / CLIENT AUTHENTICATION SERVICE
 * =========================================================================
 */

/**
 * Registers a new customer account in Firebase Auth and creates a customer record.
 * 
 * @param {Object} data 
 * @param {string} data.email
 * @param {string} data.password
 * @param {string} data.fullName
 * @param {string} data.phone
 * @param {Object} data.address
 * @param {string} [data.notes]
 * @returns {Promise<Object>} { user, customer }
 */
export async function customerSignUp(data) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase credentials missing. Please configure js/config/firebase-config.js first.");
  }

  // 1. Create User in Firebase Auth
  const userCredential = await createUserWithEmailAndPassword(auth, data.email.trim(), data.password);
  const user = userCredential.user;

  // 2. Generate unique display customer ID
  const customerId = generateCustomerId();
  const cleanPhone = (data.phone || '').trim().replace(/[\s\-\(\)]/g, '');

  // 3. Create Customer Record in Firestore (/customers/{uid})
  const customerData = {
    customerId: customerId,
    authUid: user.uid,
    fullName: sanitizeString((data.fullName || '').trim()),
    phone: cleanPhone,
    email: data.email.trim().toLowerCase(),
    role: 'customer',
    accountType: 'customer',
    gender: data.gender || 'unspecified',
    dob: data.dob || null,
    address: {
      houseNo: sanitizeString((data.houseNo || data.address?.houseNo || '').trim()),
      street: sanitizeString((data.street || data.address?.street || '').trim()),
      city: sanitizeString((data.city || data.address?.city || '').trim()),
      state: sanitizeString((data.state || data.address?.state || '').trim()),
      postalCode: (data.postalCode || data.address?.postalCode || '').trim()
    },
    notes: data.notes ? sanitizeString(data.notes.trim()) : '',
    totalOrders: 0,
    totalSpent: 0,
    registrationDate: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: 'self-registration'
  };

  await setDoc(doc(db, "customers", user.uid), customerData);
  currentCustomerProfile = { id: user.uid, ...customerData };

  return { user, customer: currentCustomerProfile };
}

/**
 * Signs in a customer with email and password.
 * 
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<Object>} { user, customer }
 */
export async function customerLogin(email, password) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase credentials missing. Please configure js/config/firebase-config.js first.");
  }

  const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
  const user = userCredential.user;

  // Fetch customer profile
  let customer = await getCustomerProfile(user.uid);

  // If customer signed up previously by staff with same email but no doc at user.uid
  if (!customer) {
    // Try query by email or authUid
    try {
      const q = query(collection(db, "customers"), where("email", "==", email.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        customer = { id: docSnap.id, ...docSnap.data() };
        // Link authUid
        await updateDoc(doc(db, "customers", docSnap.id), {
          authUid: user.uid,
          updatedAt: serverTimestamp()
        });
      }
    } catch (e) {
      console.warn("Customer lookup by email error:", e);
    }
  }

  // If still no customer record, create baseline profile
  if (!customer) {
    const customerId = generateCustomerId();
    customer = {
      customerId: customerId,
      authUid: user.uid,
      fullName: user.displayName || user.email.split('@')[0],
      email: user.email,
      phone: '',
      role: 'customer',
      accountType: 'customer',
      address: { houseNo: '', street: '', city: '', state: '', postalCode: '' },
      notes: '',
      totalOrders: 0,
      totalSpent: 0,
      registrationDate: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: 'self-registration'
    };
    try {
      await setDoc(doc(db, "customers", user.uid), customer);
      customer.id = user.uid;
    } catch (err) {
      console.warn("Could not save fallback customer record:", err.message);
    }
  }

  currentCustomerProfile = customer;
  return { user, customer };
}

/**
 * Retrieves customer record from Firestore by Auth UID.
 * @param {string} uid 
 * @returns {Promise<Object|null>}
 */
export async function getCustomerProfile(uid) {
  try {
    const docRef = doc(db, "customers", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }

    // Secondary search by authUid field
    const q = query(collection(db, "customers"), where("authUid", "==", uid));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...d.data() };
    }

    return null;
  } catch (error) {
    console.error("Error fetching customer profile:", error);
    return null;
  }
}

/**
 * Signs out the current customer and redirects to user login.
 */
export async function customerLogout() {
  currentCustomerProfile = null;
  await signOut(auth);
  window.location.href = "user-login.html";
}

/**
 * Route protection guard for customer views (e.g. user-dashboard.html).
 * @returns {Promise<Object>} { user, customer }
 */
export function requireCustomerAuth() {
  return new Promise((resolve) => {
    if (!isFirebaseConfigured()) {
      showToast("Firebase Config", "Please add your Firebase keys in js/config/firebase-config.js", "warning", 8000);
      resolve({ 
        user: { email: 'customer@example.com' }, 
        customer: { customerId: 'FS-CUST-DEMO', fullName: 'Demo Customer', email: 'customer@example.com' } 
      });
      return;
    }

    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `user-login.html?returnUrl=${returnUrl}`;
        return;
      }

      let customer = await getCustomerProfile(user.uid);
      if (!customer) {
        // Fallback placeholder
        customer = {
          id: user.uid,
          customerId: 'FS-CUST-' + user.uid.substring(0, 6).toUpperCase(),
          fullName: user.displayName || user.email.split('@')[0],
          email: user.email,
          phone: '',
          address: { houseNo: '', street: '', city: '', state: '', postalCode: '' }
        };
      }

      currentCustomerProfile = customer;
      resolve({ user, customer });
    });
  });
}

