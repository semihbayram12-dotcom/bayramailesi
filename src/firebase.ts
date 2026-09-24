// src/firebase.ts

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB93qCx8GiqrSTKgUCd5ewthIhpYTNocE4",
  authDomain: "bayramaileagaci.firebaseapp.com",
  projectId: "bayramaileagaci",
  storageBucket: "bayramaileagaci.firebasestorage.app",
  messagingSenderId: "340707788545",
  appId: "1:340707788545:web:1d433f6df766d00d847d00",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);