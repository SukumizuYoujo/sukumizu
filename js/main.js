// js/main.js

// 外部モジュール
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { onValue, ref } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

// 内部モジュール
import { CONSTANTS } from "./config/constants.js";
import { auth, db } from "./config/firebase.js";
import { state } from "./store/state.js";
import { dom } from "./utils/dom.js";
import { util } from "./utils/common.js";

import { renderSkeletons } from "./components/card.js";
import { 
    renderPage, handleVote, addWork, 
    renderPaginationButtons 
} from "./features/works.js";
import { 
    toggleFavorite, openAddToListPopover, removeWorkFromList, 
    importList 
} from "./features/lists.js";
import { 
    openTagFilterModal, openContactModal, openInfoModal, 
    setupImagePreviewListeners, initializeDetailsPopup 
} from "./features/modals.js";
import { 
    updateSortedArrays, refreshAllGrids 
} from "./features/core.js";
import { 
    showView, handleUrlBasedView, getScrollTargetForView 
} from "./features/router.js"; // ★ここが重要：router.jsからインポート
import { 
    updateUIforAuthState, subscribeUserData, unsubscribeUserData 
} from "./features/auth.js";

// --- リスナー初期化 (Global) ---
function initializeListeners() {
    // カテゴリ
    onValue(ref(db, CONSTANTS.DB_PATHS.CATEGORIES), (snap) => { 
        state.categories = snap.val() || {}; 
    });
    
    // タグ
    onValue(ref(db, CONSTANTS.DB_PATHS.TAGS), (snap) => {
        state.tags = snap.val() || {}; 
        state.tagNameToDataMap.clear();
        Object.entries(state.tags).forEach(([id, data]) => { 
            state.tagNameToDataMap.set(data.name, { id, ...data }); 
        });
    });

    // 作品データ (メイン)
    onValue(ref(db, CONSTANTS.DB_PATHS.WORKS), (snapshot) => {
        const newWorks = {};
        snapshot.forEach(childSnap => {
            const data = childSnap.val();
            newWorks[childSnap.key] = { 
                id: childSnap.key, 
                ...data, 
                score: Object.values(data?.votes || {}).reduce((s, v) => s + v, 0) 
            };
        });
        state.works = newWorks;
        state.isInitialDataLoaded.works = true;
        updateSortedArrays();
        refreshAllGrids();
    });

    // 管理者ピックアップ
    onValue(ref(db, CONSTANTS.DB_PATHS.ADMIN_PICKS), (snapshot) => {
        const newAdminPicks = {};
        snapshot.forEach(childSnap => {
            newAdminPicks[childSnap.key] = { id: childSnap.key, ...childSnap.val() };
        });
        state.adminPicks = newAdminPicks;
        state.isInitialDataLoaded.adminPicks = true;
        updateSortedArrays();
        refreshAllGrids();
    });
}

// --- ページサイズセレクタ初期化 ---
function initializePageSizeSelectors() {
    const isMobile = window.innerWidth <= 768;
    const deviceType = isMobile ? 'mobile' : 'pc';
    for (const type of ['admin', 'user', 'favorites']) {
        const selector = dom.pageSizeSelectors[type];
        if (!selector) continue;
        const options = CONSTANTS.PAGE_SIZE_OPTIONS[deviceType][type];
        let currentSize = state.pageSize[type];
        if (!options.includes(currentSize)) { currentSize = options[0]; }
        selector.innerHTML = '';
        options.forEach(size => {
            const option = document.createElement('option');
            option.value = size; 
            option.textContent = size;
            if (size == currentSize) { option.selected = true; }
            selector.appendChild(option);
        });
    }
}

// --- 折りたたみセクション設定 ---
function setupCollapsers() {
    document.querySelectorAll('.collapser-header').forEach(header => {
        const content = header.nextElementSibling;
        if (!content || !content.classList.contains('collapsible-content')) return;
        const sectionName = header.dataset.section;
        if (state.sectionsCollapsed[sectionName]) { 
            header.classList.add('collapsed'); 
            content.classList.add('collapsed'); 
        }
        header.addEventListener('click', (e) => {
            if (e.target.tagName === 'SELECT' || e.target.tagName === 'LABEL') return;
            const isCollapsed = header.classList.toggle('collapsed');
            content.classList.toggle('collapsed');
            state.sectionsCollapsed[sectionName] = isCollapsed;
            localStorage.setItem(`${sectionName}SectionCollapsed`, isCollapsed);
        });
    });
}

// --- イベントリスナー設定 ---
function setupEventListeners() {
    // 認証
    dom.loginBtn.addEventListener('click', () => { 
        const p = new GoogleAuthProvider(); 
        signInWithPopup(auth, p).catch(err => util.showToast(`Login failed: ${err.code}`)); 
    });
    dom.logoutBtn.addEventListener('click', () => signOut(auth));

    // ナビゲーション
    dom.nav.home.addEventListener('click', () => showView('main'));
    dom.nav.favorites.addEventListener('click', () => showView('favorites'));
    dom.nav.mylists.addEventListener('click', () => showView('mylists'));
    
    // その他操作
    dom.importPublicListBtn.addEventListener('click', (e) => importList(e.currentTarget.dataset.listId));
    document.getElementById('addBtn').addEventListener("click", () => addWork(dom.urlInput.value.trim()));
    
    // ページサイズ変更
    dom.pageSizeSelectors.admin.addEventListener('change', (e) => { 
        state.pageSize.admin = parseInt(e.target.value, 10); 
        localStorage.setItem('pageSizeAdmin', state.pageSize.admin); 
        renderPage('admin_manga'); renderPage('admin_game'); 
    });
    dom.pageSizeSelectors.user.addEventListener('change', (e) => { 
        state.pageSize.user = parseInt(e.target.value, 10); 
        localStorage.setItem('pageSizeUser', state.pageSize.user); 
        renderPage('new'); renderPage('ranking'); 
    });
    dom.pageSizeSelectors.favorites.addEventListener('change', (e) => { 
        state.pageSize.favorites = parseInt(e.target.value, 10); 
        localStorage.setItem('pageSizeFavorites', state.pageSize.favorites); 
        renderPage('favorites'); 
    });

    // モーダル・トグルボタン
    dom.modalOverlay.addEventListener("click", (e) => { if (e.target === dom.modalOverlay) dom.modalOverlay.classList.add("hidden"); });
    
    const mosaicToggleBtn = document.getElementById('mosaicToggleBtn');
    const hideBadBtn = document.getElementById('hideBadBtn');

    document.getElementById('infoBtn').addEventListener('click', openInfoModal);
    
    hideBadBtn.addEventListener("click", () => { 
        state.hideBadlyRated = !state.hideBadlyRated; 
        hideBadBtn.classList.toggle('active', state.hideBadlyRated); 
        const mobileBtn = dom.mobileMenu.querySelector('[data-action="toggle-bad"]');
        hideBadBtn.textContent = state.hideBadlyRated ? 'Bad評価を再表示' : 'Bad評価を非表示';
        if (mobileBtn) mobileBtn.textContent = hideBadBtn.textContent;
        renderPage('new'); renderPage('ranking');
    });

    mosaicToggleBtn.addEventListener("click", () => {
        state.mosaicActive = !state.mosaicActive;
        localStorage.setItem('mosaicActive', state.mosaicActive);
        document.body.classList.toggle('mosaic-on', state.mosaicActive);
        const text = `モザイク: ${state.mosaicActive ? 'ON' : 'OFF'}`;
        mosaicToggleBtn.textContent = text;
        const mobileBtn = dom.mobileMenu.querySelector('[data-action="toggle-mosaic"]');
        if (mobileBtn) mobileBtn.textContent = text;
    });

    document.querySelectorAll('.filterByTagsBtn').forEach(btn => btn.addEventListener('click', openTagFilterModal));
    document.querySelectorAll('.resetFilterBtn').forEach(btn => btn.addEventListener('click', () => { 
        state.highlightTagIds.clear(); 
        state.hideTagIds.clear(); 
        refreshAllGrids();
    }));
    document.getElementById('contactBtn').addEventListener('click', openContactModal);
    
    // モバイルメニュー
    dom.hamburgerBtn.addEventListener('click', () => {
        dom.mobileMenu.classList.toggle('hidden');
    });
    dom.mobileMenu.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        const action = e.target.dataset.action;
        const button = e.target;
        let shouldCloseMenu = true;

        switch(action) {
            case 'contact': openContactModal(); break;
            case 'filter-tags': openTagFilterModal(); break;
            case 'reset-filter': 
                document.querySelectorAll('.resetFilterBtn').forEach(b => b.click());
                break;
            case 'toggle-bad': hideBadBtn.click(); shouldCloseMenu = false; break;
            case 'toggle-mosaic': mosaicToggleBtn.click(); shouldCloseMenu = false; break;
            case 'toggle-grid-height':
                state.isGridHeightFixedForMobile = !state.isGridHeightFixedForMobile;
                localStorage.setItem('isGridHeightFixedForMobile', state.isGridHeightFixedForMobile);
                button.textContent = `グリッド高さ固定: ${state.isGridHeightFixedForMobile ? 'ON' : 'OFF'}`;
                refreshAllGrids();
                shouldCloseMenu = false;
                break;
            case 'toggle-auto-scroll':
                state.autoScrollOnPageChange = !state.autoScrollOnPageChange;
                localStorage.setItem('autoScrollOnPageChange', state.autoScrollOnPageChange);
                button.textContent = `ページ移動スクロール: ${state.autoScrollOnPageChange ? 'ON' : 'OFF'}`;
                shouldCloseMenu = false;
                break;
            case 'info': openInfoModal(); break;
        }
        if (shouldCloseMenu) {
            dom.mobileMenu.classList.add('hidden');
        }
    });
    
    // サイドバー
    document.getElementById('toggle-sidebar-btn').addEventListener('click', (e) => {
        const isCollapsed = dom.mylistsContainer.classList.toggle('sidebar-collapsed');
        e.currentTarget.textContent = isCollapsed ? '▶' : '◀';
    });
}

// --- 委譲イベントリスナー (Delegated) ---
function setupDelegatedEventListeners() {
    dom.container.addEventListener('click', (e) => {
        const target = e.target;
        
        const card = target.closest('.item');
        if (card) {
            const workId = card.dataset.id;
            const canonicalId = card.dataset.canonicalId;

            if (target.closest('.rating-btn')) {
                const score = Number(target.closest('.rating-btn.good, .rating-btn.bad').dataset.score);
                handleVote(workId, score);
            } else if (target.closest('.favorite-btn')) {
                e.stopPropagation();
                toggleFavorite(canonicalId);
            } else if (target.closest('.add-to-list-btn')) {
                e.stopPropagation();
                openAddToListPopover(canonicalId, target);
            } else if (target.closest('.remove-from-list-btn')) {
                e.stopPropagation();
                const listId = target.dataset.listId;
                if (confirm(`「${util.escapeHTML(state.myLists[listId]?.name || '')}」からこの作品を削除しますか？`)) {
                    removeWorkFromList(canonicalId, listId);
                }
            } else {
                const workData = state.works[workId] || state.adminPicks[workId];
                if(workData && workData.pageUrl) {
                    window.open(workData.pageUrl, "_blank");
                }
            }
            return;
        }

        const paginationButton = target.closest('.pagination button');
        if (paginationButton && !paginationButton.disabled) {
            const paginationContainer = target.closest('.pagination');
            const viewType = paginationContainer.dataset.viewType;
            const newPage = parseInt(paginationButton.dataset.page, 10);
            if (viewType && newPage) {
                state.currentPage[viewType] = newPage;
                renderPage(viewType);

                if (window.innerWidth <= 768 && state.autoScrollOnPageChange) {
                    requestAnimationFrame(() => {
                        const targetElement = getScrollTargetForView(viewType);
                        if (targetElement) {
                            targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    });
                }
            }
        }
    });
}

// --- メイン実行関数 ---
function main() {
    // ローカルストレージ設定の読み込み
    const savedGridHeightSetting = localStorage.getItem('isGridHeightFixedForMobile');
    state.isGridHeightFixedForMobile = savedGridHeightSetting === null ? true : (savedGridHeightSetting === 'true');

    const savedAutoScrollSetting = localStorage.getItem('autoScrollOnPageChange');
    state.autoScrollOnPageChange = savedAutoScrollSetting === null ? true : (savedAutoScrollSetting === 'true');

    const gridHeightBtn = dom.mobileMenu.querySelector('[data-action="toggle-grid-height"]');
    if (gridHeightBtn) gridHeightBtn.textContent = `グリッド高さ固定: ${state.isGridHeightFixedForMobile ? 'ON' : 'OFF'}`;

    const autoScrollBtn = dom.mobileMenu.querySelector('[data-action="toggle-auto-scroll"]');
    if (autoScrollBtn) autoScrollBtn.textContent = `ページ移動スクロール: ${state.autoScrollOnPageChange ? 'ON' : 'OFF'}`;

    if (localStorage.getItem('mosaicActive') === 'true') {
        state.mosaicActive = true; 
        document.body.classList.add('mosaic-on');
    }
    
    // モザイクボタン初期状態
    const mosaicText = `モザイク: ${state.mosaicActive ? 'ON' : 'OFF'}`;
    document.getElementById('mosaicToggleBtn').textContent = mosaicText;
    const mobileMosaicBtn = dom.mobileMenu.querySelector('[data-action="toggle-mosaic"]');
    if(mobileMosaicBtn) mobileMosaicBtn.textContent = mosaicText;

    // ページサイズ設定読み込み
    ['pageSizeAdmin', 'pageSizeUser', 'pageSizeFavorites'].forEach(key => {
        const savedSize = localStorage.getItem(key);
        if (savedSize) {
            const type = key.replace('pageSize', '').toLowerCase();
            state.pageSize[type] = parseInt(savedSize, 10);
        }
    });
    
    state.sectionsCollapsed.admin = localStorage.getItem('adminSectionCollapsed') === 'true';
    state.sectionsCollapsed.user = localStorage.getItem('userSectionCollapsed') === 'true';
    
    // 初期化シーケンス
    initializeListeners();
    
    // スケルトン表示
    Object.values(dom.grids).forEach(grid => {
        const type = Object.keys(dom.grids).find(key => dom.grids[key] === grid);
        const isFav = type === 'favorites';
        const isAdmin = type.startsWith('admin_');
        const pageSize = isAdmin ? state.pageSize.admin : (isFav ? state.pageSize.favorites : state.pageSize.user);
        renderSkeletons(grid, pageSize);
    });

    // 認証監視
    onAuthStateChanged(auth, (user) => {
        updateUIforAuthState(user);
        if (user) {
            subscribeUserData(user);
        } else {
            unsubscribeUserData();
        }
        handleUrlBasedView();
    });
    
    // URL履歴監視
    window.addEventListener('popstate', handleUrlBasedView);

    // その他セットアップ
    state.clientId = util.getClientId();
    initializePageSizeSelectors();
    setupCollapsers();
    setupEventListeners();
    setupDelegatedEventListeners();
    setupImagePreviewListeners();
    initializeDetailsPopup();
}

// アプリケーション起動
main();
