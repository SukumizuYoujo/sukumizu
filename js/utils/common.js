import { dom } from "./dom.js";

export const util = {
    showToast: (msg, duration = 3000) => { 
        dom.toast.textContent = msg; 
        dom.toast.classList.add("show"); 
        setTimeout(() => dom.toast.classList.remove("show"), duration); 
    },
    getClientId: () => { 
        let id = localStorage.getItem("clientId"); 
        if (!id) { 
            id = crypto.randomUUID(); 
            localStorage.setItem("clientId", id); 
        } 
        return id; 
    },
    calculateTotalPages: (totalItems, pageSize) => Math.max(1, Math.ceil(totalItems / pageSize)),
    classifyWork: (work) => { 
        if (!work) return 'unknown'; 
        if (work.manualGenre) return work.manualGenre; 
        if (work.workType) { 
            const type = work.workType; 
            if (type === 'Book' || type === 'Comic') return 'manga'; 
            if (type === 'VideoGame') return 'game'; 
        } 
        const url = work.pageUrl || ''; 
        if (url.includes('/comic/') || url.includes('/books/')) return 'manga'; 
        if (url.includes('/soft/') || url.includes('/pro/')) return 'game'; 
        return 'unknown'; 
    },
    hasAnyOfTags: (work, tagIdsSet) => { 
        if (!work || !work.tags || tagIdsSet.size === 0) return false; 
        for (const tagId of tagIdsSet) { 
            if (work.tags[tagId]) return true; 
        } 
        return false; 
    },
    escapeHTML: (str) => str ? str.replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match])) : '',
};