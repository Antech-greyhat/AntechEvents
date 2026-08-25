// Firebase initialization and a single, version-pinned re-export surface.
// Firebase web config values are NOT secrets — access is controlled by Firestore
// security rules. Replace the placeholders below with your own web app config from
// Firebase console → Project settings → Your apps → SDK setup and configuration.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Firebase web app config for the "antechevent" project. These values are NOT
// secrets — access is controlled by Firestore security rules.
const firebaseConfig = {
  apiKey: "AIzaSyAsL0b5ihuclpNQRB8u3ISlXLcmN_JlRyE",
  authDomain: "antechevent.firebaseapp.com",
  databaseURL: "https://antechevent-default-rtdb.firebaseio.com",
  projectId: "antechevent",
  storageBucket: "antechevent.firebasestorage.app",
  messagingSenderId: "177667590368",
  appId: "1:177667590368:web:9dac82d806e62cc3252885",
  measurementId: "G-K4N0P209GD",
};

// Lets the UI show a friendly setup notice instead of cryptic network errors.
export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith("REPLACE_WITH");

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
};
