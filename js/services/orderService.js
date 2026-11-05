/**
 * ORDER SERVICE MODULE (js/services/orderService.js)
 * 
 * Manages furniture order lifecycles, customer purchase histories,
 * status updates, and atomic customer metric updates.
 */

import { 
  collection, 
  doc, 
  addDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp, 
  increment 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { db, isFirebaseConfigured } from "../config/firebase-config.js";
import { isNotEmpty, isValidPrice, isValidQuantity, sanitizeString } from "../utils/validator.js";

const ORDERS_COLLECTION = "orders";
const CUSTOMERS_COLLECTION = "customers";
const ACTIVITY_COLLECTION = "activityLogs";

/**
 * Standard Furniture Categories for Inventory & Order classification
 */
export const FURNITURE_CATEGORIES = [
  "Living Room",
  "Bedroom",
  "Dining Room",
  "Office & Study",
  "Outdoor & Patio",
  "Accent & Decor"
];

/**
 * Generates an automated Order Display ID.
 * Format: FS-ORD-YYYYMM-XXXX (e.g., FS-ORD-202611-7391)
 * @returns {string}
 */
export function generateOrderId() {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `FS-ORD-${yearMonth}-${randomSuffix}`;
}

/**
 * Creates a new furniture order associated with a customer.
 * Automatically updates customer's lifetime order count and spend.
 * 
 * @param {Object} rawData - Order details
 * @param {string} employeeUid - Registering staff UID
 * @returns {Promise<Object>} Created order
 */
export async function createOrder(rawData, employeeUid) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured.");

  // 1. Validation
  if (!isNotEmpty(rawData.customerId)) throw new Error("Customer reference is required.");
  if (!isNotEmpty(rawData.productName)) throw new Error("Product name is required.");
  if (!isNotEmpty(rawData.productCategory)) throw new Error("Product category is required.");
  if (!isValidQuantity(rawData.quantity)) throw new Error("Quantity must be a positive integer (minimum 1).");
  if (!isValidPrice(rawData.unitPrice)) throw new Error("Unit price must be a valid positive number.");

  const quantity = Number(rawData.quantity);
  const unitPrice = Number(rawData.unitPrice);
  const totalAmount = quantity * unitPrice;

  const orderId = rawData.orderId || generateOrderId();

  // 2. Prepare Order Document
  const orderDoc = {
    orderId: orderId,
    customerId: rawData.customerId,
    customerDocId: rawData.customerDocId || rawData.customerId,
    customerName: sanitizeString(rawData.customerName || 'Valued Customer'),
    customerPhone: rawData.customerPhone || '',
    productName: sanitizeString(rawData.productName.trim()),
    productCategory: rawData.productCategory,
    quantity: quantity,
    unitPrice: unitPrice,
    totalAmount: totalAmount,
    orderDate: serverTimestamp(),
    expectedDeliveryDate: rawData.expectedDeliveryDate || null,
    paymentStatus: rawData.paymentStatus || 'pending',
    orderStatus: rawData.orderStatus || 'placed',
    notes: rawData.notes ? sanitizeString(rawData.notes.trim()) : '',
    createdBy: employeeUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  // 3. Write Order to Firestore
  const orderRef = await addDoc(collection(db, ORDERS_COLLECTION), orderDoc);

  // 4. Update Customer's Lifetime Metrics using Firestore increment()
  if (rawData.customerDocId) {
    try {
      const customerRef = doc(db, CUSTOMERS_COLLECTION, rawData.customerDocId);
      await updateDoc(customerRef, {
        totalOrders: increment(1),
        totalSpent: increment(totalAmount),
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn("Could not update customer summary counters:", err.message);
    }
  }

  // 5. Activity Audit Log
  try {
    await addDoc(collection(db, ACTIVITY_COLLECTION), {
      action: "ORDER_CREATED",
      entityType: "order",
      entityId: orderRef.id,
      displayId: orderId,
      customerId: rawData.customerId,
      totalAmount: totalAmount,
      performedBy: employeeUid,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.warn("Activity log failed:", err.message);
  }

  return { id: orderRef.id, ...orderDoc };
}

/**
 * Fetches all orders associated with a specific customer.
 * 
 * @param {string} customerId - Human-readable customer ID or document ID
 * @returns {Promise<Array<Object>>}
 */
export async function getOrdersByCustomer(customerId) {
  if (!isFirebaseConfigured() || !customerId) return [];

  try {
    const q = query(
      collection(db, ORDERS_COLLECTION),
      where("customerId", "==", customerId.trim()),
      orderBy("orderDate", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn("Ordered customer orders query failed, attempting unindexed query:", error.message);
    // Fallback: Query by customerId without orderBy, sort in client memory
    const qFallback = query(
      collection(db, ORDERS_COLLECTION),
      where("customerId", "==", customerId.trim())
    );
    const snapFallback = await getDocs(qFallback);
    const list = snapFallback.docs.map(d => ({ id: d.id, ...d.data() }));
    return list.sort((a, b) => {
      const tA = a.orderDate?.seconds || 0;
      const tB = b.orderDate?.seconds || 0;
      return tB - tA;
    });
  }
}

/**
 * Fetches all orders in the system.
 * @returns {Promise<Array<Object>>}
 */
export async function getAllOrders() {
  if (!isFirebaseConfigured()) return [];

  try {
    const q = query(collection(db, ORDERS_COLLECTION), orderBy("orderDate", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Ordered orders fetch failed, falling back to base fetch:", err.message);
    const snap = await getDocs(collection(db, ORDERS_COLLECTION));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return list.sort((a, b) => {
      const tA = a.orderDate?.seconds || 0;
      const tB = b.orderDate?.seconds || 0;
      return tB - tA;
    });
  }
}

/**
 * Updates an order's fulfillment status (placed -> processing -> dispatched -> delivered -> cancelled).
 * @param {string} orderDocId 
 * @param {string} newStatus 
 * @param {string} employeeUid 
 */
export async function updateOrderStatus(orderDocId, newStatus, employeeUid) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured.");

  const orderRef = doc(db, ORDERS_COLLECTION, orderDocId);
  await updateDoc(orderRef, {
    orderStatus: newStatus,
    updatedAt: serverTimestamp()
  });

  try {
    await addDoc(collection(db, ACTIVITY_COLLECTION), {
      action: "ORDER_STATUS_UPDATED",
      entityType: "order",
      entityId: orderDocId,
      newStatus: newStatus,
      performedBy: employeeUid,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.warn("Activity log failed:", err.message);
  }
}

/**
 * Updates an order's payment status (pending, partial, paid, refunded).
 * @param {string} orderDocId 
 * @param {string} newPaymentStatus 
 * @param {string} employeeUid 
 */
export async function updatePaymentStatus(orderDocId, newPaymentStatus, employeeUid) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured.");

  const orderRef = doc(db, ORDERS_COLLECTION, orderDocId);
  await updateDoc(orderRef, {
    paymentStatus: newPaymentStatus,
    updatedAt: serverTimestamp()
  });
}

