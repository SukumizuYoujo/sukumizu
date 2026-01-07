// js/features/router.js

import { dom } from "../utils/dom.js";
import { state } from "../store/state.js";
import { util } from "../utils/common.js";
import { renderPage } from "./works.js"; 
import { renderSkeletons } from "../components/card.js"; 
import { renderMyListsPage, renderPublicListPage, getPublicListData } from "./lists.js";

// --- ビュー切り替え ---
export function showView(viewName) {
    state.currentView = viewName;
    
    // DOMの表示切り替え
    Object.keys(dom.views).forEach(key => { 
        dom.views[key].style.display = key === viewName ? 'block' : 'none'; 
    });
    
    // ナビゲーションのActive状態更新
    Object.keys(dom.nav).forEach(key => {
        const viewForNav = key === 'home' ? 'main' : (key === 'mylists' ? 'mylists' : key);
        dom.nav[key].classList.toggle('active', viewForNav === viewName || (viewForNav === 'main' && viewName === 'publicList'));
    });
    
    // URL履歴の更新
    const url = new URL(window.location);
    if (viewName === 'publicList') { 
        /* URLはパブリックリスト読み込み時に設定済み */ 
    } else if (viewName !== 'main') { 
        url.searchParams.set('view', viewName); url.searchParams.delete('list'); history.pushState({ view: viewName }, '', url); 
    } else { 
        url.searchParams.delete('view'); url.searchParams.delete('list'); history.pushState({ view: 'main' }, '', url); 
    }
    
    // ★★★ ホームに戻った時の処理（ここを修正） ★★★
    if (viewName === 'main') {
        // 1. 下部タブ（みんなの投稿）を「新着」にリセット
        const newTabBtn = document.getElementById('tab-new');
        if (newTabBtn) newTabBtn.checked = true;

        // 2. 上部タブ（管理者のおすすめ）を「漫画」にリセット
        const adminMangaTabBtn = document.getElementById('tab-admin_manga');
        if (adminMangaTabBtn) adminMangaTabBtn.checked = true;

        // 3. すべてのメイングリッドを再描画する
        // これがないと、他のページから戻ってきた時に空っぽになります
        renderPage('admin_manga');
        renderPage('admin_game');
        renderPage('new');
        // ランキングは重いのでタブ切り替え時まで描画を遅らせても良いが、
        // 念のため描画しておくなら以下を追加（必須ではありません）
        // renderPage('ranking'); 
    }
    // お気に入り表示時
    else if (viewName === 'favorites') {
        if(!state.isInitialDataLoaded.works) renderSkeletons(dom.grids.favorites, state.pageSize.favorites);
        renderPage('favorites');
    }
    // マイリスト表示時
    else if (viewName === 'mylists') {
        renderMyListsPage();
    }
}

// --- グリッド一括更新 ---
export function refreshAllGrids() {
    const currentView = state.currentView;
    if (currentView === 'main' || currentView === 'publicList') {
        ['new', 'ranking', 'admin_manga', 'admin_game'].forEach(type => renderPage(type));
    } else if (currentView === 'favorites') {
        renderPage('favorites');
    } else if (currentView === 'mylists') {
        renderMyListsPage();
    }
}

// --- URL初期化処理 ---
export function handleUrlBasedView() {
    const params = new URLSearchParams(window.location.search);
    const listId = params.get('list'); 
    const view = params.get('view');
    
    if (listId) {
        getPublicListData(listId)
            .then(data => {
                showView('publicList');
                renderPublicListPage(data);
            })
            .catch(err => { 
                console.error(err); util.showToast(err.message); showView('main'); 
            });
    } else if (view && dom.views[view]) {
        if(dom.views[view].querySelector('.requires-auth') && !state.currentUser) {
            showView('main');
        } else {
            showView(view);
        }
    } else { 
        showView('main'); 
    }
}

// --- スクロール位置制御 ---
export function getScrollTargetForView(viewType) {
    const grid = dom.grids[viewType];
    if (!grid) return null;
    const collapsibleParent = grid.closest('.collapsible-content');
    if (collapsibleParent) {
        const sectionHeader = collapsibleParent.previousElementSibling;
        if (sectionHeader && sectionHeader.matches('.section-header')) { return sectionHeader; }
    }
    const viewContainer = grid.closest('.view-container');
    if (viewContainer) { return viewContainer.querySelector('.section-header'); }
    return null;
}
