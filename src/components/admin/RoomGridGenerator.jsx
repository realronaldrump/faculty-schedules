import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { Upload, X, Trash2, FileText, Download } from 'lucide-react';
import ExportModal from './ExportModal';


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
            skipEmptyLines: true,
            beforeFirstChunk: (chunk) => {
                const lines = chunk.split(/\r\n|\n|\r/);
                const headerIndex = lines.findIndex(line => line.includes('"CLSS ID","CRN","Term"'));
                
                if (headerIndex === -1) {
                    console.error("Could not find the header row in the CSV file.");
                    return "";
                }

                const header = lines[headerIndex];
                const dataLines = lines.slice(headerIndex + 1);
                const filteredDataLines = dataLines.filter(line => line.trim().startsWith(','));
                return [header, ...filteredDataLines].join('\n');
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
        const processedClassData = data.flatMap(row => {
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
                    
                    const patternParts = patternString.split(' ');
                    const days = patternParts[0];
                    const time = patternParts.slice(1).join(' ');

                    if (!buildingName || !roomNumber || !days || !time) return null;

                    return { ...baseInfo, building: buildingName, room: roomNumber, days: days, time: time };
                }).filter(Boolean);

            } catch (e) {
                console.warn("Could not process row:", row, "Error:", e);
                return [];
            }
        });

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

        const dayChars = selectedDayType === 'MWF' ? ['M', 'W', 'F'] : ['T', 'R'];
        const relevantClasses = allClassData.filter(c =>
            c.building === selectedBuilding &&
            c.room === selectedRoom &&
            dayChars.some(day => c.days.includes(day))
        );

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
                let isFullPattern = false;
                if (selectedDayType === 'MWF') {
                    if (c.days === 'MWF') isFullPattern = true;
                } else { // TR
                    if (c.days === 'TTh' || c.days === 'TR') isFullPattern = true;
                }
                if (!isFullPattern) {
                    daysIndicator = ` (${c.days})`;
                }
                return `<div class="class-entry" contenteditable="true">${c.class}.${c.section}${daysIndicator}</div>
                        <div class="prof-entry" contenteditable="true">${c.professor}</div>`;
            }).join('<hr class="my-1 border-t border-gray-300">') : '';

            return `
                <tr>
                    <td class="time-slot">${slot.replace(/ am/g, '').replace(/ pm/g, '')}</td>
                    <td>${classContent}</td>
                </tr>
            `;
        }).join('');

        setScheduleHtml(`
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
        `);
        showMessage("Schedule generated. Click on fields to edit before printing.", 'success');
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
                            <label htmlFor="dayTypeSelect" className="block text-sm font-medium text-gray-700 mb-1">5. Select Day Type</label>
                            <select id="dayTypeSelect" value={selectedDayType} onChange={e => setSelectedDayType(e.target.value)} className="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" disabled={Object.keys(buildings).length === 0}>
                                <option value="MWF">MWF</option>
                                <option value="TR">TR</option>
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
                        <button onClick={() => setIsExportModalOpen(true)} className="btn-secondary" disabled={!scheduleHtml}>
                            <Download className="w-4 h-4 mr-2" />
                            Export
                        </button>
                    </div>
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
                .schedule-table {
                    border-collapse: collapse;
                    width: 100%;
                    font-size: 12px;
                }
                .schedule-table th, .schedule-table td {
                    border: 1px solid #000;
                    padding: 8px;
                    text-align: center;
                    vertical-align: top;
                    height: 50px;
                }
                .schedule-table th {
                    background-color: #f2f2f2;
                }
                .time-slot {
                    font-weight: bold;
                    width: 100px;
                }
                .class-entry {
                    font-weight: bold;
                }
                .prof-entry {
                    font-size: 11px;
                    color: #333;
                }
                [contenteditable="true"] {
                    cursor: pointer;
                }
                [contenteditable="true"]:hover {
                    background-color: #f0f9ff;
                }
                [contenteditable="true"]:focus {
                    outline: 2px solid #3b82f6;
                    background-color: #eff6ff;
                    border-radius: 2px;
                }
                @media print {
                    .schedule-table {
                        font-size: 10pt;
                    }
                     .schedule-table th, .schedule-table td {
                        padding: 6px;
                    }
                }
            `}</style>
        </div>
    );
};

export default RoomGridGenerator;
