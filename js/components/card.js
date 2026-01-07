// js/components/card.js

import { state } from "../store/state.js";
import { util } from "../utils/common.js";
import { toggleFavorite, openAddToListPopover, removeWorkFromList, handleVote } from "../features/lists.js"; // 必要な関数があれば適宜インポート調整

export function makeCard(workId, context = '') {
    // データ取得 (works または adminPicks から)
    const data = state.works[workId] || state.adminPicks[workId] || Object.values(state.adminPicks).find(p => p.pageUrl && p.pageUrl.includes(workId));
    
    // データがない場合は空のdivを返す（エラー回避）
    if (!data) return document.createElement('div');
    
    // IDの正規化
    const canonicalWorkId = data.pageUrl?.match(/(RJ|VJ|BJ)\d{6,}/i)?.[0].toUpperCase() || workId;
    const { title, coverUrl, tags = {}, votes = {}, score = 0 } = data;
    const userVote = votes[state.clientId] || 0;
    
    // 状態判定
    const isFavorited = state.favorites.has(canonicalWorkId);
    const isInAnyList = Object.keys(state.myListItems).some(listId => state.myListItems[listId]?.[canonicalWorkId]);
    const authDisabled = state.currentUser ? false : true; // disabled属性用

    // --- DOM生成 (createElement使用) ---
    const card = document.createElement("article");
    card.className = "item";
    card.dataset.id = workId;
    card.dataset.canonicalId = canonicalWorkId;

    // 1. 画像
    const img = document.createElement("img");
    img.src = coverUrl;
    img.alt = title;
    img.loading = "lazy";
    card.appendChild(img);

    // 2. ボディ (タイトル・タグ)
    const body = document.createElement("div");
    body.className = "item-body";

    const h3 = document.createElement("h3");
    h3.className = "title";
    h3.textContent = title; // textContentならHTMLタグが含まれていても無害化される
    body.appendChild(h3);

    const tagsDiv = document.createElement("div");
    tagsDiv.className = "tags";
    // タグ生成
    Object.values(tags).forEach(tagName => {
        const span = document.createElement("span");
        span.className = "tag";
        span.textContent = tagName;
        tagsDiv.appendChild(span);
    });
    body.appendChild(tagsDiv);
    card.appendChild(body);

    // 3. フッター (評価ボタン・アクションボタン)
    const footer = document.createElement("div");
    footer.className = "item-footer";

    // アクションボタン群 (お気に入り / リスト追加)
    const cardActions = document.createElement("div");
    cardActions.className = "card-actions";

    // お気に入りボタン
    const favBtn = document.createElement("button");
    favBtn.className = `favorite-btn card-action-btn ${isFavorited ? 'favorited' : ''}`;
    favBtn.title = "お気に入り";
    favBtn.textContent = "♥";
    if (authDisabled) favBtn.disabled = true;
    cardActions.appendChild(favBtn);

    // リスト追加ボタン
    const addListBtn = document.createElement("button");
    addListBtn.className = `add-to-list-btn card-action-btn ${isInAnyList ? 'in-list' : ''}`;
    addListBtn.title = "リストに追加";
    addListBtn.textContent = "+";
    if (authDisabled) addListBtn.disabled = true;
    cardActions.appendChild(addListBtn);

    // マイリスト表示時のみ削除ボタンを追加
    if (context === 'myList' && state.activeListId) {
        const removeBtn = document.createElement("button");
        removeBtn.className = "remove-from-list-btn card-action-btn";
        removeBtn.title = "リストから削除";
        removeBtn.dataset.listId = state.activeListId;
        removeBtn.textContent = "×";
        cardActions.appendChild(removeBtn);
    }

    // 評価ボタン群 (特定のビューでは表示しない)
    if (!['favorites', 'admin', 'myList', 'publicList'].includes(context)) {
        const ratingDiv = document.createElement("div");
        ratingDiv.className = "rating-buttons";

        const goodBtn = document.createElement("button");
        goodBtn.className = `rating-btn good ${userVote === 1 ? 'active' : ''}`;
        goodBtn.dataset.score = "1";
        goodBtn.textContent = "Good";
        ratingDiv.appendChild(goodBtn);

        const badBtn = document.createElement("button");
        badBtn.className = `rating-btn bad ${userVote === -1 ? 'active' : ''}`;
        badBtn.dataset.score = "-1";
        badBtn.textContent = "Bad";
        ratingDiv.appendChild(badBtn);

        const scoreSpan = document.createElement("span");
        scoreSpan.className = "score-display";
        scoreSpan.textContent = score;
        ratingDiv.appendChild(scoreSpan);

        footer.appendChild(ratingDiv);
    }

    // アクションボタンをフッターに追加
    footer.appendChild(cardActions);
    card.appendChild(footer);

    return card;
}

// スケルトン作成 (ここはinnerHTMLでも単純なのでOKだが、念のため統一)
export function createSkeletonCard() {
    const card = document.createElement("div");
    card.className = "skeleton-card";
    return card;
}

export function renderSkeletons(gridElement, count) {
    if(!gridElement) return;
    gridElement.innerHTML = "";
    const fragment = document.createDocumentFragment(); // フラグメントを使って一度に描画
    for (let i = 0; i < count; i++) {
        fragment.appendChild(createSkeletonCard());
    }
    gridElement.appendChild(fragment);
}
