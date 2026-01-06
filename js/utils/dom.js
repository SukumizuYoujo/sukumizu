export const dom = {
    container: document.querySelector('.container'),
    urlInput: document.getElementById("dlsiteUrl"),
    authArea: document.querySelector('.auth-area'), 
    userName: document.getElementById('userName'),
    loginBtn: document.getElementById('loginBtn'), 
    logoutBtn: document.getElementById('logoutBtn'),
    nav: { 
        home: document.getElementById('nav-home'), 
        favorites: document.getElementById('nav-favorites'), 
        mylists: document.getElementById('nav-mylists') 
    },
    views: { 
        main: document.getElementById('view-main'), 
        favorites: document.getElementById('view-favorites'), 
        mylists: document.getElementById('view-mylists'), 
        publicList: document.getElementById('view-public-list') 
    },
    grids: {
        new: document.getElementById("newGrid"), 
        ranking: document.getElementById("rankingGrid"),
        admin_manga: document.getElementById("adminMangaGrid"), 
        admin_game: document.getElementById("adminGameGrid"),
        favorites: document.getElementById('favoritesGrid'), 
        publicList: document.getElementById('public-list-grid')
    },
    pageSizeSelectors: {
        admin: document.getElementById('adminPageSizeSelector'), 
        user: document.getElementById('userPageSizeSelector'),
        favorites: document.getElementById('favoritesPageSizeSelector')
    },
    mylistsContainer: document.getElementById('mylists-container'),
    publicListName: document.getElementById('public-list-name'), 
    publicListOwner: document.getElementById('public-list-owner'),
    importPublicListBtn: document.getElementById('import-public-list-btn'),
    toast: document.getElementById("toast"), 
    modalOverlay: document.getElementById("modalOverlay"), 
    modalContent: document.getElementById("modalContent"),
    imagePreviewPopup: document.getElementById("imagePreviewPopup"),
    hamburgerBtn: document.getElementById('hamburger-btn'),
    mobileMenu: document.getElementById('mobile-menu')
};