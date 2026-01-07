// js/features/router.js

import { dom } from "../utils/dom.js";
import { state } from "../store/state.js";
import { util } from "../utils/common.js";
import { renderPage } from "./works.js"; // renderPageはworks.jsから
import { renderSkeletons } from "../components/card.js"; // ★修正: renderSkeletonsはcard.jsから読み込む
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
        url.searchParams.set('view', viewName); 
        url.searchParams.delete('list'); 
        history.pushState({ view: viewName }, '', url); 
    } else { 
        url.searchParams.delete('view'); 
        url.searchParams.delete('list'); 
        history.pushState({ view: 'main' }, '', url); 
    }
    
    // 必要に応じた描画処理
    if (viewName === 'favorites') {
        if(!state.isInitialDataLoaded.works) renderSkeletons(dom.grids.favorites, state.pageSize.favorites);
        renderPage('favorites');
    }
    if (viewName === 'mylists') renderMyListsPage();
}

// --- URL初期化処理 ---
export function handleUrlBasedView() {
    const params = new URLSearchParams(window.location.search);
    const listId = params.get('list'); 
    const view = params.get('view');
    
    if (listId) {
        getPublicListData(listId)
            .then(renderPublicListPage)
            .catch(err => { 
                console.error(err); 
                util.showToast(err.message); 
                showView('main'); 
            });
    } else if (view && dom.views[view]) {
        // requires-auth チェック
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
        if (sectionHeader && sectionHeader.matches('.section-header')) {
            return sectionHeader;
        }
    }

    const viewContainer = grid.closest('.view-container');
    if (viewContainer) {
        return viewContainer.querySelector('.section-header');
    }

    return null;
}
