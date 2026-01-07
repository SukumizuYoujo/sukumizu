// js/components/card.js

import { state } from "../store/state.js";
import { util } from "../utils/common.js";
import { CONSTANTS } from "../config/constants.js"; // 追加

export function makeCard(workId, context = '') {
    // データの取得と保存場所の特定
    let data = state.works[workId];
    let dbPath = CONSTANTS.DB_PATHS.WORKS;

    if (!data) {
        if (state.adminPicks[workId]) {
            data = state.adminPicks[workId];
            dbPath = CONSTANTS.DB_PATHS.ADMIN_PICKS;
        } else {
            // AdminPicksの中からpageUrlで検索（レガシー互換）
            const found = Object.values(state.adminPicks).find(p => p.pageUrl && p.pageUrl.includes(workId));
            if (found) {
                data = found;
                dbPath = CONSTANTS.DB_PATHS.ADMIN_PICKS;
            }
        }
    }

    if (!data) return document.createElement('div');
    
    // IDの正規化
    const canonicalWorkId = data.pageUrl?.match(/(RJ|VJ|BJ)\d{6,}/i)?.[0].toUpperCase() || workId;
    const { title, coverUrl, tags = {}, votes = {}, score = 0 } = data;
    const userVote = votes[state.clientId] || 0;
    
    const isFavorited = state.favorites.has(canonicalWorkId);
    const isInAnyList = Object.keys(state.myListItems).some(listId => state.myListItems[listId]?.[canonicalWorkId]);
    const authDisabled = state.currentUser ? '' : 'disabled';
    
    const card = document.createElement("article");
    card.className = `item`;
    card.dataset.id = workId;
    card.dataset.canonicalId = canonicalWorkId;
    // ★重要: データベースのパスを要素に埋め込む
    card.dataset.dbPath = dbPath;

    let cardActionsHTML = `
        <button class="favorite-btn card-action-btn ${isFavorited ? 'favorited' : ''}" title="お気に入り" ${authDisabled}>♥</button>
        <button class="add-to-list-btn card-action-btn ${isInAnyList ? 'in-list' : ''}" title="リストに追加" ${authDisabled}>+</button>
    `;
    if (context === 'myList' && state.activeListId) {
        cardActionsHTML += `<button class="remove-from-list-btn card-action-btn" title="リストから削除" data-list-id="${state.activeListId}">×</button>`;
    }

    let footerHTML = `
        <div class="rating-buttons">
            <button class="rating-btn good" data-score="1">Good</button>
            <button class="rating-btn bad" data-score="-1">Bad</button>
            <span class="score-display">${score}</span>
        </div>
        <div class="card-actions">${cardActionsHTML}</div>`;
    
    if (['favorites', 'admin', 'myList', 'publicList'].includes(context)) {
        footerHTML = `<div class="card-actions">${cardActionsHTML}</div>`;
    }
    
    card.innerHTML = `<img src="${coverUrl}" alt="${title}" loading="lazy"> <div class="item-body"> <h3 class="title">${util.escapeHTML(title)}</h3> <div class="tags">${Object.values(tags).map(n => `<span class="tag">${util.escapeHTML(n)}</span>`).join("")}</div> </div> <div class="item-footer">${footerHTML}</div>`;
    
    const goodBtn = card.querySelector('.rating-btn.good');
    const badBtn = card.querySelector('.rating-btn.bad');
    if (userVote === 1 && goodBtn) goodBtn.classList.add('active');
    if (userVote === -1 && badBtn) badBtn.classList.add('active');

    return card;
}

export function createSkeletonCard() {
    const card = document.createElement("div");
    card.className = "skeleton-card";
    return card;
}

export function renderSkeletons(gridElement, count) {
    if(!gridElement) return;
    gridElement.innerHTML = "";
    for (let i = 0; i < count; i++) {
        gridElement.appendChild(createSkeletonCard());
    }
}
