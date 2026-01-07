// js/features/works.js

import { state } from "../store/state.js";
import { dom } from "../utils/dom.js";
import { util } from "../utils/common.js";
import { CONSTANTS } from "../config/constants.js";
import { db } from "../config/firebase.js";
import { 
    ref, get, child, set, remove, 
    query, orderByChild, limitToLast 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { makeCard, renderSkeletons } from "../components/card.js";
import { updateSortedArrays } from "./core.js";

// ==========================================================================
// 1. ページ読み込みルーティング
// ==========================================================================

export function renderPage(type) {
    if (type === 'new') {
        // 新着はインデックスリスト方式
        loadPageWithIndex(type, state.currentPage[type]);
    } else if (type === 'ranking') {
        //  ランキングはスコア順に直接取得
        loadRankingPage();
    } else if (type === 'favorites') {
        loadFavoritesPage();
    } else {
        renderLegacyPage(type);
    }
}

// ==========================================================================
// 2. ランキング専用読み込みロジック (自動ソート機能)
// ==========================================================================

async function loadRankingPage() {
    const grid = dom.grids.ranking;
    // ランキングは上位20件固定表示とする（ページネーションなし）
    const limit = 20; 
    
    renderSkeletons(grid, limit);

    try {
        // Firebaseの機能で score の高い順（昇順）に取得し、後で逆転させる
        const worksRef = ref(db, CONSTANTS.DB_PATHS.WORKS);
        const rankingQuery = query(worksRef, orderByChild('score'), limitToLast(limit));
        
        const snapshot = await get(rankingQuery);
        
        if (!snapshot.exists()) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">データがありません。</div>';
            return;
        }

        const rankingData = [];
        snapshot.forEach(childSnap => {
            const work = { id: childSnap.key, ...childSnap.val() };
            rankingData.push(work);
            // キャッシュにも保存しておく
            state.works[work.id] = work;
        });

        // 昇順（低い順）で来るので、逆転させて高い順にする
        rankingData.reverse();

        grid.innerHTML = "";
        rankingData.forEach(work => {
            grid.appendChild(makeCard(work.id, 'user'));
        });

        // ページネーションは非表示にする
        const container = document.getElementById('rankingPagination');
        if (container) container.innerHTML = '';

        adjustGridMinHeight(grid, limit);

    } catch (error) {
        console.error("Ranking fetch error:", error);
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">読み込みに失敗しました。</div>';
    }
}

// ==========================================================================
// 3. お気に入り専用読み込みロジック
// ==========================================================================

async function loadFavoritesPage() {
    const grid = dom.grids.favorites;
    const pageSize = state.pageSize.favorites;
    
    renderSkeletons(grid, pageSize);

    const favIds = Array.from(state.favorites);

    if (favIds.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">お気に入りはまだありません。</div>';
        return;
    }

    const missingIds = favIds.filter(id => {
        const isCached = state.works[id] || Object.values(state.works).some(w => w.id === id || (w.pageUrl && w.pageUrl.includes(id)));
        return !isCached;
    });

    if (missingIds.length > 0) {
        try {
            const fetchPromises = missingIds.map(async (id) => {
                const snapshot = await get(child(ref(db), `${CONSTANTS.DB_PATHS.WORKS}/${id}`));
                if (snapshot.exists()) {
                    const data = { id: snapshot.key, ...snapshot.val() };
                    state.works[snapshot.key] = data;
                }
            });
            await Promise.all(fetchPromises);
            updateSortedArrays();
        } catch (e) {
            console.error("Favorites fetch error:", e);
            util.showToast("お気に入りデータの取得に失敗しました");
        }
    }

    renderLegacyPage('favorites');
}


// ==========================================================================
// 4. 新着データ取得ロジック（インデックス方式）
// ==========================================================================

async function loadPageWithIndex(viewType, pageNumber) {
    const grid = dom.grids[viewType];
    const pageSize = state.pageSize.user;

    if (!state.workIndices) state.workIndices = {};

    if (!state.workIndices[viewType] || state.workIndices[viewType].length === 0) {
        renderSkeletons(grid, pageSize);
        await fetchAndCacheIndices(viewType);
    }

    const allIds = state.workIndices[viewType] || [];
    const totalItems = allIds.length;
    const totalPages = util.calculateTotalPages(totalItems, pageSize);

    if (pageNumber < 1) pageNumber = 1;
    if (pageNumber > totalPages && totalPages > 0) pageNumber = totalPages;
    state.currentPage[viewType] = pageNumber;

    const startIndex = (pageNumber - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const targetIds = allIds.slice(startIndex, endIndex);

    const fetchPromises = targetIds.map(async (id) => {
        if (state.works[id]) return state.works[id];
        try {
            const snapshot = await get(child(ref(db), `${CONSTANTS.DB_PATHS.WORKS}/${id}`));
            if (snapshot.exists()) {
                const data = { id: snapshot.key, ...snapshot.val() };
                state.works[id] = data;
                return data;
            }
        } catch (e) {
            console.error(`Failed to fetch work ${id}`, e);
        }
        return null;
    });

    let works = (await Promise.all(fetchPromises)).filter(Boolean);

    if (state.hideBadlyRated) {
        works = works.filter(w => (w.votes?.[state.clientId] || 0) !== -1);
    }

    grid.innerHTML = "";
    if (works.length === 0 && totalItems === 0) {
         grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">データがありません。</div>';
    } else {
        works.forEach(work => {
            grid.appendChild(makeCard(work.id, 'user'));
        });
    }

    adjustGridMinHeight(grid, pageSize);
    renderNumberedPagination(viewType, pageNumber, totalPages);
}

async function fetchAndCacheIndices(viewType) {
    const path = `work_orders/${viewType}`; 
    try {
        const snapshot = await get(ref(db, path));
        if (!snapshot.exists()) {
            state.workIndices[viewType] = [];
            return;
        }
        const rawData = snapshot.val();
        
        let sortedIds = [];
        if (Array.isArray(rawData)) {
            sortedIds = rawData;
        } else if (typeof rawData === 'object' && rawData !== null) {
            sortedIds = Object.keys(rawData).sort((a, b) => {
                return rawData[b] - rawData[a];
            });
        }
        state.workIndices[viewType] = sortedIds;
    } catch (error) {
        console.error("Index fetch error:", error);
        state.workIndices[viewType] = [];
    }
}

function renderNumberedPagination(viewType, currentPage, totalPages) {
    const containerId = `${viewType}Pagination`;
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    container.dataset.viewType = viewType;

    if (totalPages <= 1) return;

    const createBtn = (text, page, isActive = false, isDisabled = false) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        if (isDisabled) btn.disabled = true;
        if (isActive) btn.classList.add('active');
        btn.onclick = () => loadPageWithIndex(viewType, page);
        return btn;
    };

    container.appendChild(createBtn('<<', 1, false, currentPage === 1));
    container.appendChild(createBtn('<', currentPage - 1, false, currentPage === 1));

    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, currentPage + 2);
    
    if (end - start < 4 && totalPages >= 5) {
        if (start === 1) end = 5;
        else if (end === totalPages) start = totalPages - 4;
    }

    for (let i = start; i <= end; i++) {
        container.appendChild(createBtn(i, i, i === currentPage));
    }

    container.appendChild(createBtn('>', currentPage + 1, false, currentPage === totalPages));
    container.appendChild(createBtn('>>', totalPages, false, currentPage === totalPages));
}


// ==========================================================================
// 5. 既存ロジック（レガシーモード）
// ==========================================================================

function renderLegacyPage(type) {
    const grid = dom.grids[type];
    if (!grid) return;

    const isFav = type === 'favorites';
    const isAdmin = type.startsWith('admin_');
    const pageSize = isAdmin ? state.pageSize.admin : (isFav ? state.pageSize.favorites : state.pageSize.user);
    const context = isAdmin ? 'admin' : (isFav ? 'favorites' : 'user');
    
    const allFilteredIds = getFilteredIdsForView(type);
    
    const totalPages = util.calculateTotalPages(allFilteredIds.length, pageSize);
    let currentPage = state.currentPage[type];
    if (currentPage > totalPages) {
        currentPage = state.currentPage[type] = Math.max(1, totalPages);
    }
    
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageIds = allFilteredIds.slice(startIndex, endIndex);

    grid.innerHTML = "";
    pageIds.forEach(id => {
        grid.appendChild(makeCard(id, context));
    });
    
    adjustGridMinHeight(grid, pageSize);

    const paginationContainerId = {
        admin_manga: 'adminMangaPagination',
        admin_game: 'adminGamePagination',
        ranking: 'rankingPagination',
        favorites: 'favoritesPagination'
    }[type];

    if (paginationContainerId) {
        renderLegacyPaginationButtons(paginationContainerId, currentPage, totalPages, type);
    }
    
    updateFilterButtonState(grid);
}

// 修正: export の競合を解消
export function renderPaginationButtons(containerId, currentPage, totalPages, viewType) {
    renderLegacyPaginationButtons(containerId, currentPage, totalPages, viewType);
}

export function renderLegacyPaginationButtons(containerId, currentPage, totalPages, viewType) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    if (totalPages <= 1) return;
    
    container.dataset.viewType = viewType;

    const createButton = (text, page, isDisabled = false, isCurrent = false) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.dataset.page = page;
        if (isDisabled) btn.disabled = true;
        if (isCurrent) btn.classList.add('active');
        return btn;
    };
    
    container.appendChild(createButton('<<', 1, currentPage === 1));
    container.appendChild(createButton('<', currentPage - 1, currentPage === 1));

    let startPage, endPage;
    if (totalPages <= 5) {
        startPage = 1; endPage = totalPages;
    } else if (currentPage <= 3) {
        startPage = 1; endPage = 5;
    } else if (currentPage > totalPages - 3) {
        startPage = totalPages - 4; endPage = totalPages;
    } else {
        startPage = currentPage - 2; endPage = currentPage + 2;
    }

    for (let i = startPage; i <= endPage; i++) {
        container.appendChild(createButton(i, i, false, i === currentPage));
    }

    container.appendChild(createButton('>', currentPage + 1, currentPage === totalPages));
    container.appendChild(createButton('>>', totalPages, currentPage === totalPages));
}

export function getFilteredIdsForView(type) {
    const isAdmin = type.startsWith('admin_');
    const isFav = type === 'favorites';
    
    let baseIds = [];
    let sourceData = state.works;

    if (isAdmin) {
        const genre = type.split('_')[1];
        baseIds = state.sortedAdminIds[genre] || [];
        sourceData = state.adminPicks;
    } else if (isFav) {
        baseIds = state.sortedWorkIds.favorites || [];
        sourceData = { ...state.works, ...state.adminPicks };
    } else {
        baseIds = state.sortedWorkIds[type] || [];
    }
    
    let filteredIds = [...baseIds];

    if (state.hideBadlyRated && !isAdmin && !isFav) {
        filteredIds = filteredIds.filter(id => (sourceData[id]?.votes?.[state.clientId] || 0) !== -1);
    }

    if (!isAdmin && (state.highlightTagIds.size > 0 || state.hideTagIds.size > 0)) {
        const hasHideTag = id => util.hasAnyOfTags(sourceData[id], state.hideTagIds);
        const hasHighlightTag = id => util.hasAnyOfTags(sourceData[id], state.highlightTagIds);

        const nonHidden = filteredIds.filter(id => !hasHideTag(id));
        if (state.highlightTagIds.size > 0) {
            const highlighted = nonHidden.filter(hasHighlightTag);
            const others = nonHidden.filter(id => !hasHighlightTag(id));
            return [...highlighted, ...others];
        }
        return nonHidden;
    }
    return filteredIds;
}

// ==========================================================================
// 6. 共通・ユーティリティ機能
// ==========================================================================

export function adjustGridMinHeight(gridElement, pageSize) {
    if (!gridElement) return;
    const isMobile = window.innerWidth <= 768;
    if (isMobile && !state.isGridHeightFixedForMobile) {
        gridElement.style.minHeight = 'auto';
        return;
    }
    requestAnimationFrame(() => {
        const gridComputedStyle = window.getComputedStyle(gridElement);
        const rowGap = parseInt(gridComputedStyle.gap, 10) || (isMobile ? 12 : 16);
        const cardHeight = 320; 
        let columnCount;
        if (isMobile) { columnCount = 2; } 
        else { columnCount = gridComputedStyle.gridTemplateColumns.split(' ').length; }

        if (columnCount > 0) {
            const rowCount = Math.ceil(pageSize / columnCount);
            const minHeight = rowCount * cardHeight + (rowCount > 0 ? (rowCount - 1) * rowGap : 0);
            gridElement.style.minHeight = `${minHeight}px`;
        } else {
            gridElement.style.minHeight = 'auto';
        }
    });
}

function updateFilterButtonState(grid) {
    const viewContainer = grid.closest('.view-container') || dom.views.main;
    const filterBtn = viewContainer.querySelector('.filterByTagsBtn');
    const resetBtn = viewContainer.querySelector('.resetFilterBtn');
    const mobileResetBtn = dom.mobileMenu.querySelector('[data-action="reset-filter"]');
    if(filterBtn && resetBtn) {
        const activeFiltersCount = state.highlightTagIds.size + state.hideTagIds.size;
        if (activeFiltersCount > 0) {
            filterBtn.classList.add('active');
            filterBtn.textContent = `タグ絞り込み (${state.highlightTagIds.size}優先 / ${state.hideTagIds.size}非表示)`;
            resetBtn.classList.remove('hidden');
            if(mobileResetBtn) mobileResetBtn.classList.remove('hidden');
        } else {
            filterBtn.classList.remove('active');
            filterBtn.textContent = 'タグで絞り込み';
            resetBtn.classList.add('hidden');
            if(mobileResetBtn) mobileResetBtn.classList.add('hidden');
        }
    }
}

export async function handleVote(workId, score) {
    const data = state.works[workId] || state.adminPicks[workId];
    if(!data) return;
    
    const card = document.querySelector(`.item[data-id="${workId}"]`);
    if(card) {
        const goodBtn = card.querySelector('.rating-btn.good');
        const badBtn = card.querySelector('.rating-btn.bad');
        const currentVote = data.votes?.[state.clientId] || 0;
        const newVote = currentVote === score ? 0 : score;
        goodBtn.classList.toggle('active', newVote === 1);
        badBtn.classList.toggle('active', newVote === -1);
    }
    
    const workPath = state.works[workId] ? CONSTANTS.DB_PATHS.WORKS : CONSTANTS.DB_PATHS.ADMIN_PICKS;
    const voteRef = ref(db, `${workPath}/${workId}/votes/${state.clientId}`);
    try { 
        await (data.votes?.[state.clientId] === score ? remove(voteRef) : set(voteRef, score)); 
    }
    catch (error) { 
        util.showToast(`投票エラー: ${error.message}`);
    }
}

export async function addWork(url) {
    const originalUrl = url.trim();
    if (!originalUrl.includes("dlsite.com")) {
        return util.showToast("有効なDLsiteのURLを入力してください");
    }

    const functionUrl = "https://addworkfromurl-vubh7ebq4a-uc.a.run.app"; 
    const btn = document.getElementById('addBtn');
    const input = dom.urlInput;
    btn.disabled = true;
    btn.classList.add('loading');

    try {
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { url: originalUrl } }),
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '不明なエラーが発生しました。');

        util.showToast(result.data.message);
        input.value = "";
        
        state.workIndices['new'] = []; 
        renderPage('new');

    } catch (error) {
        util.showToast(`エラー: ${error.message}`);
        console.error(error);
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
    }
}
