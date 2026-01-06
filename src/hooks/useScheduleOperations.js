/**
 * useScheduleOperations - Hook for schedule CRUD operations
 *
 * This hook encapsulates all schedule-related business logic that was previously
 * in App.jsx, including create, update, and delete operations.
 */

import { useCallback } from 'react';
import { db, COLLECTIONS } from '../firebase';
import { doc, updateDoc, addDoc, deleteDoc, setDoc, collection } from 'firebase/firestore';
import { parseCourseCode } from '../utils/courseUtils';
import { logCreate, logUpdate, logDelete } from '../utils/changeLogger';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';

const useScheduleOperations = () => {
  const {
    rawScheduleData,
    rawPeople,
    loadData,
    canCreateSchedule,
    canEditSchedule,
    canDeleteSchedule
  } = useData();

  const { showNotification } = useUI();

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
      if (updatedRow.Instructor && updatedRow.Instructor !== 'Staff') {
        // First try to match by ID if provided
        if (updatedRow.instructorId) {
          const instructor = rawPeople.find(p => p.id === updatedRow.instructorId);
          if (instructor) {
            instructorId = instructor.id;
          }
        }
        // Fallback to exact name match
        if (!instructorId) {
          const instructor = rawPeople.find(person => person.name === updatedRow.Instructor);
          if (instructor) {
            instructorId = instructor.id;
          } else {
            console.warn('⚠️ Instructor not found in people collection:', updatedRow.Instructor);
          }
        }
      }

      const referenceSchedule = isGroupedCourse ? originalSchedules[0] : originalSchedule;

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
        term: updatedRow.Term || (referenceSchedule?.term || ''),
        credits: computedCredits,
        scheduleType: updatedRow['Schedule Type'] || (referenceSchedule?.scheduleType || 'Class Instruction'),
        status: updatedRow.Status || (referenceSchedule?.status || 'Active'),
        instructorId: instructorId,
        instructorName: updatedRow.Instructor || (referenceSchedule?.instructorName || ''),
        roomId: isOnlineFlag ? null : null,
        roomName: isOnlineFlag ? '' : (updatedRow.Room || (referenceSchedule?.roomName || '')),
        meetingPatterns: meetingPatterns.length > 0 ? meetingPatterns : (referenceSchedule?.meetingPatterns || []),
        isOnline: isOnlineFlag,
        onlineMode: isOnlineFlag ? (onlineMode || (meetingPatterns.length > 0 ? 'synchronous' : 'asynchronous')) : null,
        updatedAt: new Date().toISOString(),
        ...(isNewCourse && { createdAt: new Date().toISOString() })
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
          `Schedule - ${updateData.courseCode} ${updateData.section} (${updateData.instructorName})`,
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
          await updateDoc(scheduleDocRef, daySpecificUpdateData);
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
        await updateDoc(scheduleRef, updateData);
        await logUpdate(
          `Schedule - ${updateData.courseCode} ${updateData.section} (${updateData.instructorName})`,
          'schedules',
          (updatedRow._originalId || updatedRow.id),
          updateData,
          originalSchedule,
          'useScheduleOperations - handleDataUpdate'
        );
      }

      // Refresh data
      await loadData({ silent: true });

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
  }, [rawScheduleData, rawPeople, loadData, canCreateSchedule, canEditSchedule, showNotification]);

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

      await deleteDoc(doc(db, 'schedules', scheduleId));

      await logDelete(
        `Schedule - ${scheduleToDelete.courseCode} ${scheduleToDelete.section} (${scheduleToDelete.instructorName})`,
        'schedules',
        scheduleId,
        scheduleToDelete,
        'useScheduleOperations - handleScheduleDelete'
      );

      await loadData({ silent: true });

      showNotification('success', 'Schedule Deleted',
        `Course ${scheduleToDelete.courseCode} ${scheduleToDelete.section} has been removed successfully.`);

    } catch (error) {
      console.error('❌ Error deleting schedule:', error);
      showNotification('error', 'Delete Failed', 'Failed to delete schedule. Please try again.');
    }
  }, [rawScheduleData, loadData, canDeleteSchedule, showNotification]);

  return {
    handleDataUpdate,
    handleScheduleDelete
  };
};

export default useScheduleOperations;
