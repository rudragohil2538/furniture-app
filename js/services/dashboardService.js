/**
 * DASHBOARD ANALYTICS & METRICS SERVICE (js/services/dashboardService.js)
 * 
 * Aggregates live database statistics, recent registrations,
 * order trends, category distribution, and system audit logs.
 */

import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { db, isFirebaseConfigured } from "../config/firebase-config.js";
import { getAllCustomers } from "./customerService.js";
import { getAllOrders } from "./orderService.js";

const ACTIVITY_COLLECTION = "activityLogs";

/**
 * Computes all dashboard KPIs and summaries from live Firestore data.
 * @returns {Promise<Object>} Aggregated metrics object
 */
export async function getDashboardMetrics() {
  if (!isFirebaseConfigured()) {
    return {
      totalCustomers: 0,
      todayCustomers: 0,
      totalOrders: 0,
      pendingOrders: 0,
      totalRevenue: 0,
      recentCustomers: [],
      recentOrders: [],
      categoryDistribution: [],
      recentActivity: []
    };
  }

  // 1. Concurrently fetch customers, orders, and recent audit logs
  const [customers, orders, activityLogs] = await Promise.all([
    getAllCustomers(),
    getAllOrders(),
    fetchRecentActivityLogs(6)
  ]);

  // 2. Compute Customer Metrics
  const totalCustomers = customers.length;
  const todayStr = new Date().toISOString().split('T')[0];
  
  const todayCustomers = customers.filter(c => {
    if (!c.registrationDate) return false;
    const dateObj = c.registrationDate.toDate ? c.registrationDate.toDate() : new Date(c.registrationDate);
    return dateObj.toISOString().split('T')[0] === todayStr;
  }).length;

  // 3. Compute Order & Revenue Metrics
  const totalOrders = orders.length;
  const pendingOrders = orders.filter(o => o.orderStatus === 'placed' || o.orderStatus === 'processing').length;
  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

  // 4. Recent Slices (Top 5 each)
  const recentCustomers = customers.slice(0, 5);
  const recentOrders = orders.slice(0, 5);

  // 5. Furniture Category Breakdown
  const categoryCounts = {};
  orders.forEach(o => {
    const cat = o.productCategory || "Other";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  const categoryDistribution = Object.entries(categoryCounts).map(([category, count]) => ({
    category,
    count,
    percentage: totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0
  })).sort((a, b) => b.count - a.count);

  return {
    totalCustomers,
    todayCustomers,
    totalOrders,
    pendingOrders,
    totalRevenue,
    recentCustomers,
    recentOrders,
    categoryDistribution,
    recentActivity: activityLogs
  };
}

/**
 * Fetches latest activity log entries for the audit feed.
 * @param {number} maxCount 
 * @returns {Promise<Array<Object>>}
 */
async function fetchRecentActivityLogs(maxCount = 6) {
  if (!isFirebaseConfigured()) return [];

  try {
    const q = query(
      collection(db, ACTIVITY_COLLECTION),
      orderBy("timestamp", "desc"),
      limit(maxCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.warn("Ordered activity logs fetch failed, attempting unindexed fallback:", error.message);
    try {
      const snap = await getDocs(collection(db, ACTIVITY_COLLECTION));
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return list.sort((a, b) => {
        const timeA = a.timestamp?.seconds || 0;
        const timeB = b.timestamp?.seconds || 0;
        return timeB - timeA;
      }).slice(0, maxCount);
    } catch (err) {
      return [];
    }
  }
}

