/**
 * CUSTOMER SERVICE MODULE (js/services/customerService.js)
 * 
 * Implements customer registration, automated ID generation, duplicate detection,
 * CRUD operations, and audit logging.
 */

import { 
  collection, 
  doc, 
  addDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter, 
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { db, isFirebaseConfigured } from "../config/firebase-config.js";
import { isValidEmail, isValidPhone, isValidPostalCode, isNotEmpty, sanitizeString } from "../utils/validator.js";

const CUSTOMERS_COLLECTION = "customers";
const ACTIVITY_COLLECTION = "activityLogs";

/**
 * Generates an automated, human-readable customer ID.
 * Format: FS-CUST-YYYYMM-XXXX (e.g., FS-CUST-202611-4821)
 * @returns {string}
 */
export function generateCustomerId() {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `FS-CUST-${yearMonth}-${randomSuffix}`;
}

/**
 * Checks if a customer already exists with the given mobile number or email.
 * Prevents redundant/duplicate customer accounts.
 * 
 * @param {string} phone 
 * @param {string} email 
 * @param {string} [excludeDocId=null] - Optional doc ID to exclude (used during updates)
 * @returns {Promise<{isDuplicate: boolean, field: 'phone'|'email'|null}>}
 */
export async function checkDuplicateCustomer(phone, email, excludeDocId = null) {
  if (!isFirebaseConfigured()) return { isDuplicate: false, field: null };

  const cleanPhone = phone.trim().replace(/[\s\-\(\)]/g, '');
  const cleanEmail = email.trim().toLowerCase();

  // 1. Check phone duplicate
  const phoneQuery = query(
    collection(db, CUSTOMERS_COLLECTION),
    where("phone", "==", cleanPhone)
  );
  const phoneSnapshot = await getDocs(phoneQuery);
  for (const docSnap of phoneSnapshot.docs) {
    if (!excludeDocId || docSnap.id !== excludeDocId) {
      return { isDuplicate: true, field: 'phone' };
    }
  }

  // 2. Check email duplicate
  const emailQuery = query(
    collection(db, CUSTOMERS_COLLECTION),
    where("email", "==", cleanEmail)
  );
  const emailSnapshot = await getDocs(emailQuery);
  for (const docSnap of emailSnapshot.docs) {
    if (!excludeDocId || docSnap.id !== excludeDocId) {
      return { isDuplicate: true, field: 'email' };
    }
  }

  return { isDuplicate: false, field: null };
}

/**
 * Validates and registers a new customer in Cloud Firestore.
 * 
 * @param {Object} rawData - Form data from customer registration
 * @param {string} employeeUid - UID of employee registering the customer
 * @returns {Promise<Object>} Created customer document reference
 */
export async function registerCustomer(rawData, employeeUid) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured. Please add your credentials in js/config/firebase-config.js");
  }

  // 1. Field validation
  if (!isNotEmpty(rawData.fullName)) throw new Error("Customer full name is required.");
  if (!isValidPhone(rawData.phone)) throw new Error("Please enter a valid 10-digit mobile phone number.");
  if (!isValidEmail(rawData.email)) throw new Error("Please enter a valid email address.");
  if (!isNotEmpty(rawData.houseNo)) throw new Error("House / Building number is required.");
  if (!isNotEmpty(rawData.street)) throw new Error("Street / Locality address is required.");
  if (!isNotEmpty(rawData.city)) throw new Error("City name is required.");
  if (!isNotEmpty(rawData.state)) throw new Error("State is required.");
  if (!isValidPostalCode(rawData.postalCode)) throw new Error("Please enter a valid 6-digit postal code.");

  // 2. Duplicate detection
  const dupCheck = await checkDuplicateCustomer(rawData.phone, rawData.email);
  if (dupCheck.isDuplicate) {
    if (dupCheck.field === 'phone') {
      throw new Error(`A customer with phone number "${rawData.phone}" is already registered.`);
    } else {
      throw new Error(`A customer with email address "${rawData.email}" is already registered.`);
    }
  }

  // 3. Prepare normalized customer document
  const customerId = rawData.customerId || generateCustomerId();
  const cleanPhone = rawData.phone.trim().replace(/[\s\-\(\)]/g, '');
  const cleanEmail = rawData.email.trim().toLowerCase();

  const customerDocument = {
    customerId: customerId,
    fullName: sanitizeString(rawData.fullName.trim()),
    phone: cleanPhone,
    email: cleanEmail,
    gender: rawData.gender || 'unspecified',
    dob: rawData.dob || null,
    address: {
      houseNo: sanitizeString(rawData.houseNo.trim()),
      street: sanitizeString(rawData.street.trim()),
      city: sanitizeString(rawData.city.trim()),
      state: sanitizeString(rawData.state.trim()),
      postalCode: rawData.postalCode.trim()
    },
    notes: rawData.notes ? sanitizeString(rawData.notes.trim()) : '',
    totalOrders: 0,
    totalSpent: 0,
    registrationDate: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: employeeUid || 'anonymous-staff'
  };

  // 4. Save to Firestore
  const docRef = await addDoc(collection(db, CUSTOMERS_COLLECTION), customerDocument);

  // 5. Append Activity Log for audit trail
  try {
    await addDoc(collection(db, ACTIVITY_COLLECTION), {
      action: "CUSTOMER_REGISTERED",
      entityType: "customer",
      entityId: docRef.id,
      displayId: customerId,
      customerName: customerDocument.fullName,
      performedBy: employeeUid,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.warn("Activity log could not be written:", err.message);
  }

  return { id: docRef.id, ...customerDocument };
}

/**
 * Fetches a single customer document by Firestore Document ID.
 * @param {string} docId 
 * @returns {Promise<Object|null>}
 */
export async function getCustomerById(docId) {
  if (!isFirebaseConfigured()) return null;
  const docRef = doc(db, CUSTOMERS_COLLECTION, docId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Fetches a customer by their unique human-readable customerId (e.g. FS-CUST-202611-1234).
 * @param {string} customerId 
 * @returns {Promise<Object|null>}
 */
export async function getCustomerByDisplayId(customerId) {
  if (!isFirebaseConfigured()) return null;
  const q = query(collection(db, CUSTOMERS_COLLECTION), where("customerId", "==", customerId.trim()), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() };
}

/**
 * Fetches all customers ordered by registration date descending.
 * @returns {Promise<Array<Object>>}
 */
export async function getAllCustomers() {
  if (!isFirebaseConfigured()) return [];

  try {
    const q = query(
      collection(db, CUSTOMERS_COLLECTION),
      orderBy("registrationDate", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    // If index is still building or missing, fallback to unordered fetch
    console.warn("Ordered fetch failed, falling back to base query:", error.message);
    const snap = await getDocs(collection(db, CUSTOMERS_COLLECTION));
    const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return list.sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });
  }
}

/**
 * Updates an existing customer's details.
 * @param {string} docId 
 * @param {Object} updatedFields 
 * @param {string} employeeUid 
 */
export async function updateCustomer(docId, updatedFields, employeeUid) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured.");

  // Deduplication check if phone or email changed
  if (updatedFields.phone || updatedFields.email) {
    const dupCheck = await checkDuplicateCustomer(
      updatedFields.phone || '',
      updatedFields.email || '',
      docId
    );
    if (dupCheck.isDuplicate) {
      throw new Error(`Another customer already exists with this ${dupCheck.field}.`);
    }
  }

  const docRef = doc(db, CUSTOMERS_COLLECTION, docId);
  const updatePayload = {
    ...updatedFields,
    updatedAt: serverTimestamp()
  };

  await updateDoc(docRef, updatePayload);

  // Log update
  try {
    await addDoc(collection(db, ACTIVITY_COLLECTION), {
      action: "CUSTOMER_UPDATED",
      entityType: "customer",
      entityId: docId,
      performedBy: employeeUid,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.warn("Activity log error:", err.message);
  }
}

/**
 * Deletes a customer record from Firestore.
 * Restricted to administrators with verification.
 * 
 * @param {string} docId 
 * @param {string} employeeUid 
 */
export async function deleteCustomer(docId, employeeUid) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured.");

  const docRef = doc(db, CUSTOMERS_COLLECTION, docId);
  const currentSnap = await getDoc(docRef);
  const customerData = currentSnap.exists() ? currentSnap.data() : {};

  await deleteDoc(docRef);

  // Log deletion
  try {
    await addDoc(collection(db, ACTIVITY_COLLECTION), {
      action: "CUSTOMER_DELETED",
      entityType: "customer",
      entityId: docId,
      displayId: customerData.customerId || docId,
      customerName: customerData.fullName || 'Unknown',
      performedBy: employeeUid,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.warn("Activity log error:", err.message);
  }
}

