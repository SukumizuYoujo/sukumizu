// js/config/firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js";
import { CONSTANTS } from "./constants.js";

// Firebaseアプリの初期化
const app = initializeApp(CONSTANTS.FIREBASE_CONFIG);

// 各サービスのインスタンスを生成してexport
export const db = getDatabase(app);
export const auth = getAuth(app);
// Functionsのリージョン指定(asia-northeast1)もここで行う
export const functions = getFunctions(app, "asia-northeast1");
