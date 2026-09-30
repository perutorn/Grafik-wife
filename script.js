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
	  matrix: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`
	};
    
    constructor() {
        this.engine = new ShiftEngine();
        this.db = new DBManager();
        this.todayDate = new Date();
        this.userData = {}; // In-memory cache for IndexedDB entries
               
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
			inputStatus: document.getElementById('dayStatus'),
			inputNote: document.getElementById('dayNote'),
			inputHours: document.getElementById('overtimeHours'),
			groupHours: document.getElementById('overtimeGroup')
		}
		
		this.ui.btnH.innerHTML = this.icons.home;
        
        this.state = {
            year: new Date().getFullYear(),
            month: new Date().getMonth(),
            brigade: localStorage.getItem("defaultBrigade") || 'A',
            mode: parseInt(localStorage.getItem("mode")) || this.MONTH_MODE,
            view: parseInt(localStorage.getItem("view")) || this.SIMPLE,
            selectedDateStr: null // YYYY-MM-DD
        };
        
		this.ui.btnT.innerHTML = (this.state.view === this.SIMPLE)? this.icons.matrix:this.icons.calendar;
        this.holidays = this.engine.getPolishHolidays(this.state.year);
    }

    async init() {
        try {
            await this.db.init();
            const dataArray = await this.db.getAll();
            // Przepisanie z tablicy IndexedDB do obiektu szybkiego dostępu (HashMap)
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
        
		this.ui.btnT.onclick = () => {
			this.state.view = (this.state.mode === this.MONTH_MODE && this.state.view === this.SIMPLE)? this.MATRIX:this.SIMPLE;
			this.ui.btnT.innerHTML = (this.state.view === this.SIMPLE)? this.icons.matrix:this.icons.calendar;
			this.ui.btnT.classList.toggle("active", this.state.view === this.MATRIX);
			localStorage.setItem("view", this.state.view);
			this.#haptic("medium");
			this.refresh();
		}

        // Kliknięcie w kontener główny (Delegacja zdarzeń)
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

            // Otwieranie SPA Details w Month View / Matrix View
            const dayEl = e.target.closest('.day'); // SIMPLE
            const matrixRowEl = e.target.closest('.matrix-row'); // MATRIX
            
            if (dayEl && dayEl.dataset.date) {
                this.openDayDetails(dayEl.dataset.date);
            } else if (isMatrixView && matrixRowEl && !matrixRowEl.classList.contains('matrix-header') && matrixRowEl.dataset.date) {
                this.openDayDetails(matrixRowEl.dataset.date);
            }
        });

        // Eventy dla ekranu SPA
        this.ui.btnBack.onclick = () => this.closeDayDetails();
        
        this.ui.inputStatus.onchange = () => {
            const st = this.ui.inputStatus.value;
            if (st === 'nadgodziny' || st === 'sw') {
                this.ui.groupHours.classList.remove('display-none');
            } else {
                this.ui.groupHours.classList.add('display-none');
            }
        };

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
	
    // Helper daty
    formatDateString(y, m, d) {
        return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    // Sprawdza czy dany dzień ma znaczące dane użytkownika (do wyrysowania kropki/statusu)
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
            let isOverride = false;

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
			
            // Obsługa własnych statusów nadpisujących
            if (uData && uData.status !== 'normal') {
                isOverride = true;
                if (uData.status === 'urlop' || uData.status === 'uz') { shiftClass = 'off status-override'; workHours = '<span class="hour-label">Urlop</span>'; }
                if (uData.status === 'l4') { shiftClass = 'holiday status-override'; workHours = '<span class="hour-label">L4</span>'; }
                if (uData.status === 'sw') { shiftClass = 'off status-override'; workHours = `<span class="hour-label">SW ${uData.hours}h</span>`; }
                if (uData.status === 'nieobecnosc') { shiftClass = 'empty status-override'; workHours = '<span class="hour-label">Nieob.</span>'; }
            }

            const badgeHtml = (uData && uData.note) ? `<div class="badge"></div>` : '';
            const todayClass = (d === todayDate && year === todayYear && month === todayMonth) ? "todayClass" : "";

			html += `<div class="day ${shiftClass} ${todayClass}" data-date="${dateStr}">
                        ${badgeHtml}
						<strong>${d}</strong>
						${workHours}
				 	</div>`;
		}
		
		const currentElements = offset + daysInMonth;
		const remaining = 42 - currentElements;
		
		for (let i = 0; i < remaining; i++) {
			html += `<div class="empty day"></div>`;
		}

		const wzs = this.#calculateWZS(year, month) - offDaysSystem;
		const nightHours = (brigade === 'B')? nightShifts * 7: nightShifts *8;

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
                    
                    // W widoku roku kropki będą zbyt małe by analizować user notes, zostawiamy goły kalendarz
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

    // -- LOGIKA SPA DLA NOTATEK --
    openDayDetails(dateStr) {
        this.state.selectedDateStr = dateStr;
        this.ui.spaTitle.innerText = dateStr; // Ewentualnie lepsze formatowanie np "15 Paź 2026"
        
        // Wyczyść / załaduj istniejące dane
        const data = this.userData[dateStr] || { status: 'normal', note: '', hours: 8 };
        
        this.ui.inputStatus.value = data.status;
        this.ui.inputNote.value = data.note || '';
        this.ui.inputHours.value = data.hours || 8;
        
        // Pokaż/ukryj godziny
        this.ui.inputStatus.onchange(); 

        // Animacja pokazania
        this.ui.spaContainer.classList.remove('hidden');
    }

    closeDayDetails() {
        this.state.selectedDateStr = null;
        this.ui.spaContainer.classList.add('hidden');
    }

    async saveDayDetails() {
        if (!this.state.selectedDateStr) return;
        const dateStr = this.state.selectedDateStr;
        
        const dataToSave = {
            date: dateStr,
            status: this.ui.inputStatus.value,
            note: this.ui.inputNote.value.trim(),
            hours: parseInt(this.ui.inputHours.value) || 8
        };

        // Zapis in-memory (błyskawiczny efekt)
        this.userData[dateStr] = dataToSave;
        
        // Zapis do IndexedDB (w tle)
        try {
            await this.db.save(dataToSave);
        } catch(e) {
            console.error("Błąd zapisu do IndexedDB:", e);
        }

        this.closeDayDetails();
        this.refresh(); // Przerenderuj kalendarz by pokazać zmianę
    }
}

// Start
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    window.app.init(); // Asynchroniczna inicjalizacja DB przed startem renderowania
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js') 
            .then(reg => {
                reg.onupdatefound = () => {
                    console.log('Znaleziono nową wersję grafika! Odśwież, aby zaktualizować.');
                };
            })
            .catch(err => console.error('Błąd SW:', err));
    });
}/* 1. SILNIK LOGIKI */
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
    #touchStartX = 0;
    #touchStartY = 0;
    #touchEndX = 0;
    #touchEndY = 0;
    
    SIMPLE = 0;
    MATRIX = 1;
    
    YEAR_MODE = 10;
    MONTH_MODE = 11;
    
    icons = {
	  legend: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
	  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
	  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
	  matrix: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`
	};
    

    constructor() {
        this.engine = new ShiftEngine();
        this.todayDate = new Date();
               
        this.ui = {
			dateBar: document.getElementById("dateBar"),
			container: document.getElementById("mainContainer"),
			footer: document.getElementById("footer"),
			legend: document.getElementById("legend_info"),
			btnL: document.getElementById('L'),
			btnH: document.getElementById('H'),
			btnT: document.getElementById('T'),
			btnA: document.getElementById('A'),
			btnB: document.getElementById('B'),
			btnC: document.getElementById('C'),
			btnD: document.getElementById('D')
		}
		
		this.ui.btnL.innerHTML = this.icons.legend;
		this.ui.btnH.innerHTML = this.icons.home;
        
        localStorage.setItem("mode", this.MONTH_MODE);
        localStorage.setItem("view", this.SIMPLE);
        this.state = {
            year: new Date().getFullYear(),
            month: new Date().getMonth(),
            brigade: localStorage.getItem("defaultBrigade") || 'A',
            mode: parseInt(localStorage.getItem("mode")) || this.MONTH_MODE,
            view: parseInt(localStorage.getItem("view")) || this.SIMPLE,
            showLegend: localStorage.getItem("showLegend") === 'true' || false
        };
        
        this.ui.btnL.innerHTML = this.icons.legend;
		this.ui.btnH.innerHTML = this.icons.home;
		console.log(this.state.view);
		this.ui.btnT.innerHTML = (this.state.view === this.SIMPLE)? this.icons.matrix:this.icons.calendar;

        this.holidays = this.engine.getPolishHolidays(this.state.year);
        this.initEvents();
        this.refresh();
    }

    
    #haptic(type = 'light') {
		if (!navigator.vibrate) {
			console.log("Vibration not supported");
			 return; // Jeśli przeglądarka nie wspiera (np. niektóre iOS)
		}
		
		switch(type) {
			case 'light': navigator.vibrate(15); break;     // Krótkie kliknięcie (przyciski)
			case 'medium': navigator.vibrate(35); break;    // Zmiana widoku/miesiąca
			case 'error': navigator.vibrate([50, 50, 50]); break; // Błąd (3 szybkie)
		}
	}

    initEvents() {
		
		document.addEventListener('keydown', (event) => {
			switch (event.key) {
				case "ArrowLeft":this.#changeDate(-1); break;
				case "ArrowRight": this.#changeDate(+1);break;
				case "ArrowDown": this.ui.btnL.click();	break;
				case "ArrowUp": this.ui.btnT.click(); break;
				case 'a' || 'A': this.ui.btnA.click(); break;
				case 'b' || 'B': this.ui.btnB.click(); break;
				case 'c' || 'C': this.ui.btnC.click(); break;
				case 'd' || 'D': this.ui.btnD.click(); break;
				case " " || 'h' || 'H': this.ui.btnH.click(); break;
				case 'r' || 'R': {
					this.state.mode = (this.state.mode === this.MONTH_MODE)? this.YEAR_MODE:this.MONTH_MODE;
					this.refresh();
				}; break;
			}
		});

        // --- KLIKNIĘCIA ---
        ['A', 'B', 'C', 'D'].forEach(id => {
			const btn = document.getElementById(id);
            btn.onclick = () => {
				this.#haptic('light');
                this.state.brigade = id;
                localStorage.setItem('defaultBrigade', id);
                this.refresh();
            };
        });

        this.ui.btnH.onclick = () => this.goHome();
        
        this.ui.btnL.onclick = () => {
			this.ui.footer.classList.toggle("legend-collapsed", this.state.showLegend);
			this.ui.btnL.classList.toggle("active", !this.ui.footer.classList.contains("legend-collapsed"));
			this.state.showLegend = this.ui.btnL.classList.contains("active");
        };

        // --- OBSŁUGA DOTYKU (SWIPE) ---
        const wrapper = this.ui.container;

		wrapper.addEventListener('touchstart', e => {
			this.#touchStartX = e.changedTouches[0].screenX;
			this.#touchStartY = e.changedTouches[0].screenY;
		}, {passive: true});

		// Zmieniamy na touchmove, żeby móc zablokować odświeżanie strony w trakcie ruchu
		wrapper.addEventListener('touchmove', e => {
			const currentY = e.changedTouches[0].screenY;
			const diffY = currentY - this.#touchStartY;

			// Pobieramy aktualny element przewijalny (Matrix lub standardowy)
			const scrollTarget = wrapper.querySelector('.matrix-scroll') || wrapper;

			// Jeśli przesuwamy w dół na samej górze, blokujemy systemowe odświeżanie (pull-to-refresh)
			if (diffY > 0 && scrollTarget.scrollTop <= 0) {
				if (e.cancelable) e.preventDefault();
			}
		}, {passive: false});
		
		this.ui.container.addEventListener("click", (e) => {
    const isYearMode = this.state.mode === this.YEAR_MODE;
    const isMatrixView = this.state.view === this.MATRIX;
    
    // --- LOGIKA DLA MACIERZY ---
    if (isMatrixView && !isYearMode) {
        const row = e.target.closest('.matrix-row');
        
        // Sprawdzamy czy trafiliśmy w rząd i czy to nie nagłówek
        if (row && !row.classList.contains('matrix-header')) {
            // Usuwamy klasę ze wszystkich rzędów (pętla forEach)
            this.ui.container.querySelectorAll('.matrix-row')
                .forEach(r => r.classList.remove('matrix-row-selected'));
            
            // Dodajemy klasę (bez kropki!)
            row.classList.add('matrix-row-selected');
        }
        return;
    }
        
    // --- LOGIKA DLA WIDOKU ROKU ---
    if (isYearMode) {
        const miniMonth = e.target.closest('.mini-month');
        // Sprawdzamy czy miniMonth istnieje, zanim pobierzemy dataset
        if (miniMonth && miniMonth.dataset.m) {
            this.goToMonth(parseInt(miniMonth.dataset.m));
        }
        return;
    }

    // Widok SIMPLE - na razie brak akcji
    if (!isYearMode && !isMatrixView) return;
});
			
		
		wrapper.addEventListener('touchend', e => {
			this.#touchEndX = e.changedTouches[0].screenX;
			this.#touchEndY = e.changedTouches[0].screenY;
			this.#handleSwipe();
		}, {passive: true});
			
		
		this.ui.btnT.onclick = () => {
			this.state.view = (this.state.mode === this.MONTH_MODE && this.state.view === this.SIMPLE)? this.MATRIX:this.SIMPLE;
			this.ui.btnT.innerHTML = (this.state.view === this.SIMPLE)? this.icons.matrix:this.icons.calendar;
			this.ui.btnT.classList.toggle("active", this.state.view === this.MATRIX);
			localStorage.setItem("view", this.state.view);
			this.#haptic("medium");
			this.refresh();
		}
		
		
    }

	
	#buttonsRefresh() {
		const { state: s, ui: u } = this; // Destrukturyzacja dla czytelności
		const brigades = [u.btnA, u.btnB, u.btnC, u.btnD];

		// Logika warunkowa wyciągnięta przed nawias
		const isYearMode = (s.mode === this.YEAR_MODE);
		const isMatrix = (s.view === this.MATRIX);

		// 1. Obsługa brygad (A, B, C, D)
		// Wyłączamy je TYLKO w trybie MATRIX, gdy NIE jest to tryb roczny
		const brigadesDisabled = isMatrix && !isYearMode;

		brigades.forEach(btn => {
			btn.disabled = brigadesDisabled;
			// Klasa active tylko gdy przycisk jest aktywny i zgadza się z brygadą
			btn.classList.toggle("active", !btn.disabled && btn.id === s.brigade);
		});

		// 2. Obsługa przycisku T
		// Wyłączamy T tylko w trybie rocznym
		u.btnT.disabled = isYearMode;
		
		u.btnL.classList.toggle("active", this.state.showLegend);
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
        
        // Aktualizacja świąt przy zmianie roku
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
		
        if (change) {
			this.refresh();
		}
    }
    
    saveSettingsToLocalStorage(){
		localStorage.setItem("view", this.state.view);
		localStorage.setItem("mode", this.state.mode);
		localStorage.setItem("shoLegend", this.state.showLegend);
		localStorage.setItem("defaultBrigade", this.state.brigade);
	}

    refresh() {
		
		this.#buttonsRefresh();
		this.saveSettingsToLocalStorage();
			
		// Czyścimy klasy i ustawiamy bazę
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
	
	#handleSwipe() {
		const diffX = this.#touchEndX - this.#touchStartX;
		const diffY = this.#touchEndY - this.#touchStartY;
		const threshold = 100;
		const scrollTarget = this.ui.container.querySelector('.matrix-scroll') || this.ui.container;

		// 1. Obsługa pozioma (Zmiana miesiąca/roku) - Priorytetowa
		if (Math.abs(diffX) > Math.abs(diffY)) {
			if (Math.abs(diffX) > threshold) {
				this.#haptic("medium");
				this.#changeDate(diffX < 0 ? 1 : -1);
			}
			return; 
		}

		// 2. Obsługa pionowa (Przejście Miesiąc <-> Rok)
		if (Math.abs(diffY) > threshold) {
			const isAtTop = scrollTarget.scrollTop <= 5;
			const isAtBottom = scrollTarget.scrollHeight - scrollTarget.scrollTop <= scrollTarget.clientHeight + 5;

			// Swipe w dół (palec idzie w dół) na samej górze -> przejdź do widoku roku
			if (diffY > threshold && isAtTop) {
				this.#toggleYearMonthMode();
			} 
			// Swipe w górę (palec idzie w górę) na samym dole -> też może przełączać
			else if (diffY < -threshold && isAtBottom) {
				this.#toggleYearMonthMode();
			}
		}
	}

// Pomocnicza metoda dla czystości kodu
	#toggleYearMonthMode() {
		this.#haptic("medium");
		this.state.mode = (this.state.mode === this.MONTH_MODE) ? this.YEAR_MODE : this.MONTH_MODE;
		this.#saveAndRefresh();
	}
// Pomocnicza metoda, żeby nie powtarzać kodu
	#saveAndRefresh() {
		localStorage.setItem("mode", this.state.mode);
		this.refresh();
	}
	

    #renderMonth() {
		const { year, month, brigade } = this.state;
		const title = new Date(year, month).toLocaleString('pl-PL', { month: 'long', year: 'numeric' });
		const todayDate = this.todayDate.getDate();
		const todayMonth = this.todayDate.getMonth();
		const todayYear = this.todayDate.getFullYear();
		
		// 1. Nagłówki dni (Pn-Nd)
		let html = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']
			.map(n => `<div class="day-name">${n}</div>`).join('');
		
		const firstDay = new Date(year, month, 1).getDay();
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const offset = (firstDay === 0) ? 6 : firstDay - 1;

		// 2. Puste komórki na początku
		for (let i = 0; i < offset; i++) {
			html += `<div class="empty day"></div>`;
		}

		let offDaysSystem = 0;
		let nightShifts = 0;
		let workHours = '';

		// 3. Dni miesiąca
		for (let d = 1; d <= daysInMonth; d++) {
			const tDate = new Date(year, month, d);
			const isHoliday = this.holidays.some(h => h.m === month && h.d === d);
			let shiftClass = '';

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
			
			html += `<div class="day ${shiftClass} ${(d === todayDate && year === todayYear && month === todayMonth)? "todayClass": ""}">
						<strong>${d}</strong>
						${workHours}
				 	</div>`;
		}
		// 4. DOPEŁNIENIE DO 42 (Gwarantuje 6 pełnych wierszy dat)
		// To sprawia, że pasek statystyk zawsze będzie w tym samym miejscu pionowo.
		const currentElements = offset + daysInMonth;
		const remaining = 42 - currentElements;
		
		for (let i = 0; i < remaining; i++) {
			html += `<div class="empty day"></div>`;
		}

		// 5. Statystyki
		const wzs = this.#calculateWZS(year, month) - offDaysSystem;
		const nightHours = (brigade === 'B')? nightShifts * 7: nightShifts *8;

		html += `
			<div class="monthStats">
				<span>WZS: <strong>${wzs > 0 ? '+' + wzs : wzs}</strong></span>
				<span>NOCE: <strong>${nightShifts} / ${nightHours}h</strong></span>
			</div>`;

		//this.ui.render(html, title);
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
        const grid = this.ui.grid;
        const todayMonth = this.todayDate.getMonth();
        const todayYear = this.todayDate.getFullYear();
        
        // Czyścimy grid i ustawiamy tryb
        //this.ui.container.classList.toggle("year-grid", this.state.mode === this.YEAR_MODE);
        this.ui.dateBar.innerText = year;

        let fullYearHtml = ''; 

        // Generujemy 4 kwartały
        for (let q = 0; q < 4; q++) {
            let qOffDaysSystem = 0;
            let qOffDaysNorm = 0;
            let quarterMonthsHtml = '';

            // 3 miesiące w każdym kwartale
            for (let m = q * 3; m < (q * 3) + 3; m++) {
                const firstDay = new Date(year, m, 1).getDay();
                const daysInMonth = new Date(year, m + 1, 0).getDate();
                const offset = firstDay === 0 ? 6 : firstDay - 1;
                
                let daysHtml = '';

                // Puste dni na początku miesiąca
                for (let i = 0; i < offset; i++) {
                    daysHtml += `<div class="empty"></div>`; 
                }

                // Dni miesiąca
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
                        // Używamy metody z silnika wewnątrz klasy App
                        const shift = this.engine.getShift(tDate.getTime(), brigade);
                        if (shift < 4) {
                            shiftClass = `shift${shift}`;
                        } else {
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
                    <div class="mini-month ${currentMonth}"  data-m="${m}">
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
	
	//Przejdź do widoku miesiąca po kliknięciu w kafelek w widoku roku
    goToMonth(m) {
        this.state.month = m;
        this.state.mode = this.MONTH_MODE;
        this.refresh();
    }
    
   #renderMonthMatrix() {
		const { year, month } = this.state;
		const container = this.ui.grid; // Korzystamy z głównego kontenera
		const title = new Date(year, month).toLocaleString('pl-PL', { month: 'long', year: 'numeric' });
		const todayDate = this.todayDate.getDate();
		const todayMonth = this.todayDate.getMonth();
		const todayYear = this.todayDate.getFullYear();
		
		// 1. Nagłówek macierzy
		let html = `
		<div class="matrix-row matrix-header">
			<div>DATA</div>
			<div>A</div><div>B</div><div>C</div><div>D</div>
		</div>
		<div class="matrix-scroll" style="overflow-y: auto; flex-grow: 1;">`;

		const daysInMonth = new Date(year, month + 1, 0).getDate();

		// 2. Generowanie dni
		for (let d = 1; d <= daysInMonth; d++) {
			const tDate = new Date(year, month, d);
			const ts = tDate.getTime();
			const isHoliday = this.holidays.find(h => h.m === month && h.d === d);
			const dayOfWeek = tDate.getDay();
			const isWeekend = dayOfWeek === 0;

			// Format daty: 01-Pn
			const dayStr = tDate.toLocaleString('pl', { weekday: 'short' }).replace('.', '');
			const dateDisplay = `${d.toString().padStart(2, '0')}-${dayStr}`;
			const isToday = (d === todayDate
							&& this.state.month === todayMonth
							&& this.state.year === todayYear)? "today-row" : "";

			html += `<div class="matrix-row ${isToday}" data-ts="${ts}">
				<div class="matrix-date ${(isWeekend || isHoliday) ? 'holiday' : ''}" 
					 style="${(isWeekend || isHoliday) ? 'color: var(--color-holiday); opacity: 0.8' : ''}">
					 ${dateDisplay}
				</div>`;

			if (isHoliday) {
				html += `<div class="matrix-holidays">${isHoliday.n}</div>`;
			} else {
				// Pętla po brygadach
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
					html += `<div class="matrix-cell ${shiftClass}" data-date="${ts}">
							<strong>${label}</strong>
							${workHours}
						</div>`;
				});
			}

			html += `</div>`;
		}
		html += `</div>`;
		
		// 3. Renderowanie do UI
		this.ui.container.className = 'monthMatrix';
		this.ui.container.innerHTML = html;
		this.ui.dateBar.innerText = title;
		
		if (todayMonth === this.state.month) {
			requestAnimationFrame(() => {
				const todayRow = this.ui.container.querySelector('.today-row');
				if (todayRow) {
					todayRow.scrollIntoView({ 
						block: 'center', 
						behavior: 'instant' // 'instant' zamiast 'smooth', żeby użytkownik nie widział "jazdy" suwaka przy ładowaniu
					});
				}
			});
		}
	}
}

// Start
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Usunięcie kropki sprawia, że ścieżka jest relatywna do lokalizacji index.html
        navigator.serviceWorker.register('sw.js') 
            .then(reg => {
                // Dodaj powiadomienie o aktualizacji (opcjonalnie)
                reg.onupdatefound = () => {
                    console.log('Znaleziono nową wersję grafika! Odśwież, aby zaktualizować.');
                };
            })
            .catch(err => console.error('Błąd SW:', err));
    });
}
