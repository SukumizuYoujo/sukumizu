// src/main.js
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { auth } from './firebase.js';
import { handleGoogleLogin, handleGuestLogin } from './auth.js';
import { store } from './store.js';
import { renderCalendar } from './components/Calendar.js';
import { renderTodoList } from './components/TodoList.js';
import { renderSalaryReport } from "./components/SalaryReport.js";

window.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.getElementById('app');

    function renderApp(user) {
        store.user = user;
        appContainer.innerHTML = `
            <header class="bg-white shadow-md sticky top-0 z-50">
                <nav class="container mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
                    <h1 class="text-xl font-bold text-blue-600">自己管理ツール</h1>
                    <div id="auth-ui"></div>
                </nav>
            </header>
            
            <main id="main-content" class="container mx-auto p-4 grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div id="left-column" class="lg:col-span-3 space-y-6">
                    <div id="calendar-module"></div>
                </div>
                <div id="right-column" class="lg:col-span-2 space-y-6">
                    <div id="salary-report-module"></div>
                    <div id="todo-module"></div>
                </div>
            </main>
            <div id="modal-container"></div>
        `;
        renderAuthUI(user);
        renderCalendar(document.getElementById('calendar-module'));
        renderTodoList(document.getElementById('todo-module'));
        renderSalaryReport(document.getElementById('salary-report-module'));
    }

    // Renders the initial login screen
    function renderLoginScreen() {
        store.user = null;
        appContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center min-h-screen bg-gray-50">
                <div class="max-w-md w-full bg-white p-8 rounded-xl shadow-lg text-center">
                    <h1 class="text-3xl font-bold text-gray-800 mb-2">自己管理ツールへようこそ</h1>
                    <p class="text-gray-600 mb-8">ログインして、日々のタスクやスケジュールを管理しましょう。</p>
                    <div class="space-y-4">
                        <button id="google-login-btn" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg transition duration-300 flex items-center justify-center"><i class="fab fa-google mr-3"></i> Googleでログイン</button>
                        <button id="guest-login-btn" class="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg transition duration-300">ゲストとして続ける</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('google-login-btn').addEventListener('click', handleGoogleLogin);
        document.getElementById('guest-login-btn').addEventListener('click', handleGuestLogin);
    }

    // Renders the user status and logout button in the header
    function renderAuthUI(user) {
        const authUiContainer = document.getElementById('auth-ui');
        if (!authUiContainer) return;
        if (user) {
            const displayName = user.isAnonymous ? 'ゲスト' : user.displayName || 'ユーザー';
            authUiContainer.innerHTML = `
                <div class="flex items-center gap-4">
                    <span class="text-gray-700 hidden sm:block">ようこそ、${displayName}さん</span>
                    <button id="logout-btn" class="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg text-sm transition">ログアウト</button>
                </div>
            `;
            document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));
        }
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            renderApp(user);
        } else {
            renderLoginScreen();
        }
    });
});