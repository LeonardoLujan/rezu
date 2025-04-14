import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyA-aopfYsoX1_3hqObm6qgE7ums-ZeiLvU",
    authDomain: "rezu-90106.firebaseapp.com",
    projectId: "rezu-90106",
    storageBucket: "rezu-90106.firebasestorage.app",
    messagingSenderId: "666218637742",
    appId: "1:666218637742:web:1189214ba06f9277f0c03f",
    measurementId: "G-E11X6S45WZ"
  };

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const storage = getStorage(app)
export const firestore = getFirestore(app)