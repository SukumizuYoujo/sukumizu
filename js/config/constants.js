// js/config/constants.js

export const CONSTANTS = {
    DL_AFFILIATE_ID: "sukumizuyoujo",
    FIREBASE_CONFIG: {
        apiKey: "AIzaSyCjbDIVVnl_lf-vOCKSf3_hWOjCDNxaJts",
        authDomain: "dlsite-share.firebaseapp.com",
        databaseURL: "https://dlsite-share-default-rtdb.firebaseio.com",
        projectId: "dlsite-share",
        storageBucket: "dlsite-share.appspot.com",
        messagingSenderId: "764936540510",
        appId: "1:764936540510:web:846938ef579ea0b0cf3fcf",
        measurementId: "G-LXNH02PV7J"
    },
    DB_PATHS: {
        WORKS: "works", 
        ADMIN_PICKS: "adminPicks", 
        TAGS: "tags", 
        CATEGORIES: "categories", 
        CONTACTS: "contacts",
        FAVORITES: "userFavorites", 
        USER_LISTS: "userLists", 
        LISTS: "lists", 
        LIST_ITEMS: "listItems"
    },
    PAGE_SIZE_OPTIONS: {
        mobile: { admin: [8, 10, 12], user: [10, 16, 20], favorites: [10, 20, 30] },
        pc: { admin: [5, 10, 15], user: [10, 20, 40], favorites: [10, 20, 40] }
    },
    LIST_LIMITS: { MAX_LISTS: 10, MAX_ITEMS_PER_LIST: 100 }
};