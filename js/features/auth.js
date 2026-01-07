// js/features/auth.js

import { state } from "../store/state.js";
import { dom } from "../utils/dom.js";
import { CONSTANTS } from "../config/constants.js";
import { db } from "../config/firebase.js";
import { ref, onValue, get, child } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { updateSortedArrays } from "./core.js";
// routerのインポートは削除

let userListeners = [];

export function subscribeUserData(user) {
    unsubscribeUserData();
    if (!user) return;
    const uid = user.uid;
    
    // お気に入り同期
    const favListener = onValue(ref(db, `${CONSTANTS.DB_PATHS.FAVORITES}/${uid}`), snapshot => {
        state.favorites.clear();
        if (snapshot.exists()) { 
            Object.keys(snapshot.val()).forEach(workId => state.favorites.add(workId)); 
        }
        updateSortedArrays();
        // ★ イベント発火でリフレッシュを要求
        window.dispatchEvent(new CustomEvent('dlsite-share:refresh'));
    });
    userListeners.push(favListener);

    // マイリスト同期
    const listMetaListener = onValue(ref(db, `${CONSTANTS.DB_PATHS.USER_LISTS}/${uid}`), async snapshot => {
        const oldListIds = Object.keys(state.myLists);
        const newListIds = snapshot.exists() ? Object.keys(snapshot.val()) : [];
        
        const removedListIds = oldListIds.filter(id => !newListIds.includes(id));
        removedListIds.forEach(id => {
            delete state.myLists[id]; delete state.myListItems[id];
        });

        const listPromises = newListIds.map(id => 
            get(child(ref(db), `${CONSTANTS.DB_PATHS.LISTS}/${id}`)).then(s => s.exists() ? { id: s.key, ...s.val() } : null)
        );
        const lists = (await Promise.all(listPromises)).filter(Boolean);
        
        let needsRender = false;
        for (const l of lists) {
            const needsListener = !state.myLists[l.id];
            state.myLists[l.id] = l;
            if(needsListener) {
                needsRender = true;
                const itemsListener = onValue(ref(db, `${CONSTANTS.DB_PATHS.LIST_ITEMS}/${l.id}`), itemSnap => {
                    state.myListItems[l.id] = itemSnap.val() || {};
                    // ★ イベント発火
                    window.dispatchEvent(new CustomEvent('dlsite-share:refresh'));
                });
                userListeners.push(itemsListener);
            }
        }
        if (needsRender || removedListIds.length > 0) {
            if (state.currentView === 'mylists') { 
                // ★ イベント発火
                window.dispatchEvent(new CustomEvent('dlsite-share:refresh'));
            }
        }
    });
    userListeners.push(listMetaListener);
}

export function unsubscribeUserData() {
    userListeners.forEach(listener => listener());
    userListeners.length = 0;
    state.favorites.clear(); state.myLists = {}; state.myListItems = {};
    if (state.currentUser === null) { 
        updateSortedArrays(); 
        // ★ イベント発火
        window.dispatchEvent(new CustomEvent('dlsite-share:refresh'));
    }
}

export function updateUIforAuthState(user) {
    state.currentUser = user;
    if (user) {
        dom.loginBtn.classList.add('hidden'); dom.logoutBtn.classList.remove('hidden');
        dom.userName.textContent = user.displayName || '名無しさん'; dom.userName.classList.remove('hidden');
        document.querySelectorAll('.requires-auth').forEach(el => el.disabled = false);
    } else {
        dom.loginBtn.classList.remove('hidden'); dom.logoutBtn.classList.add('hidden');
        dom.userName.classList.add('hidden');
        document.querySelectorAll('.requires-auth').forEach(el => el.disabled = true);
    }
}
