// js/components/card.js

import { state } from "../store/state.js";
// works.js や lists.js のインポートは削除（循環参照の解消）

export function makeCard(workId, context = '') {
    // データ取得 (works または adminPicks から)
    const data = state.works[workId] || state.adminPicks[workId] || Object.values(state.adminPicks).find(p => p.pageUrl && p.pageUrl.includes(workId));
    
    // データがない場合は空のdivを返す
    if (!data) return document.createElement('div');
    
    // IDの正規化
    const canonicalWorkId = data.pageUrl?.match(/(RJ|VJ|BJ)\d{6,}/i)?.[0].toUpperCase() || workId;
    const { title, coverUrl, tags = {}, votes = {}, score = 0 } = data;
    const userVote = votes[state.clientId] || 0;
    
    // 状態判定
    const isFavorited = state.favorites.has(canonicalWorkId);
    const isInAnyList = Object.keys(state.myListItems).some(listId => state.myListItems[listId]?.[canonicalWorkId]);
    const authDisabled = state.currentUser ? false : true;

    // --- DOM生成 ---
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

    // 2. ボディ
    const body = document.createElement("div");
    body.className = "item-body";

    const h3 = document.createElement("h3");
    h3.className = "title";
    h3.textContent = title;
    body.appendChild(h3);

    const tagsDiv = document.createElement("div");
    tagsDiv.className = "tags";
    if (tags) {
        Object.values(tags).forEach(tagName => {
            const span = document.createElement("span");
            span.className = "tag";
            span.textContent = tagName;
            tagsDiv.appendChild(span);
        });
    }
    body.appendChild(tagsDiv);
    card.appendChild(body);

    // 3. フッター
    const footer = document.createElement("div");
    footer.className = "item-footer";

    // アクションボタン
    const cardActions = document.createElement("div");
    cardActions.className = "card-actions";

    const favBtn = document.createElement("button");
    favBtn.className = `favorite-btn card-action-btn ${isFavorited ? 'favorited' : ''}`;
    favBtn.textContent = "♥";
    favBtn.title = "お気に入り";
    if (authDisabled) favBtn.disabled = true;
    cardActions.appendChild(favBtn);

    const addListBtn = document.createElement("button");
    addListBtn.className = `add-to-list-btn card-action-btn ${isInAnyList ? 'in-list' : ''}`;
    addListBtn.textContent = "+";
    addListBtn.title = "リストに追加";
    if (authDisabled) addListBtn.disabled = true;
    cardActions.appendChild(addListBtn);

    if (context === 'myList' && state.activeListId) {
        const removeBtn = document.createElement("button");
        removeBtn.className = "remove-from-list-btn card-action-btn";
        removeBtn.textContent = "×";
        removeBtn.title = "リストから削除";
        removeBtn.dataset.listId = state.activeListId;
        cardActions.appendChild(removeBtn);
    }

    // 評価ボタン (特定のビュー以外で表示)
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

    footer.appendChild(cardActions);
    card.appendChild(footer);

    return card;
}

// スケルトン作成
export function createSkeletonCard() {
    const card = document.createElement("div");
    card.className = "skeleton-card";
    return card;
}

export function renderSkeletons(gridElement, count) {
    if(!gridElement) return;
    gridElement.innerHTML = "";
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
        fragment.appendChild(createSkeletonCard());
    }
    gridElement.appendChild(fragment);
}
