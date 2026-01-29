import React, { forwardRef, useMemo } from 'react';

/**
 * ExportableRoomSchedule - A clean, export-optimized weekly room schedule
 * Designed specifically for 7x5 inch door tags with maximum readability
 *
 * Design principles:
 * - Time-based visual layout: Classes positioned by their actual times
 * - Quick glanceability: Cleaning crews can see at a glance when rooms are occupied
 * - Clean typography: Large, readable text with clear hierarchy
 * - Professional appearance: Baylor brand compliant
 */
const ExportableRoomSchedule = forwardRef(({
    spaceLabel,
    buildingName,
    semester,
    classes = [],
    exportName
}, ref) => {
    const days = ['M', 'T', 'W', 'R', 'F'];
    const dayLabels = { M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri' };

    // Parse time string to minutes for positioning
    const parseTime = (timeStr) => {
        if (!timeStr) return null;
        const cleaned = timeStr.toLowerCase().trim();
        const match = cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
        if (!match) return null;
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10) || 0;
        const modifier = match[3] || 'am';
        if (modifier === 'pm' && hours < 12) hours += 12;
        if (modifier === 'am' && hours === 12) hours = 0;
        return hours * 60 + minutes;
    };

    // Format minutes to time string
    const formatTime = (minutes) => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        const period = h >= 12 ? 'PM' : 'AM';
        let hour = h % 12;
        if (hour === 0) hour = 12;
        if (m === 0) return `${hour}${period}`;
        return `${hour}:${m.toString().padStart(2, '0')}${period}`;
    };

    // Parse days from pattern string
    const parseDays = (daysStr) => {
        const str = (daysStr || '').replace(/\s/g, '').toUpperCase();
        if (!str) return [];

        if (/MWF/.test(str)) return ['M', 'W', 'F'];
        if (/TTH|TR/.test(str)) return ['T', 'R'];

        const chars = [];
        if (/M/.test(str)) chars.push('M');
        if (/T(?!H)|TU/.test(str) || (str === 'T')) chars.push('T');
        if (/W/.test(str)) chars.push('W');
        if (/TH|(?<![A-Z])R(?![A-Z])/.test(str)) chars.push('R');
        if (/F/.test(str)) chars.push('F');

        return [...new Set(chars)];
    };

    // Extract start/end times from time range
    const parseTimeRange = (timeRange) => {
        if (!timeRange) return { start: null, end: null };
        const parts = timeRange.split('-');
        const startStr = parts[0]?.trim() || '';
        const endStr = parts[1]?.trim() || parts[0]?.trim() || '';

        // Handle case where start time doesn't have am/pm but end does
        let start = parseTime(startStr);
        let end = parseTime(endStr);

        // If start doesn't have am/pm indicator, infer from end
        if (start !== null && end !== null && !startStr.match(/am|pm/i) && endStr.match(/am|pm/i)) {
            const endMod = endStr.match(/am|pm/i)[0].toLowerCase();
            // Re-parse with the modifier
            start = parseTime(startStr + endMod);
        }

        return { start, end };
    };

    // Calculate time range for the grid
    const { timeRange, classesByDay } = useMemo(() => {
        let earliest = 8 * 60;  // 8 AM default
        let latest = 17 * 60;   // 5 PM default

        const byDay = {};
        days.forEach(day => { byDay[day] = []; });

        classes.forEach(cls => {
            const { start, end } = parseTimeRange(cls.time);
            if (start === null || end === null) return;

            earliest = Math.min(earliest, start);
            latest = Math.max(latest, end);

            const classDays = parseDays(cls.days);
            classDays.forEach(day => {
                if (byDay[day]) {
                    byDay[day].push({
                        ...cls,
                        startMinutes: start,
                        endMinutes: end,
                    });
                }
            });
        });

        // Round to nearest hour for cleaner display
        earliest = Math.floor(earliest / 60) * 60;
        latest = Math.ceil(latest / 60) * 60;

        // Sort each day's classes by start time
        days.forEach(day => {
            byDay[day].sort((a, b) => a.startMinutes - b.startMinutes);
        });

        return {
            timeRange: { start: earliest, end: latest },
            classesByDay: byDay
        };
    }, [classes]);

    const totalMinutes = timeRange.end - timeRange.start;

    // Generate hour labels
    const hourLabels = useMemo(() => {
        const labels = [];
        for (let m = timeRange.start; m <= timeRange.end; m += 60) {
            labels.push(m);
        }
        return labels;
    }, [timeRange]);

    // Clean up room display
    const displayRoom = spaceLabel || '';
    const displayBuilding = (buildingName || '').replace(' Bldg', '').replace(' Building', '');
    const resolvedExportName = exportName || [buildingName, spaceLabel, 'WEEK', semester].filter(Boolean).join(' ');

    // Baylor brand colors
    const colors = {
        baylorGreen: '#154734',
        baylorGold: '#FFB81C',
        white: '#ffffff',
        classBlock: '#c8e6c9',
        classBlockBorder: '#154734',
        lightGray: '#f5f5f5',
        gridLine: '#d1d5db', // Darker for better visibility
        textStrong: '#111827',
        textMuted: '#374151',
        textLight: '#6b7280',
    };

    // Calculate position for a class block
    const getBlockStyle = (startMinutes, endMinutes) => {
        const top = ((startMinutes - timeRange.start) / totalMinutes) * 100;
        const height = ((endMinutes - startMinutes) / totalMinutes) * 100;
        return {
            position: 'absolute',
            top: `${top}%`,
            height: `${height}%`,
            left: '2px',
            right: '2px',
        };
    };

    // Determine if we need compact text (many classes or short time slots)
    const avgDuration = useMemo(() => {
        let total = 0, count = 0;
        Object.values(classesByDay).forEach(dayClasses => {
            dayClasses.forEach(cls => {
                total += (cls.endMinutes - cls.startMinutes);
                count++;
            });
        });
        return count > 0 ? total / count : 50;
    }, [classesByDay]);

    const isCompact = avgDuration < 55 || totalMinutes > 600;

    return (
        <div
            ref={ref}
            className="exportable-room-schedule"
            data-export-name={resolvedExportName}
            style={{
                width: '7in',
                height: '5in',
                backgroundColor: colors.white,
                fontFamily: '"calluna", Georgia, "Times New Roman", serif',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                overflow: 'hidden',
            }}
        >
            <style>{`
                @media print {
                    @page {
                        size: portrait;
                        margin: 0;
                    }
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                }
            `}</style>
            {/* Header */}
            <div style={{
                backgroundColor: colors.baylorGreen,
                color: colors.white,
                padding: '10px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: `4px solid ${colors.baylorGold}`,
                flexShrink: 0,
                overflow: 'hidden', // Prevent bleed
            }}>
                <div style={{ flex: 1, minWidth: 0, paddingRight: '10px' }}>
                    <div style={{
                        fontSize: '20px', // Slightly smaller to fit more
                        fontWeight: '700',
                        letterSpacing: '0.5px',
                        lineHeight: '1.2',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}>
                        {displayBuilding} {displayRoom}
                    </div>
                </div>
                <div style={{
                    textAlign: 'right',
                    fontSize: '13px',
                    fontWeight: '600',
                }}>
                    {semester}
                </div>
            </div>

            {/* Schedule Grid */}
            <div style={{
                flex: 1,
                display: 'flex',
                minHeight: 0,
                padding: '8px 8px 6px 8px',
            }}>
                {/* Time column */}
                <div style={{
                    width: '42px',
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    paddingTop: '24px', // Align with day headers
                    position: 'relative',
                }}>
                    {hourLabels.map((minutes, idx) => {
                        const top = ((minutes - timeRange.start) / totalMinutes) * 100;
                        return (
                            <div
                                key={minutes}
                                style={{
                                    position: 'absolute',
                                    top: `${top}%`,
                                    right: '4px',
                                    transform: 'translateY(-50%)',
                                    fontSize: '9px',
                                    fontWeight: '600',
                                    color: colors.baylorGreen,
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {formatTime(minutes)}
                            </div>
                        );
                    })}
                </div>

                {/* Days grid */}
                <div style={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: '4px',
                }}>
                    {days.map(day => (
                        <div
                            key={day}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                minWidth: 0,
                            }}
                        >
                            {/* Day header */}
                            <div style={{
                                backgroundColor: colors.baylorGreen,
                                color: colors.white,
                                textAlign: 'center',
                                padding: '4px 2px',
                                fontSize: '11px',
                                fontWeight: '700',
                                borderRadius: '3px 3px 0 0',
                                letterSpacing: '0.3px',
                                flexShrink: 0,
                            }}>
                                {dayLabels[day]}
                            </div>

                            {/* Time slots area */}
                            <div style={{
                                flex: 1,
                                position: 'relative',
                                backgroundColor: colors.lightGray,
                                borderLeft: `1px solid ${colors.gridLine}`,
                                borderRight: `1px solid ${colors.gridLine}`,
                                borderBottom: `1px solid ${colors.gridLine}`,
                                borderRadius: '0 0 3px 3px',
                            }}>
                                {/* Hour grid lines */}
                                {hourLabels.map((minutes, idx) => {
                                    if (idx === 0) return null;
                                    const top = ((minutes - timeRange.start) / totalMinutes) * 100;
                                    return (
                                        <div
                                            key={`line-${minutes}`}
                                            style={{
                                                position: 'absolute',
                                                top: `${top}%`,
                                                left: 0,
                                                right: 0,
                                                borderTop: `1px dashed ${colors.gridLine}`,
                                            }}
                                        />
                                    );
                                })}

                                {/* Class blocks */}
                                {classesByDay[day].map((cls, idx) => (
                                    <div
                                        key={`${day}-${idx}`}
                                        style={{
                                            ...getBlockStyle(cls.startMinutes, cls.endMinutes),
                                            backgroundColor: colors.classBlock,
                                            border: `1px solid ${colors.classBlockBorder}`,
                                            borderLeft: `3px solid ${colors.classBlockBorder}`,
                                            borderRadius: '2px',
                                            padding: isCompact ? '1px 3px' : '2px 4px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'center',
                                            overflow: 'hidden',
                                            boxSizing: 'border-box',
                                        }}
                                    >
                                        {/* Course code */}
                                        <div style={{
                                            fontSize: isCompact ? '10px' : '12px', // Increased from 9/10
                                            fontWeight: '800',
                                            color: colors.baylorGreen,
                                            lineHeight: '1.1',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            textAlign: 'center',
                                        }}>
                                            {cls.class}{cls.section ? `.${cls.section}` : ''}
                                        </div>
                                        {/* Time range - lower threshold for visibility */}
                                        {(cls.endMinutes - cls.startMinutes) >= 30 && (
                                            <div style={{
                                                fontSize: '8px', // Increased from 7
                                                color: colors.textMuted,
                                                textAlign: 'center',
                                                lineHeight: '1.1',
                                                marginTop: '1px',
                                                fontWeight: '500',
                                            }}>
                                                {formatTime(cls.startMinutes)}-{formatTime(cls.endMinutes)}
                                            </div>
                                        )}
                                        {/* Instructor - lower threshold for visibility */}
                                        {!isCompact && (cls.endMinutes - cls.startMinutes) >= 50 && cls.professor && (
                                            <div style={{
                                                fontSize: '8px', // Increased from 7
                                                color: colors.textLight,
                                                textAlign: 'center',
                                                lineHeight: '1.1',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                marginTop: '1px',
                                            }}>
                                                {cls.professor}
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {/* Empty state */}
                                {classesByDay[day].length === 0 && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '50%',
                                        left: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        color: '#bbb',
                                        fontSize: '9px',
                                        fontStyle: 'italic',
                                    }}>
                                        No classes
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div style={{
                backgroundColor: '#f3f4f6',
                borderTop: '1px solid #e5e7eb',
                padding: '4px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '8px',
                color: colors.textLight,
                flexShrink: 0,
            }}>
                <span style={{ fontWeight: '500' }}>Baylor University</span>
                <span>Human Sciences & Design</span>
            </div>
        </div>
    );
});

ExportableRoomSchedule.displayName = 'ExportableRoomSchedule';

export default ExportableRoomSchedule;
