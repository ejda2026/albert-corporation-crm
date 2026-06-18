import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBWBA6leQdyT7ZVn7XL6YgiPKuSLG9NbRI",
  authDomain: "albert-corporation-crm.firebaseapp.com",
  projectId: "albert-corporation-crm",
  storageBucket: "albert-corporation-crm.firebasestorage.app",
  messagingSenderId: "363377920592",
  appId: "1:363377920592:web:7681affb76c1b3a06f9f55"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
