// js/features/works.js

import { state } from "../store/state.js";
import { dom } from "../utils/dom.js";
import { util } from "../utils/common.js";
import { CONSTANTS } from "../config/constants.js";
import { db } from "../config/firebase.js";
import { ref, set, remove } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { makeCard } from "../components/card.js";

// --- グリッドの高さ調整 ---
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
        if (isMobile) {
            columnCount = 2;
        } else {
            columnCount = gridComputedStyle.gridTemplateColumns.split(' ').length;
        }

        if (columnCount > 0) {
            const rowCount = Math.ceil(pageSize / columnCount);
            const minHeight = rowCount * cardHeight + (rowCount > 0 ? (rowCount - 1) * rowGap : 0);
            gridElement.style.minHeight = `${minHeight}px`;
        } else {
            gridElement.style.minHeight = 'auto';
        }
    });
}

// --- フィルタリングロジック ---
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

// --- ページ描画 ---
export function renderPage(type) {
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
        currentPage = state.currentPage[type] = totalPages;
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
        new: 'newPagination',
        ranking: 'rankingPagination',
        favorites: 'favoritesPagination'
    }[type];

    if (paginationContainerId) {
        renderPaginationButtons(paginationContainerId, currentPage, totalPages, type);
    }
    
    // 絞り込みボタンの状態更新
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
            mobileResetBtn.classList.remove('hidden');
        } else {
            filterBtn.classList.remove('active');
            filterBtn.textContent = 'タグで絞り込み';
            resetBtn.classList.add('hidden');
            mobileResetBtn.classList.add('hidden');
        }
    }
}

// --- ページネーション ---
export function renderPaginationButtons(containerId, currentPage, totalPages, viewType) {
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
        startPage = 1;
        endPage = totalPages;
    } else if (currentPage <= 3) {
        startPage = 1;
        endPage = 5;
    } else if (currentPage > totalPages - 3) {
        startPage = totalPages - 4;
        endPage = totalPages;
    } else {
        startPage = currentPage - 2;
        endPage = currentPage + 2;
    }

    for (let i = startPage; i <= endPage; i++) {
        container.appendChild(createButton(i, i, false, i === currentPage));
    }

    container.appendChild(createButton('>', currentPage + 1, currentPage === totalPages));
    container.appendChild(createButton('>>', totalPages, currentPage === totalPages));
}

// --- 投票処理 ---
export async function handleVote(workId, score) {
    const data = state.works[workId] || state.adminPicks[workId];
    if(!data) return;
    
    const card = document.querySelector(`.item[data-id="${workId}"]`);
    if(!card) return;

    const goodBtn = card.querySelector('.rating-btn.good');
    const badBtn = card.querySelector('.rating-btn.bad');
    
    const currentVote = data.votes?.[state.clientId] || 0;
    const newVote = currentVote === score ? 0 : score;

    goodBtn.classList.toggle('active', newVote === 1);
    badBtn.classList.toggle('active', newVote === -1);
    
    const workPath = state.works[workId] ? CONSTANTS.DB_PATHS.WORKS : CONSTANTS.DB_PATHS.ADMIN_PICKS;
    const voteRef = ref(db, `${workPath}/${workId}/votes/${state.clientId}`);
    try { await (newVote === 0 ? remove(voteRef) : set(voteRef, newVote)); }
    catch (error) { 
        util.showToast(`投票エラー: ${error.message}`);
        goodBtn.classList.toggle('active', currentVote === 1);
        badBtn.classList.toggle('active', currentVote === -1);
    }
}

// --- 作品追加 ---
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
        
        if (!response.ok) {
            throw new Error(result.error || '不明なエラーが発生しました。');
        }

        util.showToast(result.data.message);
        input.value = "";
    } catch (error) {
        util.showToast(`エラー: ${error.message}`);
        console.error(error);
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
    }
}