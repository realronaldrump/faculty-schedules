/**
 * useScheduleOperations - Hook for schedule CRUD operations
 *
 * This hook encapsulates all schedule-related business logic that was previously
 * in App.jsx, including create, update, and delete operations.
 */

import { useCallback, useMemo } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, deleteDoc, setDoc, collection, deleteField } from 'firebase/firestore';
import { parseCourseCode } from '../utils/courseUtils';
import { buildPeopleIndex } from '../utils/peopleUtils';
import { getInstructorDisplayName, UNASSIGNED } from '../utils/dataAdapter';
import { logCreate, logUpdate, logDelete } from '../utils/changeLogger';
import { useData } from '../contexts/DataContext';
import { useSchedules } from '../contexts/ScheduleContext';
import { useUI } from '../contexts/UIContext';
import { useAuth } from '../contexts/AuthContext';
import { normalizeTermLabel, termCodeFromLabel } from '../utils/termUtils';

const useScheduleOperations = () => {
  const {
    rawScheduleData,
    rawPeople,
    allPeople,
    peopleIndex,
    canCreateSchedule,
    canEditSchedule,
    canDeleteSchedule
  } = useData();
  const { refreshSchedules, selectedSemester, isTermLocked } = useSchedules();

  const { showNotification } = useUI();
  const { isAdmin } = useAuth();

  const resolvedPeopleIndex = useMemo(() => (
    peopleIndex || buildPeopleIndex(allPeople || rawPeople)
  ), [peopleIndex, allPeople, rawPeople]);
  const peopleMap = useMemo(() => resolvedPeopleIndex.peopleMap || new Map(), [resolvedPeopleIndex]);

  // Handle schedule update/create
  const handleDataUpdate = useCallback(async (updatedRow) => {
    const isNewSchedule = updatedRow.id && updatedRow.id.startsWith('new_');
    const hasPermission = isNewSchedule ? (canCreateSchedule?.() || false) : (canEditSchedule?.() || false);

    if (!hasPermission) {
      const actionName = isNewSchedule ? 'create' : 'modify';
      showNotification('warning', 'Permission Denied', `You don't have permission to ${actionName} schedules.`);
      return;
    }

    console.log('💾 Updating schedule data:', updatedRow);

    try {
      const isNewCourse = updatedRow.id && updatedRow.id.startsWith('new_');
      const isGroupedCourse = updatedRow.id && updatedRow.id.startsWith('grouped::');
      let scheduleRef;
      let originalSchedule = null;
      let originalSchedules = [];

      if (isNewCourse) {
        console.log('🆕 Creating new course entry');
        scheduleRef = doc(collection(db, 'schedules'));
      } else if (isGroupedCourse) {
        console.log('🔄 Updating grouped course entry');
        const idParts = updatedRow.id.split('::');
        const originalIds = idParts.slice(2);

        originalSchedules = rawScheduleData.filter(s => originalIds.includes(s.id));
        if (originalSchedules.length === 0) {
          console.error('❌ No original schedules found for grouped update');
          showNotification('error', 'Update Failed', 'Original schedules not found for grouped course.');
          return;
        }
        console.log(`📋 Found ${originalSchedules.length} original schedules for grouped course`);
      } else {
        const effectiveId = updatedRow._originalId || updatedRow.id;
        originalSchedule = rawScheduleData.find(s => s.id === effectiveId);
        if (!originalSchedule) {
          console.error('❌ Original schedule not found for update');
          showNotification('error', 'Update Failed', 'Original schedule not found.');
          return;
        }
        scheduleRef = doc(db, 'schedules', effectiveId);
      }

      // Resolve instructor reference by ID (strict matching)
      let instructorId = null;
      if (updatedRow.instructorId) {
        const resolvedId = resolvedPeopleIndex.resolvePersonId
          ? resolvedPeopleIndex.resolvePersonId(updatedRow.instructorId)
          : updatedRow.instructorId;
        const instructor = resolvedId ? peopleMap.get(resolvedId) : null;
        if (instructor) {
          instructorId = instructor.id;
        }
      }
      // Fallback to exact name match
      if (!instructorId && updatedRow.Instructor && updatedRow.Instructor !== 'Staff') {
        const instructor = rawPeople.find(person => person.name === updatedRow.Instructor);
        if (instructor) {
          instructorId = instructor.id;
        } else {
          console.warn('⚠️ Instructor not found in people collection:', updatedRow.Instructor);
        }
      }

      const referenceSchedule = isGroupedCourse ? originalSchedules[0] : originalSchedule;
      const instructorRecord = instructorId ? rawPeople.find(p => p.id === instructorId) : null;
      const fallbackInstructorName = (updatedRow.Instructor || referenceSchedule?.instructorName || '').trim();
      const instructorDisplayName = instructorRecord
        ? getInstructorDisplayName(instructorRecord)
        : (fallbackInstructorName || UNASSIGNED);

      const baseInstructorIds = Array.isArray(referenceSchedule?.instructorIds)
        ? referenceSchedule.instructorIds
        : (referenceSchedule?.instructorId ? [referenceSchedule.instructorId] : []);
      const baseAssignments = Array.isArray(referenceSchedule?.instructorAssignments)
        ? referenceSchedule.instructorAssignments
        : [];
      const isTeamTaught = baseAssignments.length > 1 || baseInstructorIds.length > 1;
      const assignmentMap = new Map();

      if (isTeamTaught) {
        baseAssignments.forEach((assignment) => {
          const resolvedId = assignment?.personId || assignment?.instructorId || assignment?.id;
          if (!resolvedId) return;
          assignmentMap.set(resolvedId, { ...assignment, personId: resolvedId });
        });
        if (assignmentMap.size === 0 && baseInstructorIds.length > 0) {
          baseInstructorIds.forEach((id, index) => {
            assignmentMap.set(id, { personId: id, isPrimary: index === 0, percentage: 100 });
          });
        }
      }

      if (instructorId) {
        if (!isTeamTaught) assignmentMap.clear();
        const existing = assignmentMap.get(instructorId);
        assignmentMap.set(instructorId, {
          personId: instructorId,
          isPrimary: true,
          percentage: existing?.percentage ?? 100,
          ...existing
        });
      }

      const instructorAssignments = Array.from(assignmentMap.values());
      if (instructorAssignments.length > 0 && !instructorAssignments.some((assignment) => assignment.isPrimary)) {
        instructorAssignments[0].isPrimary = true;
      }
      const primaryAssignment = instructorAssignments.find((assignment) => assignment.isPrimary) || instructorAssignments[0] || null;
      const primaryInstructorId = primaryAssignment?.personId || instructorId || null;
      const instructorIds = Array.from(new Set([
        ...baseInstructorIds,
        ...(primaryInstructorId ? [primaryInstructorId] : []),
        ...instructorAssignments.map((assignment) => assignment.personId)
      ])).filter(Boolean);

      // Create meeting patterns
      const meetingPatterns = [];
      const isOnlineFlag = updatedRow.isOnline === true || String(updatedRow.isOnline).toLowerCase() === 'true';
      const onlineMode = updatedRow.onlineMode || (referenceSchedule?.onlineMode || null);

      if (updatedRow.Day && updatedRow['Start Time'] && updatedRow['End Time']) {
        const dayCodes = typeof updatedRow.Day === 'string' ? updatedRow.Day.match(/[MTWRF]/g) : [];
        (dayCodes && dayCodes.length > 0 ? dayCodes : [updatedRow.Day]).forEach(code => {
          if (!code) return;
          meetingPatterns.push({
            day: code,
            startTime: updatedRow['Start Time'],
            endTime: updatedRow['End Time']
          });
        });
      }

      // Parse course code
      const courseCode = updatedRow.Course || (referenceSchedule?.courseCode || '');
      const parsedCourse = parseCourseCode(courseCode);
      const parsedProgram = parsedCourse.error ? '' : (parsedCourse.program || '');
      const subjectCodeRaw = parsedProgram || referenceSchedule?.subjectCode || referenceSchedule?.program || '';
      const subjectCode = subjectCodeRaw ? subjectCodeRaw.toString().toUpperCase() : '';
      const catalogNumber = parsedCourse.catalogNumber || referenceSchedule?.catalogNumber || courseCode.replace(/^[A-Z]{2,4}\s?/, '').toUpperCase();
      const derivedCredits = parsedCourse.error ? null : parsedCourse.credits;
      const computedCredits = derivedCredits ?? referenceSchedule?.credits ?? 0;
      const normalizedTerm = normalizeTermLabel(
        updatedRow.Term ||
        referenceSchedule?.term ||
        originalSchedules[0]?.term ||
        selectedSemester ||
        ''
      );
      if (normalizedTerm && isTermLocked?.(normalizedTerm) && !isAdmin) {
        showNotification('warning', 'Term Locked', `Schedules for ${normalizedTerm} are archived or locked. Editing is disabled.`);
        return;
      }
      const resolvedTermCode = termCodeFromLabel(updatedRow.termCode || referenceSchedule?.termCode || normalizedTerm);

      const scheduleTypeValue = updatedRow['Schedule Type'] || (referenceSchedule?.scheduleType || 'Class Instruction');
      const roomInput = Array.isArray(updatedRow.Rooms)
        ? updatedRow.Rooms
        : (updatedRow.Room || (referenceSchedule?.roomName || ''));
      const roomNames = Array.isArray(roomInput)
        ? roomInput.map(name => String(name || '').trim()).filter(Boolean)
        : String(roomInput || '')
          .split(';')
          .map(name => name.trim())
          .filter(Boolean);
      const hasRoomlessLabel = roomNames.some((name) => {
        const upper = name.toUpperCase();
        return upper === 'NO ROOM NEEDED' || upper.includes('ONLINE');
      });
      const treatAsNoRoom = isOnlineFlag || hasRoomlessLabel || /independent/i.test(String(scheduleTypeValue));
      const filteredRoomNames = treatAsNoRoom
        ? []
        : roomNames.filter((name) => {
          const upper = name.toUpperCase();
          return upper !== 'NO ROOM NEEDED' && !upper.includes('ONLINE');
        });
      const existingRoomNames = Array.isArray(referenceSchedule?.roomNames)
        ? referenceSchedule.roomNames
        : (referenceSchedule?.roomName ? [referenceSchedule.roomName] : []);
      const normalizedExisting = existingRoomNames.map((name) => String(name || '').toLowerCase()).sort();
      const normalizedNext = filteredRoomNames.map((name) => String(name || '').toLowerCase()).sort();
      const roomsMatch = normalizedExisting.length > 0
        && normalizedExisting.length === normalizedNext.length
        && normalizedExisting.every((value, idx) => value === normalizedNext[idx]);
      const existingRoomIds = Array.isArray(referenceSchedule?.roomIds)
        ? referenceSchedule.roomIds
        : (referenceSchedule?.roomId ? [referenceSchedule.roomId] : []);
      const roomIds = treatAsNoRoom ? [] : (roomsMatch ? existingRoomIds : []);
      const roomId = roomIds[0] || null;

      const updateData = {
        courseCode: courseCode,
        courseTitle: updatedRow['Course Title'] || (referenceSchedule?.courseTitle || ''),
        program: subjectCode || parsedProgram,
        subjectCode,
        subject: subjectCode,
        catalogNumber,
        courseLevel: parsedCourse.level,
        section: updatedRow.Section || (referenceSchedule?.section || ''),
        crn: updatedRow.CRN || (referenceSchedule?.crn || ''),
        term: normalizedTerm || (updatedRow.Term || (referenceSchedule?.term || '')),
        termCode: resolvedTermCode || '',
        credits: computedCredits,
        scheduleType: scheduleTypeValue,
        instructionMethod: updatedRow['Instruction Method'] || updatedRow['Inst. Method'] || referenceSchedule?.instructionMethod || '',
        status: updatedRow.Status || (referenceSchedule?.status || 'Active'),
        instructorId: primaryInstructorId,
        instructorIds,
        instructorAssignments,
        locationType: treatAsNoRoom ? 'no_room' : 'room',
        locationLabel: treatAsNoRoom ? 'No Room Needed' : '',
        roomIds,
        roomId,
        roomNames: filteredRoomNames,
        roomName: treatAsNoRoom ? '' : (filteredRoomNames[0] || ''),
        meetingPatterns: meetingPatterns.length > 0 ? meetingPatterns : (referenceSchedule?.meetingPatterns || []),
        isOnline: isOnlineFlag,
        onlineMode: isOnlineFlag ? (onlineMode || (meetingPatterns.length > 0 ? 'synchronous' : 'asynchronous')) : null,
        updatedAt: new Date().toISOString(),
        ...(isNewCourse && { createdAt: new Date().toISOString() })
      };
      const updatePayload = {
        ...updateData,
        instructorName: deleteField()
      };

      // Validation
      const validationErrors = [];
      if (!updateData.courseCode) validationErrors.push('Course code is required');
      if (!updateData.term) validationErrors.push('Term is required');
      if (!updateData.section) validationErrors.push('Section is required');

      const requiresMeeting = (!isOnlineFlag) || (isOnlineFlag && ((onlineMode || '').toLowerCase() === 'synchronous'));
      const hasExistingOrNewMeetings = (meetingPatterns.length > 0) || (Array.isArray(referenceSchedule?.meetingPatterns) && referenceSchedule.meetingPatterns.length > 0);
      if (requiresMeeting && !hasExistingOrNewMeetings) {
        validationErrors.push('Meeting time and day are required');
      }

      if (validationErrors.length > 0) {
        showNotification('error', 'Validation Failed', validationErrors.join('\n'));
        return;
      }

      // Save to Firebase
      if (isNewCourse) {
        await setDoc(scheduleRef, updateData);
        await logCreate(
          `Schedule - ${updateData.courseCode} ${updateData.section} (${instructorDisplayName})`,
          'schedules',
          scheduleRef.id,
          updateData,
          'useScheduleOperations - handleDataUpdate'
        );
      } else if (isGroupedCourse) {
        console.log('🔄 Updating grouped course schedules...');
        const dayCodes = typeof updatedRow.Day === 'string' ? updatedRow.Day.match(/[MTWRF]/g) : [];

        for (let i = 0; i < originalSchedules.length && i < dayCodes.length; i++) {
          const originalId = originalSchedules[i].id;
          const dayCode = dayCodes[i];
          const daySpecificUpdateData = {
            ...updateData,
            meetingPatterns: [{
              day: dayCode,
              startTime: updatedRow['Start Time'],
              endTime: updatedRow['End Time']
            }]
          };
          const scheduleDocRef = doc(db, 'schedules', originalId);
          await updateDoc(scheduleDocRef, { ...daySpecificUpdateData, instructorName: deleteField() });
          console.log(`✅ Updated schedule ${originalId} for day ${dayCode}`);
        }

        if (dayCodes.length > originalSchedules.length) {
          for (let i = originalSchedules.length; i < dayCodes.length; i++) {
            const dayCode = dayCodes[i];
            const newScheduleData = {
              ...updateData,
              meetingPatterns: [{
                day: dayCode,
                startTime: updatedRow['Start Time'],
                endTime: updatedRow['End Time']
              }],
              createdAt: new Date().toISOString()
            };
            const newScheduleRef = doc(collection(db, 'schedules'));
            await setDoc(newScheduleRef, newScheduleData);
            console.log(`✅ Created new schedule for day ${dayCode}`);
          }
        }

        if (dayCodes.length < originalSchedules.length) {
          for (let i = dayCodes.length; i < originalSchedules.length; i++) {
            const scheduleToDelete = originalSchedules[i];
            const scheduleDocRef = doc(db, 'schedules', scheduleToDelete.id);
            await deleteDoc(scheduleDocRef);
            console.log(`🗑️ Deleted extra schedule ${scheduleToDelete.id}`);
          }
        }

        await logUpdate(
          `Schedule Group - ${updateData.courseCode} ${updateData.section} (${originalSchedules.length} schedules)`,
          'schedules',
          'multiple',
          updateData,
          originalSchedules,
          'useScheduleOperations - handleDataUpdate'
        );
      } else {
        await updateDoc(scheduleRef, updatePayload);
        await logUpdate(
          `Schedule - ${updateData.courseCode} ${updateData.section} (${instructorDisplayName})`,
          'schedules',
          (updatedRow._originalId || updatedRow.id),
          updateData,
          originalSchedule,
          'useScheduleOperations - handleDataUpdate'
        );
      }

      // Refresh data
      await refreshSchedules();

      if (isNewCourse) {
        showNotification('success', 'Schedule Created',
          `Course ${updateData.courseCode} ${updateData.section} has been created successfully.`);
      } else if (isGroupedCourse) {
        showNotification('success', 'Grouped Schedule Updated',
          `Course ${updateData.courseCode} ${updateData.section} (${originalSchedules.length} schedule entries) has been updated successfully.`);
      } else {
        showNotification('success', 'Schedule Updated',
          `Course ${updateData.courseCode} ${updateData.section} has been updated successfully.`);
      }

    } catch (error) {
      console.error('❌ Error updating schedule:', error);
      showNotification('error', 'Update Failed', `Failed to update schedule: ${error.message}`);
    }
  }, [rawScheduleData, rawPeople, refreshSchedules, canCreateSchedule, canEditSchedule, showNotification, resolvedPeopleIndex, peopleMap, selectedSemester, isTermLocked, isAdmin]);

  // Handle schedule delete
  const handleScheduleDelete = useCallback(async (scheduleId) => {
    if (!canDeleteSchedule?.()) {
      showNotification('warning', 'Permission Denied', 'You don\'t have permission to delete schedules.');
      return;
    }

    console.log('🗑️ Deleting schedule:', scheduleId);

    try {
      const scheduleToDelete = rawScheduleData.find(s => s.id === scheduleId);
      if (!scheduleToDelete) {
        showNotification('error', 'Delete Failed', 'Schedule not found.');
        return;
      }
      const normalizedTerm = normalizeTermLabel(scheduleToDelete.term || selectedSemester || '');
      if (normalizedTerm && isTermLocked?.(normalizedTerm) && !isAdmin) {
        showNotification('warning', 'Term Locked', `Schedules for ${normalizedTerm} are archived or locked. Deletion is disabled.`);
        return;
      }

      await deleteDoc(doc(db, 'schedules', scheduleId));

      await logDelete(
        `Schedule - ${scheduleToDelete.courseCode} ${scheduleToDelete.section} (${scheduleToDelete.instructorName || UNASSIGNED})`,
        'schedules',
        scheduleId,
        scheduleToDelete,
        'useScheduleOperations - handleScheduleDelete'
      );

      await refreshSchedules();

      showNotification('success', 'Schedule Deleted',
        `Course ${scheduleToDelete.courseCode} ${scheduleToDelete.section} has been removed successfully.`);

    } catch (error) {
      console.error('❌ Error deleting schedule:', error);
      showNotification('error', 'Delete Failed', 'Failed to delete schedule. Please try again.');
    }
  }, [rawScheduleData, refreshSchedules, canDeleteSchedule, showNotification, selectedSemester, isTermLocked, isAdmin]);

  return {
    handleDataUpdate,
    handleScheduleDelete
  };
};

export default useScheduleOperations;
