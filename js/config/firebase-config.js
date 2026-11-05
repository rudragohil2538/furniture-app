/**
 * FIREBASE MODULAR SDK INITIALIZATION (js/config/firebase-config.js)
 * 
 * Uses the modern Firebase v10+ Modular ES Module SDK loaded directly
 * via official Google gstatic CDN. Zero build tools or bundlers required.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * --------------------------------------------------------------------------
 * FIREBASE WEB APP CONFIGURATION
 * --------------------------------------------------------------------------
 * Replace these placeholder strings with your actual Firebase project credentials
 * from the Firebase Console (Project Settings > General > Your apps > Web app).
 */
const firebaseConfig = {
  apiKey: "AIzaSyCaftPqrh7XGgD3bfOY_Ejbag7ee-f6F-o",
  authDomain: "furniture-store-8cda8.firebaseapp.com",
  projectId: "furniture-store-8cda8",
  storageBucket: "furniture-store-8cda8.firebasestorage.app",
  messagingSenderId: "1051088034013",
  appId: "1:1051088034013:web:07cd7997c5f8c2f5f5a334"
};

/**
 * Helper to determine if the user has configured Firebase credentials.
 * @returns {boolean}
 */
export function isFirebaseConfigured() {
  return (
    Boolean(firebaseConfig.apiKey) &&
    firebaseConfig.apiKey !== "YOUR_API_KEY_HERE" &&
    Boolean(firebaseConfig.projectId) &&
    firebaseConfig.projectId !== "your-project-id"
  );
}

// 1. Initialize Core Firebase App Instance
const app = initializeApp(firebaseConfig);

// 2. Initialize Firebase Authentication with Local Storage Session Persistence
const auth = getAuth(app);
// Ensure employee stays logged in across browser refreshes and tab switches
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn("Auth persistence could not be set to local storage:", error.message);
});

// 3. Initialize Cloud Firestore NoSQL Database Instance
const db = getFirestore(app);

// Export instances for service consumption
export { app, auth, db, firebaseConfig };

