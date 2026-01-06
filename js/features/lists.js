// js/features/lists.js

import { state } from "../store/state.js";
import { dom } from "../utils/dom.js";
import { util } from "../utils/common.js";
import { CONSTANTS } from "../config/constants.js";
import { db } from "../config/firebase.js";
import { ref, get, child, push, set, remove, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { makeCard, renderSkeletons } from "../components/card.js";
import { showView } from "./core.js"; // 後ほど作成するcore.jsからインポート

let activePopover = null;

// --- マイリストページ描画 ---
export async function renderMyListsPage() {
    dom.mylistsContainer.innerHTML = `<div class="mylists-sidebar"><h3>マイリスト一覧 (${Object.keys(state.myLists).length}/${CONSTANTS.LIST_LIMITS.MAX_LISTS})</h3><ul id="mylists-sidebar-list"></ul><div class="list-actions"><div class="form-group"><input type="text" id="new-list-name-main" placeholder="新規リスト名"><button id="create-list-btn-main">作成</button></div></div><hr><h3>リストをインポート</h3><div class="list-actions"><div class="form-group"><input type="text" id="import-list-id" placeholder="共有ID"><button id="import-list-btn">追加</button></div></div></div><div class="mylists-content"><h3 id="current-list-name">リストを選択してください</h3><div class="list-actions" id="current-list-actions" style="display:none;"><p>共有ID: <span id="share-id-display"></span></p></div><div id="current-list-grid" class="grid"></div></div>`;
    const listUl = dom.mylistsContainer.querySelector('#mylists-sidebar-list');
    listUl.innerHTML = '';
    Object.values(state.myLists).sort((a, b) => a.createdAt - b.createdAt).forEach(list => {
        const li = document.createElement('li');
        li.dataset.listId = list.id;
        li.innerHTML = `<div class="list-group-item ${list.id === state.activeListId ? 'active' : ''}"><span class="list-name-text">${util.escapeHTML(list.name)}</span><div class="list-item-controls"><button class="edit-list-btn" title="リスト名を編集">✏️</button><button class="delete-list-btn" title="リストを削除">🗑️</button></div></div>`;
        listUl.appendChild(li);
    });
    
    // イベント設定（DOMが生成された後なのでここで設定）
    listUl.onclick = (e) => {
        const target = e.target;
        const li = target.closest('li[data-list-id]');
        if (!li) return;
        const listId = li.dataset.listId;
        if (target.closest('.edit-list-btn')) {
            e.stopPropagation();
            const currentName = state.myLists[listId].name;
            li.innerHTML = `<div class="list-edit-form"><input type="text" value="${util.escapeHTML(currentName)}"><button class="save-list-btn">✔️</button><button class="cancel-edit-btn">❌</button></div>`;
            li.querySelector('input').focus();
        } else if (target.closest('.delete-list-btn')) {
            e.stopPropagation();
            deleteList(listId);
        } else if (target.closest('.save-list-btn')) {
            e.stopPropagation();
            const newName = li.querySelector('input').value.trim();
            if (newName && newName !== state.myLists[listId].name) { renameList(listId, newName); } else { renderMyListsPage(); }
        } else if (target.closest('.cancel-edit-btn')) {
            e.stopPropagation();
            renderMyListsPage();
        } else if (state.activeListId !== listId) {
            state.activeListId = listId;
            renderMyListsPage();
        }
    };
    dom.mylistsContainer.querySelector('#create-list-btn-main').onclick = () => { const input = dom.mylistsContainer.querySelector('#new-list-name-main'); if (input.value) createNewList(input.value).then(() => { input.value = ''; }); };
    dom.mylistsContainer.querySelector('#import-list-btn').onclick = () => { const input = dom.mylistsContainer.querySelector('#import-list-id'); if (input.value) importList(input.value.trim()).then(() => { input.value = ''; }); };
    
    if (state.activeListId && state.myLists[state.activeListId]) {
        const list = state.myLists[state.activeListId];
        const listItems = state.myListItems[state.activeListId] || {};
        const itemIds = Object.keys(listItems).sort((a, b) => listItems[b].addedAt - listItems[a].addedAt);
        
        dom.mylistsContainer.querySelector('#current-list-name').textContent = util.escapeHTML(list.name);
        const grid = dom.mylistsContainer.querySelector('#current-list-grid');
        renderSkeletons(grid, itemIds.length || 10);
        
        const neededWorkIds = itemIds.filter(id => !state.works[id] && !state.adminPicks[id]);
        if (neededWorkIds.length > 0) {
            const workPromises = neededWorkIds.map(workId =>
                get(child(ref(db), `${CONSTANTS.DB_PATHS.WORKS}/${workId}`)).then(snap => {
                    if (snap.exists()) {
                        state.works[snap.key] = { id: snap.key, ...snap.val() };
                    }
                })
            );
            await Promise.all(workPromises);
        }
        
        grid.innerHTML = '';
        itemIds.forEach(workId => {
            if (state.works[workId] || state.adminPicks[workId]) {
                grid.appendChild(makeCard(workId, 'myList'));
            }
        });
        const actions = dom.mylistsContainer.querySelector('#current-list-actions');
        actions.style.display = 'block';
        const shareIdSpan = actions.querySelector('#share-id-display');
        shareIdSpan.textContent = list.id;
        shareIdSpan.onclick = () => {
            navigator.clipboard.writeText(list.id).then(() => util.showToast('IDをコピーしました！'), () => util.showToast('コピーに失敗しました'));
        };
    }
}

// --- 公開リスト描画 ---
export function renderPublicListPage({ info, items, works }) {
    showView('publicList');
    dom.publicListName.textContent = util.escapeHTML(info.name);
    dom.publicListOwner.textContent = `作成者: ${util.escapeHTML(info.ownerName || '匿名')}`;
    dom.importPublicListBtn.dataset.listId = info.id;
    const grid = dom.grids.publicList;
    grid.innerHTML = '';

    const allAvailableWorks = { ...state.works, ...state.adminPicks, ...works };
    const sortedItems = Object.entries(items).sort((a, b) => b[1].addedAt - a[1].addedAt);
    
    sortedItems.forEach(([workId]) => {
        if (allAvailableWorks[workId]) {
                grid.appendChild(makeCard(workId, 'publicList'));
        }
    });
}

export async function getPublicListData(listId) {
    const listSnap = await get(child(ref(db), `${CONSTANTS.DB_PATHS.LISTS}/${listId}`));
    if (!listSnap.exists()) throw new Error("指定されたリストは見つかりませんでした。");

    const itemsSnap = await get(child(ref(db), `${CONSTANTS.DB_PATHS.LIST_ITEMS}/${listId}`));
    const items = itemsSnap.exists() ? itemsSnap.val() : {};
    const workIds = Object.keys(items);

    const workPromises = workIds.map(workId => get(child(ref(db), `${CONSTANTS.DB_PATHS.WORKS}/${workId}`)));
    const workSnapshots = await Promise.all(workPromises);

    const worksForList = {};
    workSnapshots.forEach(snap => {
        if (snap.exists()) {
            worksForList[snap.key] = { id: snap.key, ...snap.val() };
        }
    });
    
    return { info: { id: listSnap.key, ...listSnap.val() }, items: items, works: worksForList };
}

// --- リスト操作系 ---
export async function createNewList(name) {
    if (!state.currentUser) { util.showToast('ログインが必要です。'); return null; }
    if (Object.keys(state.myLists).length >= CONSTANTS.LIST_LIMITS.MAX_LISTS) { util.showToast(`作成できるリストは${CONSTANTS.LIST_LIMITS.MAX_LISTS}個までです。`); return null; }
    const newListRef = push(ref(db, CONSTANTS.DB_PATHS.LISTS));
    await set(newListRef, { ownerId: state.currentUser.uid, ownerName: state.currentUser.displayName, name: name.trim(), createdAt: serverTimestamp() });
    await set(ref(db, `${CONSTANTS.DB_PATHS.USER_LISTS}/${state.currentUser.uid}/${newListRef.key}`), true);
    return newListRef.key;
}

export async function deleteList(listId) {
    if (!state.currentUser) return;
    const listName = state.myLists[listId]?.name || 'このリスト';
    if (!confirm(`「${util.escapeHTML(listName)}」を完全に削除しますか？この操作は取り消せません。`)) return;
    const updates = {};
    updates[`${CONSTANTS.DB_PATHS.LISTS}/${listId}`] = null;
    updates[`${CONSTANTS.DB_PATHS.LIST_ITEMS}/${listId}`] = null;
    updates[`${CONSTANTS.DB_PATHS.USER_LISTS}/${state.currentUser.uid}/${listId}`] = null;
    try {
        await update(ref(db), updates);
        util.showToast('リストを削除しました。');
        if(state.activeListId === listId) { state.activeListId = null; }
    } catch (error) { util.showToast(`削除エラー: ${error.message}`); }
}

export async function renameList(listId, newName) {
    if (!state.currentUser || !newName) return;
    const listRef = ref(db, `${CONSTANTS.DB_PATHS.LISTS}/${listId}/name`);
    try { await set(listRef, newName); util.showToast("リスト名を変更しました。");
    } catch (error) { util.showToast(`エラー: ${error.message}`); }
}

export async function importList(listId) {
    if (!state.currentUser) { util.showToast('ログインが必要です。'); return; }
    if (Object.keys(state.myLists).length >= CONSTANTS.LIST_LIMITS.MAX_LISTS) { util.showToast(`作成できるリストは${CONSTANTS.LIST_LIMITS.MAX_LISTS}個までです。`); return; }
    try {
        const { info, items } = await getPublicListData(listId);
        const newListName = `${info.name} (コピー)`;
        const newListId = await createNewList(newListName);
        if (!newListId) return;
        const itemEntries = Object.entries(items);
        if (itemEntries.length > CONSTANTS.LIST_LIMITS.MAX_ITEMS_PER_LIST) {
            util.showToast(`コピー元リストのアイテム数が上限を超えています。先頭${CONSTANTS.LIST_LIMITS.MAX_ITEMS_PER_LIST}件のみインポートします。`);
            itemEntries.length = CONSTANTS.LIST_LIMITS.MAX_ITEMS_PER_LIST;
        }
        const updates = {};
        itemEntries.forEach(([workId]) => { updates[`${CONSTANTS.DB_PATHS.LIST_ITEMS}/${newListId}/${workId}`] = { addedAt: serverTimestamp() }; });
        await update(ref(db), updates);
        util.showToast(`「${util.escapeHTML(newListName)}」をインポートしました。`);
        state.activeListId = newListId;
    } catch (error) { util.showToast(error.message || 'リストのインポートに失敗しました。'); }
}

export async function toggleWorkInList(workId, listId, shouldBeInList) {
    if (!state.currentUser) return false;
    const itemRef = ref(db, `${CONSTANTS.DB_PATHS.LIST_ITEMS}/${listId}/${workId}`);
    if (shouldBeInList) {
        if (Object.keys(state.myListItems[listId] || {}).length >= CONSTANTS.LIST_LIMITS.MAX_ITEMS_PER_LIST) {
            util.showToast(`リストには${CONSTANTS.LIST_LIMITS.MAX_ITEMS_PER_LIST}件まで登録できます。`);
            const checkbox = document.querySelector(`.add-to-list-popover input[data-list-id="${listId}"]`);
            if (checkbox) checkbox.checked = false;
            return false;
        }
        await set(itemRef, { addedAt: serverTimestamp() });
    } else { await remove(itemRef); }
    return true;
}

export async function removeWorkFromList(workId, listId) {
    if (!state.currentUser) return;
    const itemRef = ref(db, `${CONSTANTS.DB_PATHS.LIST_ITEMS}/${listId}/${workId}`);
    try { await remove(itemRef); util.showToast("リストから作品を削除しました。");
    } catch (error) { util.showToast(`削除エラー: ${error.message}`); }
}

export async function toggleFavorite(workId) {
    if (!state.currentUser) return util.showToast('ログインが必要です。');
    const favRef = ref(db, `${CONSTANTS.DB_PATHS.FAVORITES}/${state.currentUser.uid}/${workId}`);
    
    const card = document.querySelector(`.item[data-canonical-id="${workId}"]`);
    if (card) card.querySelector('.favorite-btn')?.classList.toggle('favorited');

    try {
        await (state.favorites.has(workId) ? remove(favRef) : set(favRef, serverTimestamp()));
    } catch (error) {
        if (card) card.querySelector('.favorite-btn')?.classList.toggle('favorited');
        util.showToast(`お気に入り操作に失敗しました: ${error.message}`);
    }
}

// --- UI系（ポップオーバー） ---
export function openAddToListPopover(workId, button) {
    if (activePopover) activePopover.remove();
    
    const isMobile = window.innerWidth <= 768;
    const popover = document.createElement('div');
    popover.className = 'add-to-list-popover';
    
    let listHtml = '<ul>';
    if (Object.keys(state.myLists).length > 0) {
        for (const listId in state.myLists) {
            const list = state.myLists[listId];
            const isChecked = state.myListItems[listId]?.[workId] ? 'checked' : '';
            listHtml += `<li><label><input type="checkbox" data-list-id="${listId}" ${isChecked}> ${util.escapeHTML(list.name)}</label></li>`;
        }
    } else {
        listHtml += '<li>リストがありません</li>';
    }
    listHtml += '</ul>';
    popover.innerHTML = `${listHtml} <form class="new-list-form"><input type="text" placeholder="新規リスト名" required><button type="submit">+</button></form>`;

    popover.addEventListener('click', e => e.stopPropagation());
    
    if (isMobile) {
        const overlay = document.createElement('div');
        overlay.className = 'popover-overlay';
        overlay.appendChild(popover);
        document.body.appendChild(overlay);
        activePopover = overlay;
        overlay.addEventListener('click', () => { if (activePopover) { activePopover.remove(); activePopover = null; } }, { once: true });
    } else {
        document.body.appendChild(popover);
        activePopover = popover;
        const btnRect = button.getBoundingClientRect();
        const popoverRect = popover.getBoundingClientRect();
        let top = window.scrollY + btnRect.bottom + 5;
        let left = window.scrollX + btnRect.right - popoverRect.width;
        if (left < 0) { left = window.scrollX + btnRect.left; }
        if (top + popoverRect.height > window.innerHeight + window.scrollY) { top = window.scrollY + btnRect.top - popoverRect.height - 5; }
        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
        setTimeout(() => document.addEventListener('click', () => { if (activePopover && !activePopover.classList.contains('popover-overlay')) { activePopover.remove(); activePopover = null; } }, { once: true }), 0);
    }
    
    popover.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener('change', () => toggleWorkInList(workId, cb.dataset.listId, cb.checked)));
    popover.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = e.target.querySelector('input');
        const newListId = await createNewList(input.value);
        if (newListId) await toggleWorkInList(workId, newListId, true);
        if (activePopover) { activePopover.remove(); activePopover = null; }
    });
}