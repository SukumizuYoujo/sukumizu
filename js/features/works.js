// js/features/works.js

import { state } from "../store/state.js";
import { dom } from "../utils/dom.js";
import { util } from "../utils/common.js";
import { CONSTANTS } from "../config/constants.js";
import { db } from "../config/firebase.js";
import { 
    ref, get, child, set, remove, 
    query, orderByChild, runTransaction // ★追加
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { makeCard, renderSkeletons } from "../components/card.js";
import { updateSortedArrays } from "./core.js";

// ==========================================================================
// 1. ページ読み込みルーティング
// ==========================================================================

export function renderPage(type) {
    // ランキングも「新着」と同じ高機能な読み込みロジック(loadPageWithIndex)を使用する
    if (type === 'new' || type === 'ranking') {
        loadPageWithIndex(type, state.currentPage[type]);
    } else if (type === 'favorites') {
        loadFavoritesPage();
    } else {
        renderLegacyPage(type);
    }
}

// ==========================================================================
// 2. お気に入り専用読み込みロジック
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
// 3. 共通・データ取得ロジック（新着・ランキング用）
// ==========================================================================

async function loadPageWithIndex(viewType, pageNumber) {
    const grid = dom.grids[viewType];
    const pageSize = state.pageSize.user;

    // インデックスの初期化チェック
    if (!state.workIndices) state.workIndices = {};

    // インデックス（ID一覧）がまだ無ければ取得しに行く
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
    try {
        if (viewType === 'ranking') {
            const worksRef = ref(db, CONSTANTS.DB_PATHS.WORKS);
            const q = query(worksRef, orderByChild('score'));
            const snapshot = await get(q);
            
            const ids = [];
            if (snapshot.exists()) {
                snapshot.forEach(childSnap => {
                    const work = { id: childSnap.key, ...childSnap.val() };
                    ids.push(work.id);
                    state.works[work.id] = work;
                });
            }
            // スコアが高い順（降順）にするため反転
            state.workIndices[viewType] = ids.reverse();

        } else {
            const path = `work_orders/${viewType}`; 
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
        }
    } catch (error) {
        console.error("Index fetch error:", error);
        util.showToast("リストの取得に失敗しました");
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
// 4. 既存ロジック（レガシーモード: 管理者おすすめ用）
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
// 5. 共通・ユーティリティ機能
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

// トランザクション処理を使った安全な投票ロジック
export async function handleVote(workId, score, dbPath) {
    // パスが指定されていない場合は自動判定（フォールバック）
    if (!dbPath) {
        if (state.works[workId]) dbPath = CONSTANTS.DB_PATHS.WORKS;
        else if (state.adminPicks[workId]) dbPath = CONSTANTS.DB_PATHS.ADMIN_PICKS;
        else return;
    }

    const workRef = ref(db, `${dbPath}/${workId}`);

    try {
        const result = await runTransaction(workRef, (work) => {
            if (!work) return; 

            if (!work.votes) work.votes = {};
            if (typeof work.score !== 'number') work.score = 0;

            const currentVote = work.votes[state.clientId] || 0;

            if (currentVote === score) {
                // 取り消し処理
                work.score -= score;
                delete work.votes[state.clientId];
            } else {
                // 新規・変更処理
                work.score = (work.score - currentVote) + score;
                work.votes[state.clientId] = score;
            }

            return work;
        });

        if (result.committed) {
            const updatedWork = result.snapshot.val();
            
            // 適切なステートを更新
            if (dbPath === CONSTANTS.DB_PATHS.WORKS) {
                state.works[workId] = { id: workId, ...updatedWork };
            } else if (dbPath === CONSTANTS.DB_PATHS.ADMIN_PICKS) {
                state.adminPicks[workId] = { id: workId, ...updatedWork };
            }

            // UI更新
            const card = document.querySelector(`.item[data-id="${workId}"]`);
            if (card) {
                const goodBtn = card.querySelector('.rating-btn.good');
                const badBtn = card.querySelector('.rating-btn.bad');
                const scoreDisplay = card.querySelector('.score-display');
                
                const newVote = updatedWork.votes?.[state.clientId] || 0;
                
                if (goodBtn) goodBtn.classList.toggle('active', newVote === 1);
                if (badBtn) badBtn.classList.toggle('active', newVote === -1);
                if (scoreDisplay) scoreDisplay.textContent = updatedWork.score;
            }
        }

    } catch (error) {
        console.error("Vote transaction error:", error);
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

