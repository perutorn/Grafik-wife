/* 1. ZARZĄDZANIE BAZĄ DANYCH INDEXED DB */
class DBManager {
    constructor() {
        this.dbName = 'GrafikAppDB';
        this.storeName = 'day_data';
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: "date" });
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            request.onerror = reject;
        });
    }

    async getAll() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, "readonly");
            const store = tx.objectStore(this.storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = reject;
        });
    }

    async save(data) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, "readwrite");
            const store = tx.objectStore(this.storeName);
            const request = store.put(data);
            request.onsuccess = resolve;
            request.onerror = reject;
        });
    }
}

/* 2. SILNIK LOGIKI ZMIAN */
class ShiftEngine {
    #cycles = [1,1,2,2,3,3,3,4,4,1,1,2,2,2,3,3,4,4,1,1,1,2,2,3,3,4,4,4];
    #starts = {
        "A": new Date(2026, 1, 23),
        "B": new Date(2026, 1, 9),
        "C": new Date(2026, 1, 16),
        "D": new Date(2026, 1, 30)
    };
    #msPerDay = 86400000;

    getShift(timestamp, brigade) {
        const start = this.#starts[brigade].getTime();
        const diff = Math.round((timestamp - start) / this.#msPerDay);
        const index = ((diff % this.#cycles.length) + this.#cycles.length) % this.#cycles.length;
        return this.#cycles[index];
    }

    getPolishHolidays(year) {
        let holidays = [
            {m:0, d:1, n:"Nowy Rok"}, {m:0, d:6, n:"Trzech Króli"}, {m:4, d:1, n:"Święto Pracy"},
            {m:4, d:3, n:"3-go Maja"}, {m:7, d:15, n:"Wiebowzięcia NMP"},
            {m:10, d:1, n:"Wszystkich Świętych"}, {m:10, d:11, n:"Dzień Niepodległości"},
            {m:11, d:24, n:"Wigilia"}, {m:11, d:25, n:"Boże Narodzenie"}, {m:11, d:26, n:"Boże Narodzenie"}
        ];
        const e = this.#getEaster(year);
        const easter = new Date(year, e.month, e.day);
        const addMoving = (offset) => {
            const d = new Date(easter);
            let name = '';
            d.setDate(easter.getDate() + offset);
            switch (offset) {
				case 0: name = "Wielkanoc"; break;
				case 1: name = "Poniedziałek Wielkanocny"; break;
				case 49: name = "Zesłanie Ducha Św."; break;
				case 60: name = "Boże Ciało"; break;
			}
            holidays.push({m: d.getMonth(), d: d.getDate(), n:name});
        };
        [0, 1, 49, 60].forEach(offset => addMoving(offset));
        return holidays;
    }

    #getEaster(year) {
        const a = year % 19, b = Math.floor(year / 100), c = year % 100;
        const d = Math.floor(b / 4), f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4), k = c % 4;
        const l = (32 + 2 * (b % 4) + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const p = (h + l - 7 * m + 114) % 31;
        return { month: Math.floor((h + l - 7 * m + 114) / 31) - 1, day: p + 1 };
    }
}

/* 3. APLIKACJA */
class App {
    SIMPLE = 0;
    MATRIX = 1;
    YEAR_MODE = 10;
    MONTH_MODE = 11;

    icons = {
	  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
	  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
	  matrix: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`,
      search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line></svg>`
	};

    constructor() {
        this.engine = new ShiftEngine();
        this.db = new DBManager();
        this.todayDate = new Date();
        this.userData = {};

        this.ui = {
			dateBar: document.getElementById("dateBar"),
			container: document.getElementById("mainContainer"),
			btnPrev: document.getElementById('btnPrev'),
			btnNext: document.getElementById('btnNext'),
			btnH: document.getElementById('H'),
			btnT: document.getElementById('T'),
			btnA: document.getElementById('A'),
			btnB: document.getElementById('B'),
			btnC: document.getElementById('C'),
			btnD: document.getElementById('D'),
			// SPA Panel UI
			spaContainer: document.getElementById('dayDetailsContainer'),
			spaTitle: document.getElementById('selectedDateTitle'),
			btnBack: document.getElementById('btnBackToCalendar'),
			btnSave: document.getElementById('btnSaveDay'),
			statusPicker: document.getElementById('statusPicker'),
			inputNote: document.getElementById('dayNote'),
			inputHours: document.getElementById('overtimeHours'),
			groupHours: document.getElementById('overtimeGroup'),
			// Search SPA UI
			btnSearch: document.getElementById('btnSearch'),
			btnBackFromSearch: document.getElementById('btnBackFromSearch'),
			searchContainer: document.getElementById('searchContainer'),
			searchFilters: document.getElementById('searchFilters'),
			searchFilterButtons: document.querySelectorAll('#searchFilters .search-filter'),
			searchResults: document.getElementById('searchResults')
		}

		this.ui.btnH.innerHTML = this.icons.home;
        this.ui.btnSearch.innerHTML = this.icons.search;

        this.state = {
            year: new Date().getFullYear(),
            month: new Date().getMonth(),
            brigade: localStorage.getItem("defaultBrigade") || 'A',
            mode: parseInt(localStorage.getItem("mode")) || this.MONTH_MODE,
            view: parseInt(localStorage.getItem("view")) || this.SIMPLE,
            selectedDateStr: null,
            returnToSearch: false,
            searchStatus: 'l4'
        };

        if (!['A', 'B', 'C', 'D'].includes(this.state.brigade)) this.state.brigade = 'A';
        if (![this.SIMPLE, this.MATRIX].includes(this.state.view)) this.state.view = this.SIMPLE;
        if (![this.MONTH_MODE, this.YEAR_MODE].includes(this.state.mode)) this.state.mode = this.MONTH_MODE;

		this.ui.btnT.innerHTML = (this.state.view === this.SIMPLE)? this.icons.matrix:this.icons.calendar;
        this.holidays = this.engine.getPolishHolidays(this.state.year);
    }

    async init() {
        try {
            await this.db.init();
            const dataArray = await this.db.getAll();
            dataArray.forEach(item => { this.userData[item.date] = item; });
        } catch (e) {
            console.error("Błąd ładowania IndexedDB", e);
        }
        this.initEvents();
        this.refresh();
    }

    #haptic(type = 'light') {
		if (!navigator.vibrate) return;
		switch(type) {
			case 'light': navigator.vibrate(15); break;
			case 'medium': navigator.vibrate(35); break;
			case 'error': navigator.vibrate([50, 50, 50]); break;
		}
	}

    initEvents() {
        // Zmiana brygady
        ['A', 'B', 'C', 'D'].forEach(id => {
			const btn = document.getElementById(id);
            btn.onclick = () => {
				this.#haptic('light');
                this.state.brigade = id;
                localStorage.setItem('defaultBrigade', id);
                this.refresh();
            };
        });

        // Nawigacja
        this.ui.btnPrev.onclick = () => { this.#haptic('light'); this.#changeDate(-1); };
        this.ui.btnNext.onclick = () => { this.#haptic('light'); this.#changeDate(1); };

        // Zmiana widoku z paska nagłówka (Month <-> Year)
        this.ui.dateBar.onclick = () => {
            this.#haptic('medium');
            this.state.mode = (this.state.mode === this.MONTH_MODE) ? this.YEAR_MODE : this.MONTH_MODE;
            this.refresh();
        };

        this.ui.btnH.onclick = () => { this.#haptic('light'); this.goHome(); };

        this.ui.btnSearch.onclick = () => { this.#haptic('medium'); this.openSearch(); };
        this.ui.btnBackFromSearch.onclick = () => { this.#haptic('light'); this.closeSearch(); };

        this.ui.searchFilters.addEventListener('click', (e) => {
            const filter = e.target.closest('.search-filter');
            if (!filter) return;
            const status = filter.dataset.status;
            if (!['l4', 'nieobecnosc', 'urlop', 'uz', 'sw'].includes(status)) return;
            this.#haptic('light');
            this.state.searchStatus = status;
            this.ui.searchFilterButtons.forEach(btn => btn.classList.toggle('active', btn === filter));
            this.renderSearchResults();
        });

        this.ui.searchResults.addEventListener('click', (e) => {
            const card = e.target.closest('.search-card');
            if (!card || !card.dataset.date) return;
            this.#haptic('light');
            this.openDayDetails(card.dataset.date, true);
        });

		this.ui.btnT.onclick = () => {
			this.state.view = (this.state.mode === this.MONTH_MODE && this.state.view === this.SIMPLE)? this.MATRIX:this.SIMPLE;
			this.ui.btnT.innerHTML = (this.state.view === this.SIMPLE)? this.icons.matrix:this.icons.calendar;
			this.ui.btnT.classList.toggle("active", this.state.view === this.MATRIX);
			localStorage.setItem("view", this.state.view);
			this.#haptic("medium");
			this.refresh();
		}

        // Kliknięcie w kontener główny
        this.ui.container.addEventListener("click", (e) => {
            const isYearMode = this.state.mode === this.YEAR_MODE;
            const isMatrixView = this.state.view === this.MATRIX;

            if (isYearMode) {
                const miniMonth = e.target.closest('.mini-month');
                if (miniMonth && miniMonth.dataset.m) {
                    this.goToMonth(parseInt(miniMonth.dataset.m));
                }
                return;
            }

            const dayEl = e.target.closest('.day');
            const matrixRowEl = e.target.closest('.matrix-row');

            if (dayEl && dayEl.dataset.date) {
                this.openDayDetails(dayEl.dataset.date);
            } else if (isMatrixView && matrixRowEl && !matrixRowEl.classList.contains('matrix-header') && matrixRowEl.dataset.date) {
                this.openDayDetails(matrixRowEl.dataset.date);
            }
        });

        // Eventy dla ekranu SPA
        this.ui.btnBack.onclick = () => this.closeDayDetails();

        // Wybór statusu przyciskami w SPA
        const statusBtns = this.ui.statusPicker.querySelectorAll('.status-btn');
        statusBtns.forEach(btn => {
            btn.onclick = () => {
                this.#haptic('light');
                statusBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const val = btn.dataset.value;
                if (val === 'nadgodziny' || val === 'sw') {
                    this.ui.groupHours.classList.remove('display-none');
                } else {
                    this.ui.groupHours.classList.add('display-none');
                }
            };
        });

        this.ui.btnSave.onclick = async () => {
            this.#haptic('medium');
            await this.saveDayDetails();
        };
    }

	#buttonsRefresh() {
		const { state: s, ui: u } = this;
		const brigades = [u.btnA, u.btnB, u.btnC, u.btnD];
		const isYearMode = (s.mode === this.YEAR_MODE);
		const isMatrix = (s.view === this.MATRIX);
		const brigadesDisabled = isMatrix && !isYearMode;

		brigades.forEach(btn => {
			btn.disabled = brigadesDisabled;
			btn.classList.toggle("active", !btn.disabled && btn.id === s.brigade);
		});
		u.btnT.disabled = isYearMode;
	}

    #changeDate(delta) {
		const currentYear = this.state.year;
        if (this.state.mode === this.MONTH_MODE) {
            const d = new Date(this.state.year, this.state.month + delta, 1);
            this.state.year = d.getFullYear();
            this.state.month = d.getMonth();
        } else {
            this.state.year += delta;
        }

        if (currentYear !== this.state.year)
			this.holidays = this.engine.getPolishHolidays(this.state.year);
        this.refresh();
    }

    goHome() {
        const now = new Date();
        const nowYear = now.getFullYear();
        const nowMonth = now.getMonth();
        let change = false;

        if (this.state.year !== nowYear){
			this.state.year = nowYear;
			this.holidays = this.engine.getPolishHolidays(nowYear)
			change = true;
		}
        if (this.state.month !== nowMonth) {
			this.state.month = nowMonth;
			change = true;
		}
        if (this.state.mode === this.YEAR_MODE) {
			this.state.mode = this.MONTH_MODE;
			change = true;
		}
        if (change) this.refresh();
    }

    saveSettingsToLocalStorage(){
		localStorage.setItem("view", this.state.view);
		localStorage.setItem("mode", this.state.mode);
		localStorage.setItem("defaultBrigade", this.state.brigade);
	}

    refresh() {
		this.#buttonsRefresh();
		this.saveSettingsToLocalStorage();

		const container = this.ui.container;
		container.className = '';

		if (this.state.mode === this.MONTH_MODE) {
			if (this.state.view === this.SIMPLE) {
				container.classList.add('grafik', 'monthView');
				this.#renderMonth();
			} else {
				container.classList.add('monthMatrixView');
				this.#renderMonthMatrix();
			}
		} else {
			container.classList.add('grafik', 'year-grid');
			this.#renderYear();
		}
	}

    formatDateString(y, m, d) {
        return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    getUserData(dateStr) {
        const data = this.userData[dateStr];
        if (!data) return null;
        if (data.status !== 'normal' || (data.note && data.note.trim() !== '')) return data;
        return null;
    }

    #renderMonth() {
		const { year, month, brigade } = this.state;
		const title = new Date(year, month).toLocaleString('pl-PL', { month: 'long', year: 'numeric' });
		const todayDate = this.todayDate.getDate();
		const todayMonth = this.todayDate.getMonth();
		const todayYear = this.todayDate.getFullYear();

		let html = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']
			.map(n => `<div class="day-name">${n}</div>`).join('');

		const firstDay = new Date(year, month, 1).getDay();
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const offset = (firstDay === 0) ? 6 : firstDay - 1;

		for (let i = 0; i < offset; i++) {
			html += `<div class="empty day"></div>`;
		}

		let offDaysSystem = 0;
		let nightShifts = 0;

		for (let d = 1; d <= daysInMonth; d++) {
			const tDate = new Date(year, month, d);
            const dateStr = this.formatDateString(year, month, d);
			const isHoliday = this.holidays.some(h => h.m === month && h.d === d);
            const uData = this.getUserData(dateStr);

			let shiftClass = '';
            let workHours = '';

			if (isHoliday) {
				shiftClass = 'holiday';
				offDaysSystem++;
				workHours = '<span class="hour-label">święto</span>';
			} else {
				const shift = this.engine.getShift(tDate.getTime(), brigade);

				if (brigade == 'B') {
					switch (shift) {
						case 1: workHours = '<span class="hour-label">7-14</span>';break;
						case 2: workHours = '<span class="hour-label">14-21</span>';break;
						case 3: workHours = '<span class="hour-label">22-5</span>';break;
					}
				} else {
					switch (shift) {
						case 1: workHours = '<span class="hour-label">6-14</span>';break;
						case 2: workHours = '<span class="hour-label">14-22</span>';break;
						case 3: workHours = '<span class="hour-label">22-6</span>';break;
					}
				}

				if (shift < 4) {
					shiftClass = `shift${shift}`;
					if (shift === 3) nightShifts++;
				} else {
					shiftClass = 'off';
					offDaysSystem++;
					workHours = '<span class="hour-label">wolne</span>';
				}
			}

      let absenceIndicator = '';
            if (uData && uData.status !== 'normal') {
              if (uData.status === 'urlop') { absenceIndicator = '<div class="absence-ind absence-ind-u></div>'; workHours = '<span class="hour-label">Urlop</span>'; }
              if (uData.status === 'uz') { absenceIndicator = '<div class="absence-ind absence-ind-uz"></div>'; workHours = '<span class="hour-label">Żąd.</span>'; }
                if (uData.status === 'l4') { absenceIndicator = '<div class="absence-ind absence-ind-l4"></div>'; workHours = '<span class="hour-label">L4</span>'; }
                if (uData.status === 'sw') {  absenceIndicator = '<div class="absence-ind absence-ind-sw"></div>'; workHours = `<span class="hour-label">SW ${uData.hours}h</span>`; }
                if (uData.status === 'nieobecnosc') { absenceIndicator = '<div class="absence-ind absence-ind-n"></div>';; workHours = '<span class="hour-label">Nieob.</span>'; }
                if (uData.status === 'nadgodziny') {  absenceIndicator = '<div class="absence-ind absence-ind-nad"></div>'; workHours = `<span class="hour-label">+${uData.hours}h</span>`; }
            }

      const badgeHtml = (uData && uData.note) ? `<div class="badge"></div>` : '';
      const todayClass = (d === todayDate && year === todayYear && month === todayMonth) ? "todayClass" : "";

			html += `<div class="day ${shiftClass} ${todayClass}" data-date="${dateStr}">
                        ${badgeHtml}
						<strong>${d}</strong>
						${workHours}
						${absenceIndicator}
				 	</div>`;
		}

		const currentElements = offset + daysInMonth;
		const remaining = 42 - currentElements;

		for (let i = 0; i < remaining; i++) {
			html += `<div class="empty day"></div>`;
		}

		const wzs = this.#calculateWZS(year, month) - offDaysSystem;
		const nightHours = (brigade === 'B')? nightShifts * 7: nightShifts * 8;

		html += `
			<div class="monthStats">
				<span>WZS: <strong>${wzs > 0 ? '+' + wzs : wzs}</strong></span>
				<span>NOCE: <strong>${nightShifts} / ${nightHours}h</strong></span>
			</div>`;

		this.ui.container.innerHTML = html;
		this.ui.dateBar.innerText = title;
	}

    #calculateWZS(year, month) {
        let norm = 0;
        const lastDay = new Date(year, month + 1, 0).getDate();
        for (let d = 1; d <= lastDay; d++) {
            const date = new Date(year, month, d);
            const isHoliday = this.holidays.some(h => h.m === month && h.d === d);
            if (isHoliday) norm += (date.getDay() === 6) ? 2 : 1;
            else if (date.getDay() === 0 || date.getDay() === 6) norm++;
        }
        return norm;
    }

	#renderYear() {
        const { year, brigade } = this.state;
        const todayMonth = this.todayDate.getMonth();
        const todayYear = this.todayDate.getFullYear();

        this.ui.dateBar.innerText = year;
        let fullYearHtml = '';

        for (let q = 0; q < 4; q++) {
            let qOffDaysSystem = 0;
            let qOffDaysNorm = 0;
            let quarterMonthsHtml = '';

            for (let m = q * 3; m < (q * 3) + 3; m++) {
                const firstDay = new Date(year, m, 1).getDay();
                const daysInMonth = new Date(year, m + 1, 0).getDate();
                const offset = firstDay === 0 ? 6 : firstDay - 1;

                let daysHtml = '';
                for (let i = 0; i < offset; i++) {
                    daysHtml += `<div class="empty"></div>`;
                }

                for (let d = 1; d <= daysInMonth; d++) {
                    const tDate = new Date(year, m, d);
                    const isHoliday = this.holidays.some(h => h.m === m && h.d === d);
                    const dayOfWeek = tDate.getDay();
                    let shiftClass = '';

                    if (isHoliday) {
                        shiftClass = 'holiday';
                        qOffDaysSystem++;
                        qOffDaysNorm += (dayOfWeek === 6) ? 2 : 1;
                    } else {
                        const shift = this.engine.getShift(tDate.getTime(), brigade);
                        if (shift < 4) shiftClass = `shift${shift}`;
                        else {
                            shiftClass = 'off';
                            qOffDaysSystem++;
                        }
                        if (dayOfWeek === 0 || dayOfWeek === 6) qOffDaysNorm++;
                    }

                    daysHtml += `<div class="mini-day ${shiftClass}">${d}</div>`;
                }

                const monthName = new Date(year, m).toLocaleString('pl', { month: 'short' });
                const currentMonth = (this.state.year === todayYear && m === todayMonth) ? 'mini-month-current' : '';
                quarterMonthsHtml += `
                    <div class="mini-month ${currentMonth}" data-m="${m}">
                        <div class="mini-month-name">${monthName}</div>
                        <div class="mini-days-grid">${daysHtml}</div>
                    </div>`;
            }

            fullYearHtml += quarterMonthsHtml;
            fullYearHtml += `
                <div class="quarter-stats">
                    <span>KWARTAŁ ${q + 1}</span>
                    <span>WZS: <strong>${qOffDaysNorm - qOffDaysSystem}</strong></span>
                </div>`;
        }
        this.ui.container.innerHTML = fullYearHtml;
        this.ui.dateBar.innerText = year.toString();
    }

    goToMonth(m) {
        this.state.month = m;
        this.state.mode = this.MONTH_MODE;
        this.refresh();
    }

   #renderMonthMatrix() {
		const { year, month } = this.state;
		const title = new Date(year, month).toLocaleString('pl-PL', { month: 'long', year: 'numeric' });
		const todayDate = this.todayDate.getDate();
		const todayMonth = this.todayDate.getMonth();
		const todayYear = this.todayDate.getFullYear();

		let html = `
		<div class="matrix-row matrix-header">
			<div>DATA</div>
			<div>A</div><div>B</div><div>C</div><div>D</div>
		</div>
		<div class="matrix-scroll" style="overflow-y: auto; flex-grow: 1;">`;

		const daysInMonth = new Date(year, month + 1, 0).getDate();

		for (let d = 1; d <= daysInMonth; d++) {
			const tDate = new Date(year, month, d);
			const ts = tDate.getTime();
            const dateStr = this.formatDateString(year, month, d);
			const isHoliday = this.holidays.find(h => h.m === month && h.d === d);
			const dayOfWeek = tDate.getDay();
			const isWeekend = dayOfWeek === 0;

			const dayStr = tDate.toLocaleString('pl', { weekday: 'short' }).replace('.', '');
			const dateDisplay = `${d.toString().padStart(2, '0')}-${dayStr}`;
			const isToday = (d === todayDate && this.state.month === todayMonth && this.state.year === todayYear)? "today-row" : "";

            const uData = this.getUserData(dateStr);
            const badgeHtml = (uData && uData.note) ? `<div class="badge"></div>` : '';

			html += `<div class="matrix-row ${isToday}" data-date="${dateStr}">
				<div class="matrix-date ${(isWeekend || isHoliday) ? 'holiday' : ''}"
					 style="${(isWeekend || isHoliday) ? 'color: var(--color-holiday); opacity: 0.8' : ''}">
                     ${badgeHtml}
					 ${dateDisplay}
				</div>`;

			if (isHoliday) {
				html += `<div class="matrix-holidays">${isHoliday.n}</div>`;
			} else {
				['A', 'B', 'C', 'D'].forEach(br => {
					const shift = this.engine.getShift(ts, br);
					let shiftClass = '';
					let label = '';
					let workHours = '';

					if (br == 'B') {
					    switch (shift) {
                            case 1: workHours = '<span class="hour-label">7-14</span>';break;
                            case 2: workHours = '<span class="hour-label">14-21</span>';break;
                            case 3: workHours = '<span class="hour-label">22-5</span>';break;
					    }
					} else {
						switch (shift) {
							case 1: workHours = '<span class="hour-label">6-14</span>';break;
							case 2: workHours = '<span class="hour-label">14-22</span>';break;
							case 3: workHours = '<span class="hour-label">22-6</span>';break;
						}
					}

					if (shift < 4) {
						shiftClass = `shift${shift}`;
						label = shift;
					} else {
						shiftClass = 'off';
					}
					html += `<div class="matrix-cell ${shiftClass}">
							<strong>${label}</strong>
							${workHours}
						</div>`;
				});
			}
			html += `</div>`;
		}
		html += `</div>`;

		this.ui.container.className = 'monthMatrix';
		this.ui.container.innerHTML = html;
		this.ui.dateBar.innerText = title;

		if (todayMonth === this.state.month) {
			requestAnimationFrame(() => {
				const todayRow = this.ui.container.querySelector('.today-row');
				if (todayRow) {
					todayRow.scrollIntoView({ block: 'center', behavior: 'instant' });
				}
			});
		}
	}

    // LOGIKA SPA DLA PRZYCISKÓW STATUSU
    openDayDetails(dateStr, fromSearch = false) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
        this.state.selectedDateStr = dateStr;
        this.state.returnToSearch = fromSearch;
        this.ui.spaTitle.innerText = dateStr;

        const data = this.userData[dateStr] || { status: 'normal', note: '', hours: 8 };

        // Zaznacz odpowiedni przycisk statusu
        const statusBtns = this.ui.statusPicker.querySelectorAll('.status-btn');
        statusBtns.forEach(btn => {
            const isMatch = btn.dataset.value === data.status;
            btn.classList.toggle('active', isMatch);
        });

        this.ui.inputNote.value = data.note || '';
        this.ui.inputHours.value = data.hours || 8;

        // Pokaż/ukryj opcję godzin
        if (data.status === 'nadgodziny' || data.status === 'sw') {
            this.ui.groupHours.classList.remove('display-none');
        } else {
            this.ui.groupHours.classList.add('display-none');
        }

        this.ui.spaContainer.classList.remove('hidden');
        if (fromSearch) {
            this.ui.searchContainer.classList.add('hidden');
            this.ui.searchContainer.setAttribute('aria-hidden', 'true');
        }
    }

    closeDayDetails() {
        const returnToSearch = this.state.returnToSearch;
        this.state.selectedDateStr = null;
        this.state.returnToSearch = false;
        this.ui.spaContainer.classList.add('hidden');
        if (returnToSearch) this.openSearch();
    }

    openSearch() {
        this.ui.spaContainer.classList.add('hidden');
        this.ui.searchContainer.classList.remove('hidden');
        this.ui.searchContainer.setAttribute('aria-hidden', 'false');
        this.renderSearchResults();
    }

    closeSearch() {
        this.ui.searchContainer.classList.add('hidden');
        this.ui.searchContainer.setAttribute('aria-hidden', 'true');
    }

    updateSearchFilterCounts() {
        const counts = { l4: 0, nieobecnosc: 0, urlop: 0, uz: 0, sw: 0 };
        Object.values(this.userData).forEach(item => {
            if (item && Object.prototype.hasOwnProperty.call(counts, item.status)) counts[item.status]++;
        });
        Object.entries(counts).forEach(([status, count]) => {
            const badge = this.ui.searchFilters.querySelector(`[data-count-for="${status}"]`);
            if (badge) badge.textContent = String(count);
        });
    }

    renderSearchResults() {
        this.updateSearchFilterCounts();
        const labels = { l4: 'L4', nieobecnosc: 'Nieob.', urlop: 'Urlop', uz: 'UŻ', sw: 'SW' };
        const status = this.state.searchStatus;
        const entries = Object.values(this.userData)
            .filter(item => item && item.status === status && /^\d{4}-\d{2}-\d{2}$/.test(item.date))
            .sort((a, b) => b.date.localeCompare(a.date));

        if (!entries.length) {
            this.ui.searchResults.innerHTML = '<div class="search-empty">Brak zapisanych dni w tej kategorii.</div>';
            return;
        }

        this.ui.searchResults.innerHTML = entries.map(item => {
            const date = new Date(`${item.date}T12:00:00`);
            const weekday = date.toLocaleDateString('pl-PL', { weekday: 'long' });
            const displayDate = date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const hours = (status === 'sw' && Number.isFinite(Number(item.hours))) ? ` · ${Number(item.hours)}h` : '';
            const note = item.note ? ' · notatka' : '';
            return `<button type="button" class="search-card" data-date="${item.date}">
                <span class="search-card-date"><strong>${displayDate}</strong><span>${weekday}${note}</span></span>
                <span class="search-card-meta"><span class="search-status">${labels[status]}${hours}</span> →</span>
            </button>`;
        }).join('');
    }

    async saveDayDetails() {
        if (!this.state.selectedDateStr) return;
        const dateStr = this.state.selectedDateStr;

        const activeStatusBtn = this.ui.statusPicker.querySelector('.status-btn.active');
        const selectedStatus = activeStatusBtn ? activeStatusBtn.dataset.value : 'normal';

        const dataToSave = {
            date: dateStr,
            status: selectedStatus,
            note: this.ui.inputNote.value.trim(),
            hours: parseInt(this.ui.inputHours.value) || 8
        };

        if (!['normal', 'l4', 'urlop', 'uz', 'sw', 'nieobecnosc', 'nadgodziny'].includes(selectedStatus)) return;
        if ((selectedStatus === 'sw' || selectedStatus === 'nadgodziny') &&
            (!Number.isInteger(dataToSave.hours) || dataToSave.hours < 1 || dataToSave.hours > 24)) {
            this.ui.inputHours.focus();
            return;
        }

        try {
            await this.db.save(dataToSave);
            this.userData[dateStr] = dataToSave;
        } catch(e) {
            console.error("Błąd zapisu do IndexedDB:", e);
            window.alert('Nie udało się zapisać zmian. Spróbuj ponownie.');
            return;
        }

        const returnToSearch = this.state.returnToSearch;
        this.closeDayDetails();
        if (!returnToSearch) this.refresh();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    window.app.init();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => {
                reg.onupdatefound = () => {
                    console.log('Znaleziono nową wersję grafika!');
                };
            })
            .catch(err => console.error('Błąd SW:', err));
    });
}
