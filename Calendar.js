// src/components/Calendar.js
import { collection, onSnapshot, query } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { db } from '../firebase.js';
import { store } from '../store.js';
import { timestampToYYYYMMDD } from '../utils.js';
import { openEventModal } from './EventModal.js';
import { openWorkplaceModal } from './WorkplaceModal.js';
import { openShiftModal } from './ShiftModal.js';
import { getPaydayForClosingMonth } from "../utils/salaryCalculator.js";
import { renderSalaryReport } from "./SalaryReport.js";

let containerEl = null;
let unsubscribes = [];
let isWheeling = false;
let isInitialRender = true;

export function renderCalendar(container) {
    if (container) containerEl = container;
    if (!containerEl || !store.user) return;
    unsubscribes.forEach(unsub => unsub());
    unsubscribes = [];
    isInitialRender = true;
    renderCalendarShell();
    attachShellEventListeners();
    setupFirestoreListeners();
}

function renderCalendarShell() {
    containerEl.innerHTML = `
        <div id="calendar-module" class="bg-white p-4 sm:p-6 rounded-xl shadow-lg relative">
            <header class="flex flex-col lg:flex-row lg:items-center justify-between mb-4 gap-4">
                <div id="month-navigation" class="flex items-center justify-between w-full lg:w-auto">
                    <button id="prev-month-btn" class="p-2 rounded-full hover:bg-gray-200 transition"><i class="fas fa-chevron-left"></i></button>
                    <h2 id="month-year-display" class="text-xl font-bold text-gray-800 text-center"></h2>
                    <button id="next-month-btn" class="p-2 rounded-full hover:bg-gray-200 transition"><i class="fas fa-chevron-right"></i></button>
                </div>
                <div id="calendar-controls" class="flex items-center justify-between w-full lg:w-auto gap-4">
                    <div id="header-left" class="flex-grow"></div>
                    <div id="view-toggle" class="p-1 bg-gray-200 rounded-lg flex flex-shrink-0"></div>
                </div>
            </header>
            <div id="day-names" class="grid grid-cols-7 gap-1 text-center text-sm text-gray-500 mb-2">${['日', '月', '火', '水', '木', '金', '土'].map(d => `<div>${d}</div>`).join('')}</div>
            <div id="calendar-grid" class="grid grid-cols-7 gap-1 min-h-[420px] sm:min-h-[480px]"></div>
            <div id="fab-container"></div>
        </div>
        <div id="daily-schedule-view" class="mt-8"></div>
    `;
}

function updateCalendarContent() {
    if (!containerEl) return;
    document.getElementById('month-year-display').textContent = `${store.currentDate.getFullYear()}年 ${store.currentDate.getMonth() + 1}月`;
    const headerLeft = document.getElementById('header-left');
    let headerLeftHTML = '<div></div>';
    if (store.currentView === 'work') {
        headerLeftHTML = `<button id="manage-workplaces-btn" class="text-sm bg-gray-700 hover:bg-gray-800 text-white font-semibold py-2 px-3 rounded-lg transition whitespace-nowrap"><i class="fas fa-store mr-2"></i>勤務先管理</button>`;
    } else if (store.currentView === 'personal') {
        headerLeftHTML = `
            <div class="flex items-center gap-2">
                <label for="show-work-toggle" class="text-sm font-semibold text-gray-600 whitespace-nowrap">バイト表示</label>
                <div class="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
                    <input type="checkbox" id="show-work-toggle" class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" ${store.showWorkShiftsOnPersonal ? 'checked' : ''}/>
                    <label for="show-work-toggle" class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
                </div>
            </div>`;
    }
    headerLeft.innerHTML = headerLeftHTML;
    const viewToggle = document.getElementById('view-toggle');
    viewToggle.innerHTML = `<button id="toggle-personal-btn" class="px-3 sm:px-4 py-1 text-sm font-semibold rounded-md ${store.currentView === 'personal' ? 'bg-white shadow' : ''}">個人</button><button id="toggle-work-btn" class="px-3 sm:px-4 py-1 text-sm font-semibold rounded-md ${store.currentView === 'work' ? 'bg-white shadow' : ''}">バイト</button>`;
    const fabContainer = document.getElementById('fab-container');
    fabContainer.innerHTML = `<button id="fab-add-btn" class="absolute bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg text-2xl z-40 ${store.currentView === 'personal' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}">+</button>`;
    attachContentEventListeners();
    updateCalendarGrid();
    renderSalaryReport(document.getElementById('salary-report-module'));
    if (store.currentView === 'personal') renderDailySchedule(); else if (store.currentView === 'work') renderDailyShifts();
}

function updateCalendarGrid() {
    const gridEl = document.getElementById('calendar-grid');
    if (!gridEl) return;
    gridEl.style.transition = 'opacity 0.2s ease-in-out';
    gridEl.style.opacity = '0.5';
    setTimeout(() => {
        gridEl.innerHTML = '';
        const year = store.currentDate.getFullYear();
        const month = store.currentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let i = 0; i < firstDay; i++) gridEl.insertAdjacentHTML('beforeend', `<div class="h-16 sm:h-20 bg-gray-50 rounded"></div>`);
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = new Date().toDateString() === new Date(dateStr).toDateString();
            const isSelected = new Date(store.selectedDate).toDateString() === new Date(dateStr).toDateString();
            
            let itemsHTML = '';
            const eventDots = store.events.filter(e => timestampToYYYYMMDD(e.start) === dateStr).map(e => `<div class="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full" style="background-color:${e.color}"></div>`).join('');
            const shiftDots = store.shifts.filter(s => timestampToYYYYMMDD(s.start) === dateStr).map(s => {
                const workplace = store.workplaces.find(w => w.id === s.workplaceId);
                return `<div class="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full" style="background-color:${workplace?.color || '#34d399'}"></div>`;
            }).join('');
            
            let paydayMark = '';
            store.workplaces.forEach(wp => {
                const prevMonthPayday = getPaydayForClosingMonth(year, month - 1, wp);
                const currentMonthPayday = getPaydayForClosingMonth(year, month, wp);
                if ((prevMonthPayday.getFullYear() === year && prevMonthPayday.getMonth() === month && prevMonthPayday.getDate() === day) ||
                    (currentMonthPayday.getFullYear() === year && currentMonthPayday.getMonth() === month && currentMonthPayday.getDate() === day)) {
                    paydayMark = '<span class="text-xs">💰</span>';
                }
            });

            if (store.currentView === 'personal') {
                itemsHTML = eventDots;
                if (store.showWorkShiftsOnPersonal) itemsHTML += shiftDots;
            } else {
                itemsHTML = shiftDots;
            }
            gridEl.insertAdjacentHTML('beforeend', `<div class="h-16 sm:h-20 border rounded p-1.5 flex flex-col cursor-pointer transition ${isSelected ? 'bg-blue-100 border-blue-400' : 'border-gray-100 hover:bg-blue-50'}" data-date-str="${dateStr}"><div class="flex justify-between items-start"><span class="day-number text-xs sm:text-sm font-medium ${isToday ? 'bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center' : 'text-gray-700'}">${day}</span>${paydayMark}</div><div class="mt-1 flex-grow flex items-end justify-center gap-1">${itemsHTML}</div></div>`);
        }
        gridEl.style.opacity = '1';
    }, 50);
}

function renderDailySchedule() {
    const dailyView = document.getElementById('daily-schedule-view');
    if (!dailyView || store.currentView !== 'personal') { if (dailyView) dailyView.innerHTML = ''; return; }
    const dateStr = timestampToYYYYMMDD({ toDate: () => store.selectedDate });
    const dayEvents = store.events.filter(e => timestampToYYYYMMDD(e.start) === dateStr);
    let allItems = dayEvents.map(e => ({ item: e, type: 'event' }));
    if (store.showWorkShiftsOnPersonal) {
        const dayShifts = store.shifts.filter(s => timestampToYYYYMMDD(s.start) === dateStr);
        allItems.push(...dayShifts.map(s => ({ item: s, type: 'shift' })));
    }
    allItems.sort((a,b) => a.item.start.toDate() - b.item.start.toDate());
    const itemsHTML = allItems.map(({item, type}) => {
        const start = item.start.toDate(); const end = item.end.toDate();
        let time, title, memoHTML, color, clickableClass;
        if(type === 'event') {
            time = item.allDay ? '終日' : `${start.getHours()}:${String(start.getMinutes()).padStart(2, '0')} - ${end.getHours()}:${String(end.getMinutes()).padStart(2, '0')}`;
            title = item.title;
            memoHTML = item.memo ? `<p class="text-sm text-gray-600 mt-1 whitespace-pre-wrap">${item.memo}</p>` : '';
            color = item.color;
            clickableClass = 'hover:bg-gray-50 cursor-pointer';
        } else {
            const workplace = store.workplaces.find(w => w.id === item.workplaceId);
            time = `${start.getHours()}:${String(start.getMinutes()).padStart(2, '0')} - ${end.getHours()}:${String(end.getMinutes()).padStart(2, '0')}`;
            title = workplace?.name || '単発バイト';
            memoHTML = item.memo ? `<p class="text-sm text-gray-600 mt-1 whitespace-pre-wrap">${item.memo}</p>` : '';
            color = workplace?.color || '#34d399';
            clickableClass = 'hover:bg-gray-100 cursor-pointer bg-gray-50';
        }
        return `<li class="flex items-stretch gap-4 p-4 rounded-lg ${clickableClass}" data-item-id="${item.id}" data-type="${type}"><div class="w-1.5 rounded-full flex-shrink-0" style="background-color:${color}"></div><div class="flex-grow py-1"><p class="font-semibold text-gray-800">${title}</p><p class="text-sm text-gray-500">${time}</p>${memoHTML}</div></li>`;
    }).join('');
    dailyView.innerHTML = `<h3 class="text-lg font-bold mb-2 px-4">${store.selectedDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</h3><ul>${itemsHTML || `<li class="text-center text-gray-500 p-8">この日の予定はありません。</li>`}</ul>`;
}

function renderDailyShifts() {
    const dailyView = document.getElementById('daily-schedule-view');
    if (!dailyView || store.currentView !== 'work') { if (dailyView) dailyView.innerHTML = ''; return; }
    const dateStr = timestampToYYYYMMDD({ toDate: () => store.selectedDate });
    const dayShifts = store.shifts.filter(s => timestampToYYYYMMDD(s.start) === dateStr).sort((a,b) => a.start.toDate() - b.start.toDate());
    const shiftsHTML = dayShifts.map(s => {
        const workplace = store.workplaces.find(w => w.id === s.workplaceId);
        const color = workplace?.color || '#34d399';
        const start = s.start.toDate(); const end = s.end.toDate();
        const time = `${start.getHours()}:${String(start.getMinutes()).padStart(2, '0')} - ${end.getHours()}:${String(end.getMinutes()).padStart(2, '0')}`;
        const memoHTML = s.memo ? `<p class="text-sm text-gray-600 mt-1 whitespace-pre-wrap">${s.memo}</p>` : '';
        return `<li class="flex items-stretch gap-4 p-4 hover:bg-gray-50 cursor-pointer rounded-lg" data-item-id="${s.id}" data-type="shift"><div class="w-1.5 rounded-full" style="background-color:${color}"></div><div class="flex-grow py-1"><p class="font-semibold text-gray-800">${workplace?.name || '単発バイト'}</p><p class="text-sm text-gray-500">${time}</p>${memoHTML}</div></li>`;
    }).join('');
    dailyView.innerHTML = `<h3 class="text-lg font-bold mb-2 px-4">${store.selectedDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</h3><ul>${shiftsHTML || `<li class="text-center text-gray-500 p-8">この日のシフトはありません。</li>`}</ul>`;
}

function navigateDay(direction) {
    if (isWheeling) return; isWheeling = true;
    store.selectedDate.setDate(store.selectedDate.getDate() + direction);
    if (store.selectedDate.getMonth() !== store.currentDate.getMonth()) {
        store.currentDate = new Date(store.selectedDate);
        updateCalendarContent();
    } else {
        updateCalendarGrid();
        if (store.currentView === 'personal') renderDailySchedule(); else renderDailyShifts();
    }
    setTimeout(() => { isWheeling = false; }, 100);
}

function setupFirestoreListeners() {
    if (!store.user) return;
    const uid = store.user.uid;
    const collections = ["events", "shifts", "workplaces"];
    const promises = collections.map(col => new Promise(resolve => {
        unsubscribes.push(onSnapshot(query(collection(db, `users/${uid}/${col}`)), snap => {
            store[col] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (!isInitialRender) { updateCalendarContent(); }
            resolve();
        }));
    }));
    Promise.all(promises).then(() => {
        if(isInitialRender) {
            updateCalendarContent();
            isInitialRender = false;
        }
    });
}

function attachShellEventListeners() {
    const handler = (id, action, event = 'click') => document.getElementById(id)?.addEventListener(event, action);
    handler('prev-month-btn', () => { store.currentDate.setMonth(store.currentDate.getMonth() - 1); store.selectedDate = new Date(store.currentDate); updateCalendarContent(); });
    handler('next-month-btn', () => { store.currentDate.setMonth(store.currentDate.getMonth() + 1); store.selectedDate = new Date(store.currentDate); updateCalendarContent(); });
    handler('calendar-grid', (e) => {
        const dayCell = e.target.closest('[data-date-str]');
        if (dayCell) {
            store.selectedDate = new Date(dayCell.dataset.dateStr + 'T00:00:00');
            updateCalendarGrid();
            if (store.currentView === 'personal') renderDailySchedule(); else renderDailyShifts();
        }
    });
    handler('daily-schedule-view', (e) => {
        const item = e.target.closest('[data-item-id]');
        if (item) {
            if (item.dataset.type === 'event') openEventModal(null, store.events.find(i => i.id === item.dataset.itemId));
            if (item.dataset.type === 'shift') openShiftModal(null, store.shifts.find(i => i.id === item.dataset.itemId));
        }
    });
    handler('calendar-module', (e) => {
        e.preventDefault();
        if (e.deltaY > 5) navigateDay(1);
        if (e.deltaY < -5) navigateDay(-1);
    }, 'wheel');
}

function attachContentEventListeners() {
    const handler = (id, action, event = 'click') => document.getElementById(id)?.addEventListener(event, action);
    handler('toggle-personal-btn', () => { store.currentView = 'personal'; updateCalendarContent(); });
    handler('toggle-work-btn', () => { store.currentView = 'work'; updateCalendarContent(); });
    handler('manage-workplaces-btn', openWorkplaceModal);
    handler('fab-add-btn', () => {
        const dateToAdd = new Date(store.selectedDate);
        if (store.currentView === 'personal') {
             dateToAdd.setHours(9, 0, 0, 0);
             openEventModal(dateToAdd);
        } else {
             dateToAdd.setHours(18, 30, 0, 0);
             openShiftModal(dateToAdd);
        }
    });
    handler('show-work-toggle', (e) => {
        store.showWorkShiftsOnPersonal = e.target.checked;
        updateCalendarContent();
    }, 'change');
}