// js/features/core.js

import { state } from "../store/state.js";
import { util } from "../utils/common.js";

// --- ソート処理 ---
export function updateSortedArrays() {
    const allWorks = {...state.works, ...state.adminPicks};
    
    // ランキング順
    state.sortedWorkIds.ranking = Object.values(state.works)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .map(w => w.id);
    
    // 新着順
    state.sortedWorkIds.new = Object.values(state.works)
        .sort((a, b) => b.timestamp - a.timestamp)
        .map(w => w.id);
    
    // お気に入り順
    state.sortedWorkIds.favorites = [...state.favorites].map(favId => {
        return allWorks[favId] || Object.values(allWorks).find(p => p.pageUrl?.includes(favId));
    }).filter(Boolean) 
        .sort((a, b) => (b?.timestamp || 0) - (a?.timestamp || 0))
        .map(w => w.id);
    
    // 管理者ピックアップ順
    const adminPicks = Object.values(state.adminPicks).sort((a, b) => (a.order ?? a.timestamp) - (b.order ?? b.timestamp));
    state.sortedAdminIds.manga = adminPicks.filter(w => util.classifyWork(w) === 'manga').map(w => w.id);
    state.sortedAdminIds.game = adminPicks.filter(w => util.classifyWork(w) === 'game').map(w => w.id);
}
