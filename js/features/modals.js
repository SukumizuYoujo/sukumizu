// js/features/modals.js

import { state } from "../store/state.js";
import { dom } from "../utils/dom.js";
import { util } from "../utils/common.js";
import { CONSTANTS } from "../config/constants.js";
import { db } from "../config/firebase.js";
import { ref, push, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { refreshAllGrids } from "./router.js"; // ★変更: core.js -> router.js

export function openTagFilterModal() {
    dom.modalOverlay.classList.remove("hidden");
    const modal = dom.modalContent;
    modal.className = 'modal tag-panel';
    let currentHighlightTagIds = new Set(state.highlightTagIds);
    let currentHideTagIds = new Set(state.hideTagIds);
    modal.innerHTML = `<div class="modal-header">タグで絞り込み</div> <div class="modal-body"> <input type="search" class="tag-search-input" placeholder="お探しのジャンルはなんですか？"> <div class="category-tabs"></div> <div class="tag-list"></div> </div> <div class="modal-footer"> <div id="filter-mode-select-buttons"> <button data-mode="highlight">優先表示タグを選択</button> <button data-mode="hide">非表示タグを選択</button> </div> <button id="tag-panel-reset">現在のリストをリセット</button> <button id="tag-panel-confirm">適用</button> </div>`;
    const searchInput = modal.querySelector('.tag-search-input');
    const categoryTabsContainer = modal.querySelector('.category-tabs');
    const tagListContainer = modal.querySelector('.tag-list');
    const modeSelectButtons = modal.querySelector('#filter-mode-select-buttons');
    let activeCategoryId = Object.keys(state.categories)[0] || '';
    let currentEditingTagSet = state.currentTagEditMode === 'highlight' ? currentHighlightTagIds : currentHideTagIds;
    const updateModeButtons = () => { modeSelectButtons.querySelectorAll('button').forEach(btn => { btn.classList.toggle('active', btn.dataset.mode === state.currentTagEditMode); }); };
    const renderTagList = () => {
        tagListContainer.innerHTML = '';
        Object.entries(state.tags)
            .filter(([, tag]) => tag.category === activeCategoryId && tag.name.toLowerCase().includes(searchInput.value.toLowerCase()))
            .forEach(([tagId, tag]) => {
                const label = document.createElement('label'); const checkbox = document.createElement('input');
                checkbox.type = 'checkbox'; checkbox.value = tagId;
                checkbox.checked = currentEditingTagSet.has(tagId);
                checkbox.onchange = () => { checkbox.checked ? currentEditingTagSet.add(tagId) : currentEditingTagSet.delete(tagId); };
                label.appendChild(checkbox); label.append(` ${tag.name}`);
                tagListContainer.appendChild(label);
            });
    };
    const renderCategoryTabs = () => {
        categoryTabsContainer.innerHTML = '';
        Object.entries(state.categories).forEach(([catId, category]) => {
            const btn = document.createElement('button'); btn.textContent = category.name; btn.className = catId === activeCategoryId ? 'active' : '';
            btn.onclick = () => { activeCategoryId = catId; renderCategoryTabs(); renderTagList(); };
            categoryTabsContainer.appendChild(btn);
        });
    };
    modeSelectButtons.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            state.currentTagEditMode = btn.dataset.mode;
            currentEditingTagSet = state.currentTagEditMode === 'highlight' ? currentHighlightTagIds : currentHideTagIds;
            updateModeButtons(); renderTagList();
        });
    });
    searchInput.oninput = renderTagList;
    modal.querySelector('#tag-panel-reset').onclick = () => { currentEditingTagSet.clear(); renderTagList(); };
    modal.querySelector('#tag-panel-confirm').onclick = () => {
        state.highlightTagIds = new Set(currentHighlightTagIds); state.hideTagIds = new Set(currentHideTagIds);
        refreshAllGrids(); dom.modalOverlay.classList.add("hidden");
    };
    updateModeButtons(); renderCategoryTabs(); renderTagList();
}

export function openContactModal() {
    dom.modalOverlay.classList.remove("hidden");
    const modal = dom.modalContent;
    modal.className = 'modal contact-form';
    modal.innerHTML = `<div class="modal-header">お問い合わせ</div> <form id="contactForm" class="modal-body"> <div class="form-group"> <label for="contactName">お名前<span style="color:red">*</span></label> <input type="text" id="contactName" placeholder="名前またはニックネーム" required> </div> <div class="form-group"> <label for="contactEmail">メール<span style="color:red">*</span></label> <input type="email" id="contactEmail" placeholder="例: info@example.com" required> </div> <div class="form-group"> <label for="contactTitle">タイトル</label> <input type="text" id="contactTitle"> </div> <div class="form-group"> <label for="contactContent">お問い合わせ内容<span style="color:red">*</span></label> <textarea id="contactContent" placeholder="コメントまたはメッセージ" required></textarea> </div> </form> <div class="modal-footer"> <button id="modal-close-btn">閉じる</button> <button id="contact-submit-btn" type="submit" form="contactForm" style="background-color: #28a745; color: white;">送信</button> </div>`;
    modal.querySelector('#modal-close-btn').onclick = () => dom.modalOverlay.classList.add("hidden");
    modal.querySelector('#contactForm').onsubmit = async (event) => {
        event.preventDefault(); const btn = document.getElementById('contact-submit-btn');
        const name = document.getElementById('contactName').value.trim(); const email = document.getElementById('contactEmail').value.trim();
        const title = document.getElementById('contactTitle').value.trim(); const content = document.getElementById('contactContent').value.trim();
        if (!name || !email || !content) { return util.showToast("必須項目をすべて入力してください"); }
        btn.disabled = true; btn.textContent = '送信中...';
        const contactData = { name, email, title, content, timestamp: serverTimestamp(), isRead: false };
        try { await push(ref(db, CONSTANTS.DB_PATHS.CONTACTS), contactData); util.showToast("お問い合わせを送信しました。"); dom.modalOverlay.classList.add("hidden"); }
        catch (error) { util.showToast(`送信に失敗しました: ${error.message}`); btn.disabled = false; btn.textContent = '送信'; }
    };
}
export function openInfoModal() {
    dom.modalOverlay.classList.remove("hidden");
    const modal = dom.modalContent;
    modal.className = 'modal info-panel';
    modal.innerHTML = `
        <div class="modal-header">このサイトについて</div>
        <div class="modal-body">
            <p>DLsiteのおすすめ作品を、みんなで気軽に共有・評価できる非公式ファンサイトです。 気になる作品を投稿したり、ユーザーのレビューを参考にしたり、自分だけのコレクションを作って楽しもう！</p>
            <hr>
            <h3 style="margin-top: 1rem; margin-bottom: 0.5rem;">⚠️ 注意事項</h3>
            <ul style="list-style-position: inside; padding-left: 0.5rem; font-size: 0.9rem; line-height: 1.6;">
                <li>当サイトは個人により運営されております。予告なくサービスの停止、または掲載データの変更・削除を行う場合がございますので、あらかじめご了承ください。</li>
                <li>掲載されているコンテンツ（文章・画像・作品情報等）の著作権は、各権利者に帰属します。内容に問題がある場合は、「お問い合わせ」よりご連絡ください。</li>
                <li>DLsiteのページ構造は作品ごとに異なるため、一部の作品ではタグが自動で追加されない場合がございます。</li>
                <li>自動でタグが追加されない作品につきましては、数日おきに手動で更新を行っております。反映までお時間をいただく場合がございますが、何卒ご理解賜りますようお願い申し上げます。</li>
                <li>当サイト内の一部リンクには、アフィリエイトプログラムを利用しているものが含まれております。</li>
            </ul>
        </div>
        <div class="modal-footer">
            <button id="modal-close-btn">閉じる</button>
        </div>`;
    modal.querySelector('#modal-close-btn').onclick = () => dom.modalOverlay.classList.add("hidden");
}
export function setupImagePreviewListeners() {
    const popup = dom.imagePreviewPopup; if (!popup || !dom.container) return;
    dom.container.addEventListener('mouseover', (e) => {
        if (window.innerWidth <= 768) return;
        if (e.target.tagName !== 'IMG' || !e.target.closest('.item')) return;
        const card = e.target.closest('.item'); const workId = card.dataset.id;
        const work = state.works[workId] || state.adminPicks[workId];
        if (work && work.coverUrl) {
            popup.innerHTML = `<img src="${work.coverUrl}" alt="Preview">`;
            popup.style.visibility = 'hidden'; popup.style.display = 'block';
            const popupRect = popup.getBoundingClientRect(); const cardRect = card.getBoundingClientRect();
            let left = cardRect.right + 10; if (left + popupRect.width > window.innerWidth) { left = cardRect.left - popupRect.width - 10; }
            let top = cardRect.top; if (top + popupRect.height > window.innerHeight) { top = window.innerHeight - popupRect.height - 10; }
            popup.style.left = `${left}px`; popup.style.top = `${top}px`; popup.style.visibility = 'visible';
            e.target.addEventListener('mouseleave', () => { popup.style.display = 'none'; }, { once: true });
        }
    });
}
export function initializeDetailsPopup() {
    const popup = document.getElementById('details-popup');
    if (!popup) return;
    let hideTimeout;
    dom.container.addEventListener('mouseover', (e) => {
        if (window.innerWidth <= 768) return;
        const titleEl = e.target.closest('.title');
        if (!titleEl) return;
        clearTimeout(hideTimeout);
        const card = titleEl.closest('.item');
        const workId = card.dataset.id;
        const work = state.works[workId] || state.adminPicks[workId];
        if (!work || !work.tags || Object.keys(work.tags).length === 0) { popup.style.display = 'none'; return; }
        popup.innerHTML = `<h4>${util.escapeHTML(work.title)}</h4><div class="popup-tags">${Object.values(work.tags).map(tag => `<span class="popup-tag">${util.escapeHTML(tag)}</span>`).join('')}</div>`;
        const cardRect = card.getBoundingClientRect();
        popup.style.display = 'block';
        const popupRect = popup.getBoundingClientRect();
        let top = window.scrollY + cardRect.bottom + 5;
        let left = window.scrollX + cardRect.left;
        if (left + popupRect.width > window.innerWidth) { left = window.scrollX + cardRect.right - popupRect.width; }
        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
    });
    dom.container.addEventListener('mouseout', (e) => {
        const titleEl = e.target.closest('.title');
        if (titleEl && e.relatedTarget !== popup) { hideTimeout = setTimeout(() => { popup.style.display = 'none'; }, 200); }
    });
    popup.addEventListener('mouseover', () => { clearTimeout(hideTimeout); });
    popup.addEventListener('mouseout', () => { hideTimeout = setTimeout(() => { popup.style.display = 'none'; }, 200); });
}
