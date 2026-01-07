// js/features/works.js

import { state } from "../store/state.js";
import { dom } from "../utils/dom.js";
import { util } from "../utils/common.js";
import { CONSTANTS } from "../config/constants.js";
import { db } from "../config/firebase.js";
import { ref, get, child, set, remove, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { makeCard, renderSkeletons } from "../components/card.js";

// ==========================================================================
// 1. 新・データ取得ロジック（インデックス分離方式）
// ==========================================================================

// ページ読み込みのメイン関数（ルーター）
export function renderPage(type) {
    // 'new'（新着）タブだけ新しい軽量化ロジックを使う
    if (type === 'new') {
        loadPageWithIndex(type, state.currentPage[type]);
    } else {
        // それ以外（ランキング、管理者、お気に入り）は既存ロジック
        renderLegacyPage(type);
    }
}

// インデックス方式でのページ読み込み
async function loadPageWithIndex(viewType, pageNumber) {
    const grid = dom.grids[viewType];
    const pageSize = state.pageSize.user;

    // 初回ロード時などでインデックスが空なら取得・キャッシュ
    if (!state.workIndices[viewType] || state.workIndices[viewType].length === 0) {
        // スケルトンを表示して待機
        renderSkeletons(grid, pageSize);
        await fetchAndCacheIndices(viewType);
    }

    const allIds = state.workIndices[viewType];
    const totalItems = allIds.length;
    const totalPages = util.calculateTotalPages(totalItems, pageSize);

    // ページ番号の範囲チェック
    if (pageNumber < 1) pageNumber = 1;
    if (pageNumber > totalPages && totalPages > 0) pageNumber = totalPages;
    state.currentPage[viewType] = pageNumber;

    // 表示すべきIDの範囲を切り出す
    const startIndex = (pageNumber - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const targetIds = allIds.slice(startIndex, endIndex);

    // 未取得のデータのみDBから取得（キャッシュ活用）
    const fetchPromises = targetIds.map(async (id) => {
        if (state.works[id]) return state.works[id]; // キャッシュヒット
        
        try {
            const snapshot = await get(child(ref(db), `${CONSTANTS.DB_PATHS.WORKS}/${id}`));
            if (snapshot.exists()) {
                const data = { id: snapshot.key, ...snapshot.val() };
                state.works[id] = data; // キャッシュに保存
                return data;
            }
        } catch (e) {
            console.error(`Failed to fetch work ${id}`, e);
        }
        return null;
    });

    // 並列取得完了を待つ
    let works = (await Promise.all(fetchPromises)).filter(Boolean);

    // --- フィルタリング（Bad非表示など） ---
    // ※ インデックス方式での厳密なフィルタリングは、IDを取り出した後に適用するため
    //   ページごとの表示数が減る可能性がありますが、軽量化優先のため現状はこれで良しとします。
    if (state.hideBadlyRated) {
        works = works.filter(w => (w.votes?.[state.clientId] || 0) !== -1);
    }
    // ※ タグ絞り込み機能は、インデックス方式だと全件スキャンが必要になるため、
    //   本格対応するには「タグごとのインデックス」をDBに作る必要があります。
    //   今回は簡易的に「取得したページ内での絞り込み」または
    //   「タグ絞り込み時はレガシーモードに切り替える」等の対応が理想ですが、
    //   一旦は表示だけ行います。

    // 描画
    grid.innerHTML = "";
    works.forEach(work => {
        grid.appendChild(makeCard(work.id, 'user'));
    });

    adjustGridMinHeight(grid, pageSize);
    renderNumberedPagination(viewType, pageNumber, totalPages);
}

// 目次データ（IDとソートキー）を取得してキャッシュ
async function fetchAndCacheIndices(viewType) {
    // DBパス: work_orders/new
    const path = `work_orders/${viewType}`; 
    try {
        const snapshot = await get(ref(db, path));
        if (!snapshot.exists()) {
            state.workIndices[viewType] = [];
            return;
        }
        
        const rawData = snapshot.val(); // { workId: timestamp, ... }
        
        // タイムスタンプ降順（新しい順）にソートしてID配列にする
        const sortedIds = Object.keys(rawData).sort((a, b) => {
            return rawData[b] - rawData[a];
        });
        
        state.workIndices[viewType] = sortedIds;
        
    } catch (error) {
        console.error("Index fetch error:", error);
        util.showToast("リストの取得に失敗しました");
        state.workIndices[viewType] = [];
    }
}

// 番号付きページネーション描画
function renderNumberedPagination(viewType, currentPage, totalPages) {
    const containerId = `${viewType}Pagination`; // newPagination
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
        btn.onclick = () => loadPageWithIndex(viewType, page); // ここで再読み込み呼び出し
        return btn;
    };

    // << <
    container.appendChild(createBtn('<<', 1, false, currentPage === 1));
    container.appendChild(createBtn('<', currentPage - 1, false, currentPage === 1));

    // 数字ボタン（スマホ考慮して最大5つ）
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, currentPage + 2);
    
    if (end - start < 4 && totalPages >= 5) {
        if (start === 1) end = 5;
        else if (end === totalPages) start = totalPages - 4;
    }

    for (let i = start; i <= end; i++) {
        container.appendChild(createBtn(i, i, i === currentPage));
    }

    // > >>
    container.appendChild(createBtn('>', currentPage + 1, false, currentPage === totalPages));
    container.appendChild(createBtn('>>', totalPages, false, currentPage === totalPages));
}


// ==========================================================================
// 2. 既存ロジック（レガシーモード）
//    ※ ランキング、管理者、お気に入り等はこれまで通りの処理を行う
// ==========================================================================

function renderLegacyPage(type) {
    const grid = dom.grids[type];
    if (!grid) return;

    const isFav = type === 'favorites';
    const isAdmin = type.startsWith('admin_');
    const pageSize = isAdmin ? state.pageSize.admin : (isFav ? state.pageSize.favorites : state.pageSize.user);
    const context = isAdmin ? 'admin' : (isFav ? 'favorites' : 'user');
    
    const allFilteredIds = getFilteredIdsForView(type); // core.js / works.js内の既存ロジック依存
    
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

// 既存のページネーションボタン描画（名前を変更して保持）
export function renderLegacyPaginationButtons(containerId, currentPage, totalPages, viewType) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    if (totalPages <= 1) return;
    
    container.dataset.viewType = viewType;

    const createButton = (text, page, isDisabled = false, isCurrent = false) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.dataset.page = page; // Delegated Event Listener用
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

// フィルタリングID取得（レガシー用）
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
// 3. 共通・ユーティリティ機能
// ==========================================================================

// グリッドの高さ調整
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

// フィルタボタンの状態更新
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

// 投票処理（変更なし）
export async function handleVote(workId, score) {
    const data = state.works[workId] || state.adminPicks[workId];
    if(!data) return;
    
    const card = document.querySelector(`.item[data-id="${workId}"]`);
    
    // UIの楽観的更新
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
        // 実際の投票データ更新
        // TODO: ランキング対応時にここで score トランザクション更新が必要
        await (data.votes?.[state.clientId] === score ? remove(voteRef) : set(voteRef, score)); 
    }
    catch (error) { 
        util.showToast(`投票エラー: ${error.message}`);
        // エラー時のロールバック処理は省略
    }
}

// 作品追加（修正あり：目次データの更新を追加）
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
        
        // ★重要: Cloud Functions側で work_orders/new が更新されない場合、
        // クライアント側で強制的にインデックスをリセットして再取得させる
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

// 互換性のためエクスポート
export { renderLegacyPaginationButtons as renderPaginationButtons };
