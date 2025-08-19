import React, { useState, useRef, useEffect, useCallback } from 'react';
import Papa from 'papaparse';
import { Upload, X, Trash2, FileText, Download, Save as SaveIcon } from 'lucide-react';
import ExportModal from './ExportModal';
import { db } from '../../firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy, limit } from 'firebase/firestore';
import { logCreate, logDelete } from '../../utils/changeLogger';


const RoomGridGenerator = () => {
    const [allClassData, setAllClassData] = useState([]);
    const [buildings, setBuildings] = useState({});
    const [selectedBuilding, setSelectedBuilding] = useState('');
    const [selectedRoom, setSelectedRoom] = useState('');
    const [selectedDayType, setSelectedDayType] = useState('MWF');
    const [semester, setSemester] = useState('Fall 2025');
    const [message, setMessage] = useState({ text: '', type: '' });
    const [scheduleHtml, setScheduleHtml] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingSaved, setIsLoadingSaved] = useState(false);
    const [savedGrids, setSavedGrids] = useState([]);

    const printRef = useRef();
    const fileInputRef = useRef();

    const timeSlots = {
        MWF: [
            "8:00 am - 8:50 am", "9:05 am - 9:55 am", "10:10 am - 11:00 am",
            "11:15 am - 12:05 pm", "12:20 pm - 1:10 pm", "1:25 pm - 2:15 pm",
            "2:30 pm - 3:20 pm", "3:35 pm - 4:25 pm", "4:40 pm - 5:30 pm"
        ],
        TR: [
            "8:00 am - 9:15 am", "9:30 am - 10:45 am", "11:00 am - 12:15 pm",
            "12:30 pm - 1:45 pm", "2:00 pm - 3:15 pm", "3:30 pm - 4:45 pm",
            "5:00 pm - 6:15 pm"
        ]
    };

    const showMessage = (text, type = 'error') => {
        setMessage({ text, type });
    };

    const resetUI = (soft = false) => {
        if (!soft) {
            setAllClassData([]);
            setBuildings({});
            setSelectedBuilding('');
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
        setSelectedRoom('');
        setScheduleHtml('');
        setMessage({ text: '', type: '' });
    };

    const handleFileUpload = (file) => {
        if (!file) return;

        resetUI(true);
        setIsProcessing(true);
        
        Papa.parse(file, {
            header: true,
            skipEmptyLines: "greedy",
            beforeFirstChunk: (chunk) => {
                const lines = chunk.split(/\r\n|\n|\r/);
                const headerIndex = lines.findIndex(line => line.includes('"CLSS ID","CRN","Term"'));
                
                if (headerIndex === -1) {
                    console.error("Could not find the header row in the CSV file.");
                    return "";
                }

                const header = lines[headerIndex];
                const dataLines = lines.slice(headerIndex + 1);
                return [header, ...dataLines].join('\n');
            },
            complete: (results) => {
                processData(results.data);
                setIsProcessing(false);
            },
            error: (error) => {
                console.error("Error parsing CSV:", error);
                showMessage("Error parsing CSV. Please check file format and console for details.");
                setIsProcessing(false);
            }
        });
    };
    
    const processData = (data) => {
        const items = data.flatMap(row => {
            try {
                const roomRaw = row['Room'] || '';
                const meetingPatternRaw = row['Meeting Pattern'] || '';
                const instructorRaw = row['Instructor'] || '';

                if (!roomRaw || roomRaw.toLowerCase().includes('no room needed') || roomRaw.toLowerCase().includes('online') || !meetingPatternRaw || meetingPatternRaw.toLowerCase().startsWith('does not meet')) {
                    return [];
                }

                const roomsList = roomRaw.split(';').map(r => r.trim());
                const patternsList = meetingPatternRaw.split(';').map(p => p.trim());

                const baseInfo = {
                    class: `${row['Subject Code']} ${row['Catalog Number']}`,
                    section: (row['Section #'] || '').split(' ')[0],
                    professor: (instructorRaw || '').split(',')[0].trim()
                };

                return roomsList.map((roomString, i) => {
                    const patternString = patternsList[i] || patternsList[0];
                    let buildingName, roomNumber;
                    const roomMatch = roomString.match(/(.+?)\s+([\w\d\-\/]+)$/);
                    if (roomMatch) {
                        buildingName = roomMatch[1].trim();
                        roomNumber = roomMatch[2].trim();
                    } else {
                        if (roomString.toLowerCase().includes('general assignment')) return null;
                        buildingName = roomString.trim();
                        roomNumber = "N/A";
                    }
                    
                    const mp = patternString.trim().match(/^([A-Za-z]+)\s+(.+)$/);
                    const days = mp ? mp[1] : (patternString.split(/\s+/)[0] || '');
                    const time = mp ? mp[2].trim() : patternString.replace(days, '').trim();

                    if (!buildingName || !roomNumber || !days || !time) return null;

                    return { ...baseInfo, building: buildingName, room: roomNumber, days: days, time: time };
                }).filter(Boolean);

            } catch (e) {
                console.warn("Could not process row:", row, "Error:", e);
                return [];
            }
        });

        // Deduplicate identical entries that sometimes occur in CLSS exports
        const dedupedMap = new Map();
        for (const item of items) {
            const key = [
                item.building,
                item.room,
                item.days.replace(/\s/g, ''),
                item.time.replace(/\s/g, ''),
                item.class,
                item.section,
                item.professor
            ].join('|');
            if (!dedupedMap.has(key)) dedupedMap.set(key, item);
        }
        const processedClassData = Array.from(dedupedMap.values());

        setAllClassData(processedClassData);

        const newBuildings = processedClassData.reduce((acc, item) => {
            if (!acc[item.building]) {
                acc[item.building] = new Set();
            }
            acc[item.building].add(item.room);
            return acc;
        }, {});

        setBuildings(newBuildings);
        
        if (Object.keys(newBuildings).length === 0) {
            showMessage("CSV processed, but no valid class data with rooms was found.");
        } else {
            showMessage(`Successfully processed ${processedClassData.length} classes.`, 'success');
        }
    };

    const generateSchedule = () => {
        if (!selectedBuilding || !selectedRoom) {
            showMessage("Please select a building and a room.");
            return;
        }

        if (selectedDayType === 'WEEK') {
            generateWeeklySchedule();
            return;
        }

        const dayChars = selectedDayType === 'MWF' ? ['M', 'W', 'F'] : ['T', 'R'];
        const relevantClasses = allClassData.filter(c => {
            const meetingDays = parseDaysToChars(c.days);
            return c.building === selectedBuilding &&
                   c.room === selectedRoom &&
                   meetingDays.some(d => dayChars.includes(d));
        });

        if (relevantClasses.length === 0) {
            setScheduleHtml(`<div class="text-center p-8 text-gray-500">No classes found for ${selectedBuilding} ${selectedRoom} on ${selectedDayType} days.</div>`);
            return;
        }

        const tableHeader = `
            <div class="text-2xl font-bold" contenteditable="true">${selectedBuilding.replace(' Bldg', '').toUpperCase()} ${selectedRoom}</div>
            <div class="text-lg font-medium">${selectedDayType === 'MWF' ? 'Monday - Wednesday - Friday' : 'Tuesday - Thursday'}</div>
            <div class="text-md" contenteditable="true">${semester}</div>
        `;

        const tableBody = timeSlots[selectedDayType].map(slot => {
            const classesInSlot = findClassesInSlot(relevantClasses, slot);
            const classContent = classesInSlot.length > 0 ? classesInSlot.map(c => {
                let daysIndicator = '';
                const mdays = parseDaysToChars(c.days);
                const expected = selectedDayType === 'MWF' ? ['M','W','F'] : ['T','R'];
                const isFullPattern = expected.every(d => mdays.includes(d)) && mdays.every(d => expected.includes(d));
                if (!isFullPattern) {
                    const overlap = mdays.filter(d => expected.includes(d)).join('');
                    daysIndicator = overlap ? ` (${overlap})` : ` (${c.days})`;
                }
                return `<div class="class-entry-wrapper">
                            <button class="delete-entry-btn export-ignore" data-action="delete-class" title="Remove">×</button>
                            <div class="class-entry" contenteditable="true">${c.class}.${c.section}${daysIndicator}</div>
                            <div class="prof-entry" contenteditable="true">${c.professor}</div>
                        </div>`;
            }).join('') : '';

            return `
                <tr>
                    <td class="time-slot">${slot.replace(/ am/g, '').replace(/ pm/g, '')}</td>
                    <td data-slot="${slot}">
                        <div class="slot-toolbar export-ignore"><button type="button" class="slot-add-btn export-ignore" data-action="add-class" title="Add entry">＋</button></div>
                        <div class="class-list">${classContent}</div>
                    </td>
                </tr>
            `;
        }).join('');

        setScheduleHtml(`
            <div class="schedule-sheet">
                <table class="schedule-table">
                    <thead>
                        <tr>
                            <th colspan="2">${tableHeader}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableBody}
                    </tbody>
                </table>
            </div>
        `);
        showMessage("Schedule generated. Click on fields to edit before printing.", 'success');
    };

    const parseDaysToChars = (daysStr) => {
        const str = (daysStr || '').replace(/\s/g, '');
        if (!str) return [];
        const chars = [];
        const add = (d) => { if (!chars.includes(d)) chars.push(d); };
        if (/M/.test(str)) add('M');
        if (/(T(?!h)|Tu)/i.test(str) || /\bT\b/.test(str)) add('T');
        if (/W/.test(str)) add('W');
        if (/(Th|R)/i.test(str)) add('R');
        if (/F/.test(str)) add('F');
        // Common shorthands
        if (/MWF/i.test(str)) return ['M','W','F'];
        if (/(TTh|TR)/i.test(str)) return ['T','R'];
        return chars;
    };

    const formatTimeLabel = (mins) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        const period = h >= 12 ? 'PM' : 'AM';
        let hour = h % 12; if (hour === 0) hour = 12;
        return `${hour}:${m.toString().padStart(2,'0')} ${period}`.replace(':00','');
    };

    const roundDownTo = (mins, step) => Math.floor(mins / step) * step;
    const roundUpTo = (mins, step) => Math.ceil(mins / step) * step;

    const generateWeeklySchedule = () => {
        const relevant = allClassData.filter(c => c.building === selectedBuilding && c.room === selectedRoom);
        if (relevant.length === 0) {
            setScheduleHtml(`<div class="text-center p-8 text-gray-500">No classes found for ${selectedBuilding} ${selectedRoom}.</div>`);
            return;
        }

        // Determine time range
        let earliest = timeToMinutes('8:00 am');
        let latest = timeToMinutes('5:00 pm');
        try {
            const starts = relevant.map(c => parseTimeRange(c.time)[0]);
            const ends = relevant.map(c => parseTimeRange(c.time)[1]);
            if (starts.length) earliest = Math.min(earliest, ...starts);
            if (ends.length) latest = Math.max(latest, ...ends);
        } catch {}
        const step = 15; // minutes per grid row
        const start = roundDownTo(earliest, 60); // snap to hour for cleaner labels
        const end = roundUpTo(latest, 30);
        const slots = Math.max(1, Math.round((end - start) / step));

        // Build hour labels and horizontal gridlines
        const hourMarks = [];
        const headerOffset = 2; // reserve row 1 for day headers
        for (let t = start; t <= end; t += 60) {
            const row = Math.round((t - start) / step) + headerOffset;
            const span = 60 / step;
            hourMarks.push(`
                <div class="hour-label" style="grid-column: 1; grid-row: ${row} / span ${span};">${formatTimeLabel(t)}</div>
                <div class="hour-line" style="grid-column: 2 / -1; grid-row: ${row};"></div>
            `);
        }

        // Build class blocks per day
        const dayToColumn = { 'M': 2, 'T': 3, 'W': 4, 'R': 5, 'F': 6 };
        const blocks = relevant.flatMap(c => {
            const [classStart, classEnd] = parseTimeRange(c.time);
            const startRow = Math.floor((classStart - start) / step) + headerOffset;
            const endRow = Math.ceil((classEnd - start) / step) + headerOffset;
            return parseDaysToChars(c.days).filter(d => dayToColumn[d]).map(d => {
                const col = dayToColumn[d];
                return `
                    <div class="class-block" style="grid-column: ${col}; grid-row: ${startRow} / ${endRow};">
                        <button class="delete-entry-btn delete-block-btn export-ignore" data-action="delete-block" title="Remove">×</button>
                        <div class="class-title" contenteditable="true">${c.class}.${c.section}</div>
                        <div class="class-instructor" contenteditable="true">${c.professor}</div>
                        <div class="class-time">${c.time}</div>
                    </div>
                `;
            });
        }).join('');

        const vLines = Object.values(dayToColumn).slice(0, -1).map(col =>
            `<div style="grid-column: ${col}; grid-row: 1 / -1; border-right: 1px solid #e5e7eb;"></div>`
        ).join('');

        const grid = `
            <div class="weekly-grid" style="--rows:${slots}; --rowHeight: 15px;" data-start="${start}" data-end="${end}" data-step="${step}" data-headeroffset="${headerOffset}">
                ${hourMarks.join('')}
                ${vLines}
                ${blocks}
                <div class="day-header" style="grid-column: 2;">Monday</div>
                <div class="day-header" style="grid-column: 3;">Tuesday</div>
                <div class="day-header" style="grid-column: 4;">Wednesday</div>
                <div class="day-header" style="grid-column: 5;">Thursday</div>
                <div class="day-header" style="grid-column: 6;">Friday</div>
            </div>
        `;

        const header = `
            <div class="weekly-header">
                <div class="header-left">
                    <div class="text-2xl font-bold" contenteditable="true">${selectedBuilding.replace(' Bldg','').toUpperCase()} ${selectedRoom} Schedule</div>
                    <div class="text-md" contenteditable="true">${semester}</div>
                </div>
                <div class="header-actions export-ignore">
                    <button type="button" class="slot-add-btn export-ignore" data-action="toggle-add-week-form" title="Add class to week">＋ Add</button>
                </div>
            </div>
        `;

        setScheduleHtml(`
            <div class="schedule-sheet weekly-sheet">
                ${header}
                ${grid}
            </div>
        `);
        showMessage("Weekly grid generated. Click on fields to edit before printing.", 'success');
    };

    const findClassesInSlot = (classes, slot) => {
        try {
            const [slotStart, slotEnd] = parseTimeRange(slot);
            return classes.filter(c => {
                try {
                    const [classStart, classEnd] = parseTimeRange(c.time);
                    return classStart < slotEnd && classEnd > slotStart;
                } catch (e) {
                    console.warn(`Could not parse time for class, skipping:`, c, `Error:`, e);
                    return false;
                }
            });
        } catch(e) {
            console.error("Error parsing time slot:", slot, e);
            return [];
        }
    };

    const timeToMinutes = (timeStr) => {
        const cleanedTimeStr = timeStr.toLowerCase().trim();
        const match = cleanedTimeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
        if (!match) throw new Error(`Invalid time format: "${timeStr}"`);
        let [_, hours, minutes, modifier] = match;
        hours = parseInt(hours, 10);
        minutes = parseInt(minutes, 10) || 0;
        if (modifier === 'pm' && hours < 12) hours += 12;
        if (modifier === 'am' && hours === 12) hours = 0;
        return hours * 60 + minutes;
    };

    const parseTimeRange = (rangeStr) => {
        const parts = rangeStr.replace(/\s/g, '').toLowerCase().split('-');
        if (parts.length === 1) {
            const singleTime = timeToMinutes(parts[0]);
            return [singleTime, singleTime + 1];
        }
        if (parts.length !== 2) throw new Error(`Invalid time range format: "${rangeStr}"`);
        let [startStr, endStr] = parts;
        const startModifierMatch = startStr.match(/(am|pm)/);
        const endModifierMatch = endStr.match(/(am|pm)/);
        if (!startModifierMatch && endModifierMatch) startStr += endModifierMatch[0];
        else if (startModifierMatch && !endModifierMatch) endStr += startModifierMatch[0];
        return [timeToMinutes(startStr), timeToMinutes(endStr)];
    };
    
    const fileUploaderRef = useRef(null);

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            handleFileUpload(file);
        }
    };
    
    const triggerFileUpload = () => {
        fileUploaderRef.current.click();
    };

    // Delegated events for add/delete within rendered HTML
    useEffect(() => {
        const container = printRef.current;
        if (!container) return;
        const handleClick = (e) => {
            let target = e.target;
            // If target is a text node, normalize to its parent element
            if (target && target.nodeType !== 1 && target.parentElement) {
                target = target.parentElement;
            }
            const actionEl = target && target.closest ? target.closest('[data-action]') : null;
            if (!actionEl) return;
            const action = actionEl.getAttribute('data-action');
            if (action === 'add-class') {
                const td = actionEl.closest('td[data-slot]');
                if (!td) return;
                const list = td.querySelector('.class-list');
                if (!list) return;
                const wrapper = document.createElement('div');
                wrapper.className = 'class-entry-wrapper';
                wrapper.innerHTML = `
                    <button class="delete-entry-btn export-ignore" data-action="delete-class" title="Remove">×</button>
                    <div class="class-entry" contenteditable="true">NEW 000.01</div>
                    <div class="prof-entry" contenteditable="true">Instructor Name</div>
                `;
                list.appendChild(wrapper);
            } else if (action === 'delete-class') {
                const wrapper = actionEl.closest('.class-entry-wrapper');
                if (wrapper) wrapper.remove();
            } else if (action === 'delete-block') {
                const block = actionEl.closest('.class-block');
                if (block) block.remove();
            } else if (action === 'add-week-block') {
                const grid = container.querySelector('.weekly-grid');
                if (!grid) return;
                const existing = container.querySelector('.weekly-add-form');
                if (existing) { existing.remove(); return; }
                const formEl = document.createElement('div');
                formEl.className = 'weekly-add-form export-ignore';
                formEl.innerHTML = `
                    <div class="inline-form">
                        <label>Day</label>
                        <select class="inline-input day">
                            <option value="M">Mon</option>
                            <option value="T">Tue</option>
                            <option value="W">Wed</option>
                            <option value="R">Thu</option>
                            <option value="F">Fri</option>
                        </select>
                        <label>Start</label>
                        <input class="inline-input start" placeholder="10:00 am" />
                        <label>End</label>
                        <input class="inline-input end" placeholder="10:50 am" />
                        <button class="btn-primary inline-btn" data-action="submit-week-form" type="button">Add</button>
                        <button class="btn-secondary inline-btn" data-action="add-week-block" type="button">Cancel</button>
                    </div>
                `;
                grid.insertAdjacentElement('beforebegin', formEl);
            } else if (action === 'submit-week-form') {
                const form = actionEl.closest('.weekly-add-form');
                if (!form) return;
                const grid = container.querySelector('.weekly-grid');
                if (!grid) return;
                const day = form.querySelector('select.day').value;
                const startStr = form.querySelector('input.start').value;
                const endStr = form.querySelector('input.end').value;
                const timeStr = `${startStr} - ${endStr}`;
                try {
                    const colMap = { 'M': 2, 'T': 3, 'W': 4, 'R': 5, 'F': 6 };
                    const col = colMap[day];
                    const start = parseInt(grid.getAttribute('data-start'), 10);
                    const step = parseInt(grid.getAttribute('data-step'), 10);
                    const headerOffset = parseInt(grid.getAttribute('data-headeroffset'), 10);
                    const [startMin, endMin] = parseTimeRange(timeStr);
                    const startRow = Math.floor((startMin - start) / step) + headerOffset;
                    const endRow = Math.ceil((endMin - start) / step) + headerOffset;
                    const html = `
                        <div class="class-block" style="grid-column: ${col}; grid-row: ${startRow} / ${endRow};">
                            <button class="delete-entry-btn delete-block-btn export-ignore" data-action="delete-block" title="Remove">×</button>
                            <div class="class-title" contenteditable="true">NEW 000.01</div>
                            <div class="class-instructor" contenteditable="true">Instructor Name</div>
                            <div class="class-time">${timeStr}</div>
                        </div>
                    `;
                    grid.insertAdjacentHTML('beforeend', html);
                    form.remove();
                } catch (err) {
                    // ignore invalid format
                }
            }
        };
        container.addEventListener('click', handleClick);
        return () => container.removeEventListener('click', handleClick);
    }, [scheduleHtml]);

    // Firestore: saved grids
    const fetchSavedGrids = useCallback(async () => {
        setIsLoadingSaved(true);
        try {
            const gridsRef = collection(db, 'roomGrids');
            const q = query(gridsRef, orderBy('createdAt', 'desc'), limit(25));
            const snap = await getDocs(q);
            const results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setSavedGrids(results);
        } catch (err) {
            console.error('Error loading saved grids:', err);
        } finally {
            setIsLoadingSaved(false);
        }
    }, []);

    useEffect(() => {
        fetchSavedGrids();
    }, [fetchSavedGrids]);

    const saveGrid = async () => {
        if (!scheduleHtml || !selectedBuilding || !selectedRoom) {
            showMessage('Generate a schedule first, and ensure building/room are selected.');
            return;
        }
        setIsSaving(true);
        try {
            const html = printRef.current ? printRef.current.innerHTML : scheduleHtml;
            const payload = {
                title: `${selectedBuilding}-${selectedRoom}-${selectedDayType}-${semester}`,
                building: selectedBuilding,
                room: selectedRoom,
                dayType: selectedDayType,
                semester,
                html,
                createdAt: Date.now()
            };
            const ref = await addDoc(collection(db, 'roomGrids'), payload);
            logCreate(`Room Grid - ${payload.title}`, 'roomGrids', ref.id, payload, 'RoomGridGenerator.jsx - saveGrid').catch(() => {});
            showMessage('Grid saved.', 'success');
            fetchSavedGrids();
        } catch (err) {
            console.error('Save failed:', err);
            showMessage('Failed to save grid.');
        } finally {
            setIsSaving(false);
        }
    };

    const loadGrid = (grid) => {
        if (!grid) return;
        setSelectedBuilding(grid.building || selectedBuilding);
        setSelectedRoom(grid.room || selectedRoom);
        setSelectedDayType(grid.dayType || selectedDayType);
        setSemester(grid.semester || semester);
        setScheduleHtml(grid.html || '');
        showMessage('Loaded saved grid.', 'success');
    };

    const deleteSavedGrid = async (grid) => {
        if (!grid) return;
        const confirmDelete = window.confirm('Delete this saved grid?');
        if (!confirmDelete) return;
        try {
            await deleteDoc(doc(collection(db, 'roomGrids'), grid.id));
            logDelete(`Room Grid - ${grid.title}`, 'roomGrids', grid.id, grid, 'RoomGridGenerator.jsx - deleteSavedGrid').catch(() => {});
            showMessage('Deleted saved grid.', 'success');
            setSavedGrids(prev => prev.filter(g => g.id !== grid.id));
        } catch (err) {
            console.error('Delete failed:', err);
            showMessage('Failed to delete saved grid.');
        }
    };


    const buildingOptions = Object.keys(buildings).sort().map(name => (
        <option key={name} value={name}>{name}</option>
    ));

    const roomOptions = selectedBuilding && buildings[selectedBuilding]
        ? Array.from(buildings[selectedBuilding]).sort((a,b) => a.localeCompare(b, undefined, {numeric: true})).map(room => (
            <option key={room} value={room}>{room}</option>
        ))
        : [];

    return (
        <div className="page-content">
            <div className="university-header rounded-xl p-8 mb-8">
                <h1 className="university-title">Room Schedule Generator</h1>
                <p className="university-subtitle">Upload a CLSS export CSV to generate printable room schedules.</p>
            </div>

            <div className="university-card mb-8">
                <div className="university-card-content">
                    <h3 className="text-lg font-semibold text-baylor-green mb-2">Instructions</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1 text-sm">
                        <li>Currently, this tool requires a CSV export from CLSS.</li>
                        <li>In CLSS: select the semester, choose the HSD department, and export the entire CSV with all fields selected. The app will handle the rest.</li>
                        <li><strong>Coming Soon:</strong> This tool will be integrated directly with the dashboard's data, removing the need for manual CSV uploads.</li>
                    </ul>
                </div>
            </div>

            {message.text && (
                <div className={`border px-4 py-3 rounded-lg relative mb-6 ${message.type === 'success' ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'}`} role="alert">
                    <strong className="font-bold">Notice:</strong>
                    <span className="block sm:inline"> {message.text}</span>
                    <span onClick={() => setMessage({ text: '', type: '' })} className="absolute top-0 bottom-0 right-0 px-4 py-3 cursor-pointer">
                        <X className={`h-6 w-6 ${message.type === 'success' ? 'text-green-500' : 'text-red-500'}`} />
                    </span>
                </div>
            )}

            <div className="university-card">
                <div className="university-card-content">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                        <div className="md:col-span-2 lg:col-span-1">
                            <label htmlFor="csvFile" className="block text-sm font-medium text-gray-700 mb-1">1. Upload CLSS Export</label>
                            <input type="file" ref={fileUploaderRef} onChange={handleFileChange} className="hidden" accept=".csv" />
                            <button onClick={triggerFileUpload} className="btn-secondary w-full justify-center">
                                <Upload className="w-4 h-4 mr-2" />
                                { isProcessing ? 'Processing...' : 'Upload CSV' }
                            </button>
                        </div>
                        <div>
                            <label htmlFor="semesterInput" className="block text-sm font-medium text-gray-700 mb-1">2. Semester</label>
                            <input type="text" id="semesterInput" value={semester} onChange={e => setSemester(e.target.value)} className="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" placeholder="e.g., Fall 2025" />
                        </div>
                        <div>
                            <label htmlFor="buildingSelect" className="block text-sm font-medium text-gray-700 mb-1">3. Select Building</label>
                            <select id="buildingSelect" value={selectedBuilding} onChange={e => setSelectedBuilding(e.target.value)} className="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" disabled={Object.keys(buildings).length === 0}>
                                <option value="">-- Select Building --</option>
                                {buildingOptions}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="roomSelect" className="block text-sm font-medium text-gray-700 mb-1">4. Select Room</label>
                            <select id="roomSelect" value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)} className="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" disabled={!selectedBuilding}>
                                <option value="">-- Select Room --</option>
                                {roomOptions}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="dayTypeSelect" className="block text-sm font-medium text-gray-700 mb-1">5. Select View</label>
                            <select id="dayTypeSelect" value={selectedDayType} onChange={e => setSelectedDayType(e.target.value)} className="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" disabled={Object.keys(buildings).length === 0}>
                                <option value="MWF">MWF</option>
                                <option value="TR">TR</option>
                                <option value="WEEK">Week (M-F)</option>
                            </select>
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end space-x-4">
                         <button onClick={() => resetUI()} className="btn-danger">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Clear
                        </button>
                         <button onClick={generateSchedule} className="btn-primary" disabled={Object.keys(buildings).length === 0}>
                            <FileText className="w-4 h-4 mr-2" />
                            Generate Schedule
                        </button>
                        <button onClick={saveGrid} className="btn-secondary" disabled={!scheduleHtml || isSaving}>
                            <SaveIcon className="w-4 h-4 mr-2" />
                            { isSaving ? 'Saving...' : 'Save Grid' }
                        </button>
                        <button onClick={() => setIsExportModalOpen(true)} className="btn-secondary" disabled={!scheduleHtml}>
                            <Download className="w-4 h-4 mr-2" />
                            Export
                        </button>
                    </div>
                </div>
            </div>

            <div className="university-card mt-6">
                <div className="university-card-content">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-baylor-green">Saved Grids</h3>
                        <button onClick={fetchSavedGrids} className="btn-secondary">Refresh</button>
                    </div>
                    {isLoadingSaved ? (
                        <div className="text-gray-500">Loading...</div>
                    ) : savedGrids.length === 0 ? (
                        <div className="text-gray-500">No saved grids yet.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-600">
                                        <th className="py-2 pr-4">Title</th>
                                        <th className="py-2 pr-4">Building</th>
                                        <th className="py-2 pr-4">Room</th>
                                        <th className="py-2 pr-4">View</th>
                                        <th className="py-2 pr-4">Semester</th>
                                        <th className="py-2">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {savedGrids.map(g => (
                                        <tr key={g.id} className="border-t border-gray-200">
                                            <td className="py-2 pr-4">{g.title}</td>
                                            <td className="py-2 pr-4">{g.building}</td>
                                            <td className="py-2 pr-4">{g.room}</td>
                                            <td className="py-2 pr-4">{g.dayType}</td>
                                            <td className="py-2 pr-4">{g.semester}</td>
                                            <td className="py-2 space-x-2">
                                                <button onClick={() => loadGrid(g)} className="btn-secondary">Load</button>
                                                <button onClick={() => deleteSavedGrid(g)} className="btn-danger">Delete</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <ExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                scheduleTableRef={printRef}
                title={`${selectedBuilding}-${selectedRoom}-${selectedDayType}-${semester}`}
            />

            <div className="university-card mt-8">
                <div className="university-card-content min-h-[400px]">
                     {isProcessing ? (
                        <div className="text-center text-gray-500 flex flex-col items-center justify-center h-full">
                            <p>Processing file...</p>
                        </div>
                     ) : !scheduleHtml ? (
                        <div className="text-center text-gray-500 flex flex-col items-center justify-center h-full">
                           <FileText className="w-16 h-16 text-gray-300 mb-4" />
                           <p>Your generated schedule will appear here. You can click on fields to edit them before printing.</p>
                       </div>
                    ) : (
                        <div ref={printRef} dangerouslySetInnerHTML={{ __html: scheduleHtml }}></div>
                    )}
                </div>
            </div>
            <style>{`
                /* Baylor brand palette */
                .schedule-sheet { 
                    --baylor-green: #154734; 
                    --baylor-gold: #FFB81C; 
                    background: #ffffff; 
                    width: 7in; 
                    min-height: 5in; 
                    margin: 0 auto; 
                    padding: 0.4in; 
                    border: 1px solid #e5e7eb; 
                    border-radius: 10px; 
                    box-shadow: 0 10px 30px rgba(0,0,0,0.08);
                }
                .schedule-table {
                    border-collapse: collapse;
                    width: 100%;
                    font-size: 12px;
                    color: #111827;
                }
                .schedule-table th, .schedule-table td {
                    border: 1px solid #e5e7eb;
                    padding: 10px;
                    text-align: left;
                    vertical-align: top;
                }
                .schedule-table thead th {
                    background-color: var(--baylor-green);
                    color: #ffffff;
                    text-align: center;
                    border-bottom: 3px solid var(--baylor-gold);
                    padding-top: 14px;
                    padding-bottom: 14px;
                }
                .schedule-table thead .text-2xl {
                    font-size: 18px;
                    letter-spacing: 0.5px;
                }
                .schedule-table thead .text-lg {
                    font-size: 13px;
                    opacity: 0.95;
                }
                .schedule-table thead .text-md {
                    font-size: 12px;
                    opacity: 0.9;
                }
                .time-slot {
                    font-weight: 700;
                    width: 1.15in;
                    background-color: #f6f9f6;
                    color: var(--baylor-green);
                    text-align: center;
                }
                .class-entry {
                    font-weight: 700;
                    color: var(--baylor-green);
                }
                .prof-entry {
                    font-size: 11px;
                    color: #374151;
                }
                .schedule-table hr {
                    border: 0;
                    border-top: 1px solid #e5e7eb;
                    margin: 6px 0;
                }
                [contenteditable="true"] {
                    cursor: pointer;
                }
                [contenteditable="true"]:hover {
                    background-color: rgba(21,71,52,0.05);
                }
                [contenteditable="true"]:focus {
                    outline: 2px solid #3b82f6;
                    background-color: #eff6ff;
                    border-radius: 2px;
                }
                @media print {
                    @page { size:7in 5in; margin: 0.25in; }
                    .schedule-sheet { 
                        -webkit-print-color-adjust: exact; 
                        print-color-adjust: exact; 
                        box-shadow: none; 
                        border-radius: 0; 
                        border: none;
                        width: auto; 
                        min-height: auto; 
                        padding: 0; 
                        margin: 0 auto;
                    }
                    .schedule-table { font-size: 10pt; }
                    .schedule-table th, .schedule-table td { padding: 8pt; }
                }
 
                 /* Weekly grid layout */
                .weekly-sheet { padding: 0.4in; padding-top: 0; }
                .weekly-header {
                    background-color: var(--baylor-green);
                    color: #ffffff;
                    text-align: center;
                    border-bottom: 3px solid var(--baylor-gold);
                    padding: 14px;
                    margin: 0 -0.4in 10px -0.4in;
                    position: relative;
                }
                .weekly-header .header-left { display: table; margin: 0 auto; }
                .weekly-header .header-actions { position: absolute; right: 12px; top: 12px; display: flex; align-items: center; gap: 8px; }
                .weekly-add-form { background: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid var(--baylor-green); padding: 8px 10px; margin: 8px 0; border-radius: 6px; }
                .inline-form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
                .inline-form label { font-size: 12px; color: #374151; }
                .inline-input { border: 1px solid #d1d5db; border-radius: 4px; padding: 4px 6px; font-size: 12px; }
                .inline-btn { padding: 4px 8px; font-size: 12px; }
                .weekly-header .text-2xl { font-size: 18px; letter-spacing: 0.5px; }
                .weekly-header .text-md { font-size: 12px; opacity: 0.9; }
                .weekly-grid { 
                    display: grid; 
                    grid-template-columns: 0.75in repeat(5, 1fr);
                    grid-template-rows: auto repeat(var(--rows), var(--rowHeight));
                    position: relative; 
                    gap: 0; 
                    border: 1px solid #e5e7eb;
                }
                .weekly-grid .day-header {
                    position: sticky; top: 0; z-index: 2;
                    grid-row: 1;
                    background: var(--baylor-green);
                    color: #fff;
                    font-size: 12px;
                    font-weight: 700;
                    text-align: center;
                    padding: 8px 4px;
                    border-bottom: 2px solid var(--baylor-gold);
                }
                .weekly-grid .hour-label { 
                    font-weight: 700; 
                    font-size: 11px;
                    color: var(--baylor-green); 
                    display: flex; 
                    align-items: flex-start; 
                    justify-content: center; 
                    text-align: center;
                    padding: 4px 2px; 
                    border-top: 1px solid #e5e7eb; 
                    border-right: 1px solid #e5e7eb;
                    background: #f7faf7; 
                }
                .weekly-grid .hour-line { 
                    border-top: 1px solid #e5e7eb; 
                }
                .weekly-grid .class-block { 
                    background-color: #f0fff0;
                    border: 1px solid var(--baylor-green);
                    border-left: 3px solid var(--baylor-green);
                    border-radius: 4px;
                    padding: 3px 5px; 
                    margin: 1px 2px; 
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                    display: flex; 
                    flex-direction: column; 
                    justify-content: center;
                    gap: 1px; 
                    overflow: hidden;
                    word-break: break-word;
                    font-size: 11px;
                    position: relative;
                }
                .weekly-grid .class-title { font-weight: 700; color: var(--baylor-green); font-size: 11px; line-height: 1.2; }
                .weekly-grid .class-instructor { font-size: 10px; color: #374151; line-height: 1.2; }
                .weekly-grid .class-time { font-size: 9px; color: #111827; line-height: 1.2; }

                /* Editing helpers */
                .slot-toolbar { display: flex; justify-content: flex-end; }
                .slot-add-btn { background: #e5efe9; color: var(--baylor-green); border: 1px solid #c7d7cf; border-radius: 4px; padding: 2px 6px; font-size: 11px; cursor: pointer; }
                .class-list { display: flex; flex-direction: column; gap: 6px; }
                .class-entry-wrapper { position: relative; padding-right: 18px; }
                .delete-entry-btn { position: absolute; top: 0; right: 0; background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; width: 16px; height: 16px; line-height: 14px; text-align: center; border-radius: 4px; cursor: pointer; font-size: 12px; }
                .delete-block-btn { top: 4px; right: 4px; }
                .weekly-add-form {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                    margin-top: 10px;
                    padding: 10px;
                    background-color: #f0fff0;
                    border: 1px solid var(--baylor-green);
                    border-radius: 4px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }
                .weekly-add-form .inline-form {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }
                .weekly-add-form .inline-form label {
                    font-size: 11px;
                    color: #374151;
                    font-weight: 600;
                }
                .weekly-add-form .inline-input {
                    padding: 4px 8px;
                    border: 1px solid #c7d7cf;
                    border-radius: 4px;
                    font-size: 11px;
                    color: #111827;
                    flex: 1;
                }
                .weekly-add-form .inline-btn {
                    padding: 4px 10px;
                    font-size: 11px;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .weekly-add-form .btn-primary { background: #e5efe9; color: var(--baylor-green); border: 1px solid #c7d7cf; }
                .weekly-add-form .btn-secondary { background: #f0fff0; color: var(--baylor-green); border: 1px solid #c7d7cf; }
                @media print {
                  .export-ignore { display: none !important; }
                }
            `}</style>
        </div>
    );
};

export default RoomGridGenerator;
