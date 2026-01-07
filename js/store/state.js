// js/store/state.js

export const state = {
    // --- 既存データ ---
    works: {}, // 作品データのキャッシュ
    adminPicks: {}, 
    tags: {}, 
    tagNameToDataMap: new Map(), 
    categories: {},
    
    // --- ソート済みIDリスト（既存ロジック用） ---
    sortedWorkIds: { new: [], ranking: [], favorites: [] },
    sortedAdminIds: { manga: [], game: [] },
    
    // --- 目次データ（インデックス分離方式用） ---
    workIndices: { 
        new: [],      // 新着順のIDリスト（全件のIDのみ）
        ranking: []   // ランキング用
    },
    // ---------------------------------------------------

    currentPage: { new: 1, ranking: 1, admin_manga: 1, admin_game: 1, favorites: 1 },
    pageSize: { admin: 10, user: 40, favorites: 40 },
    sectionsCollapsed: { admin: false, user: false },
    clientId: null, 
    hideBadlyRated: false, 
    mosaicActive: false,
    highlightTagIds: new Set(), 
    hideTagIds: new Set(), 
    currentTagEditMode: 'highlight',
    currentUser: null, 
    favorites: new Set(), 
    myLists: {}, 
    myListItems: {}, 
    activeListId: null, 
    currentView: 'main',
    isInitialDataLoaded: { works: false, adminPicks: false },
    isGridHeightFixedForMobile: true,
    autoScrollOnPageChange: true,
};
