/**
 * usePeopleOperations - Hook for people (faculty, staff, student) CRUD operations
 *
 * This hook encapsulates all people-related business logic that was previously
 * in App.jsx, including create, update, and delete operations for all person types.
 */

import { useCallback } from 'react';
import { db, COLLECTIONS } from '../firebase';
import { doc, updateDoc, addDoc, deleteDoc, setDoc, collection } from 'firebase/firestore';
import { logCreate, logUpdate, logDelete } from '../utils/changeLogger';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import { getProgramNameKey, isReservedProgramName, normalizeProgramName } from '../utils/programUtils';

const usePeopleOperations = () => {
  const {
    rawPeople,
    rawPrograms,
    loadData,
    canEdit,
    canEditFaculty,
    canCreateFaculty,
    canDeleteFaculty,
    canEditStaff,
    canCreateStaff,
    canEditStudent,
    canCreateStudent,
    canDeleteStudent,
    canCreateProgram
  } = useData();

  const { showNotification } = useUI();

  // Handle faculty update/create
  const handleFacultyUpdate = useCallback(async (facultyToUpdate, originalData = null) => {
    const isNewFaculty = !facultyToUpdate.id;
    const requiredPermission = isNewFaculty ? canCreateFaculty() : canEditFaculty();

    if (!requiredPermission) {
      const actionName = isNewFaculty ? 'create' : 'modify';
      showNotification('warning', 'Permission Denied', `You don't have permission to ${actionName} faculty members.`);
      return;
    }

    console.log('👤 Updating faculty member:', facultyToUpdate);

    try {
      let facultyRef;
      let actionType;

      if (isNewFaculty) {
        console.log('🆕 Creating new faculty member');
        facultyRef = doc(collection(db, 'people'));
        actionType = 'CREATE';
      } else {
        console.log('📝 Updating existing faculty member');
        facultyRef = doc(db, 'people', facultyToUpdate.id);
        actionType = 'UPDATE';
      }

      // Clean data - remove undefined values and derived fields
      const derivedFields = ['program', 'instructor', 'rooms', 'room'];
      const cleanDataRecursively = (obj) => {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) {
          return obj.map(item => cleanDataRecursively(item)).filter(item => item !== undefined);
        }
        return Object.fromEntries(
          Object.entries(obj)
            .filter(([key, value]) => value !== undefined && !derivedFields.includes(key))
            .map(([key, value]) => [key, cleanDataRecursively(value)])
        );
      };
      const cleanData = cleanDataRecursively(facultyToUpdate);

      const updateData = {
        ...cleanData,
        updatedAt: new Date().toISOString()
      };

      if (isNewFaculty) {
        await setDoc(facultyRef, updateData);
        await logCreate(
          `Faculty - ${facultyToUpdate.name}`,
          'people',
          facultyRef.id,
          updateData,
          'usePeopleOperations - handleFacultyUpdate'
        );
      } else {
        await updateDoc(facultyRef, updateData);
        await logUpdate(
          `Faculty - ${facultyToUpdate.name}`,
          'people',
          facultyToUpdate.id,
          updateData,
          originalData,
          'usePeopleOperations - handleFacultyUpdate'
        );
      }

      await loadData({ silent: true });

      const successMessage = isNewFaculty
        ? `${facultyToUpdate.name} has been added to the directory successfully.`
        : `${facultyToUpdate.name} has been updated successfully.`;

      showNotification('success', isNewFaculty ? 'Faculty Added' : 'Faculty Updated', successMessage);

    } catch (error) {
      console.error('❌ Error updating faculty:', error);
      const errorMessage = !facultyToUpdate.id
        ? 'Failed to add faculty member. Please try again.'
        : 'Failed to update faculty member. Please try again.';
      showNotification('error', 'Operation Failed', errorMessage);
    }
  }, [loadData, canCreateFaculty, canEditFaculty, showNotification]);

  // Handle faculty delete
  const handleFacultyDelete = useCallback(async (facultyToDelete) => {
    if (!canDeleteFaculty()) {
      showNotification('warning', 'Permission Denied', 'You don\'t have permission to delete faculty members.');
      return;
    }

    console.log('🗑️ Deleting faculty member:', facultyToDelete);

    try {
      await deleteDoc(doc(db, 'people', facultyToDelete.id));

      await logDelete(
        `Faculty - ${facultyToDelete.name}`,
        'people',
        facultyToDelete.id,
        facultyToDelete,
        'usePeopleOperations - handleFacultyDelete'
      );

      await loadData({ silent: true });

      showNotification('success', 'Faculty Deleted', `${facultyToDelete.name} has been removed from the directory.`);

    } catch (error) {
      console.error('❌ Error deleting faculty:', error);
      showNotification('error', 'Delete Failed', 'Failed to delete faculty member. Please try again.');
    }
  }, [loadData, canDeleteFaculty, showNotification]);

  // Handle staff update/create
  const handleStaffUpdate = useCallback(async (staffToUpdate) => {
    const isNewStaff = !staffToUpdate.id;
    const requiredPermission = isNewStaff ? canCreateStaff() : canEditStaff();

    if (!requiredPermission) {
      const actionName = isNewStaff ? 'create' : 'modify';
      showNotification('warning', 'Permission Denied', `You don't have permission to ${actionName} staff members.`);
      return;
    }

    console.log('👥 Updating staff member:', staffToUpdate);

    try {
      let docRef;
      let action;
      let originalData = null;

      const cleanStaffData = Object.fromEntries(
        Object.entries(staffToUpdate).filter(([_, value]) => value !== undefined)
      );

      if (staffToUpdate.id) {
        originalData = rawPeople.find(p => p.id === staffToUpdate.id) || null;
        const staffRef = doc(db, 'people', staffToUpdate.id);
        const updateData = {
          ...cleanStaffData,
          updatedAt: new Date().toISOString()
        };

        await updateDoc(staffRef, updateData);
        docRef = staffRef;
        action = 'UPDATE';

        await logUpdate(
          `Staff - ${staffToUpdate.name}`,
          'people',
          staffToUpdate.id,
          updateData,
          originalData,
          'usePeopleOperations - handleStaffUpdate'
        );
      } else {
        const createData = {
          ...cleanStaffData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        docRef = await addDoc(collection(db, 'people'), createData);
        action = 'CREATE';

        await logCreate(
          `Staff - ${staffToUpdate.name}`,
          'people',
          docRef.id,
          createData,
          'usePeopleOperations - handleStaffUpdate'
        );
      }

      await loadData({ silent: true });

      const successMessage = action === 'CREATE'
        ? `${staffToUpdate.name} has been created successfully.`
        : `${staffToUpdate.name} has been updated successfully.`;

      showNotification('success', `Staff ${action === 'CREATE' ? 'Created' : 'Updated'}`, successMessage);

    } catch (error) {
      console.error('❌ Error updating staff:', error);
      showNotification('error', 'Operation Failed', 'Failed to save staff member. Please try again.');
    }
  }, [rawPeople, loadData, canCreateStaff, canEditStaff, showNotification]);

  // Handle staff delete
  const handleStaffDelete = useCallback(async (staffToDelete) => {
    if (!canEdit()) {
      showNotification('warning', 'Permission Denied', 'Only admins can delete staff.');
      return;
    }

    console.log('🗑️ Deleting staff member:', staffToDelete);

    try {
      await deleteDoc(doc(db, 'people', staffToDelete.id));

      await logDelete(
        `Staff - ${staffToDelete.name}`,
        'people',
        staffToDelete.id,
        staffToDelete,
        'usePeopleOperations - handleStaffDelete'
      );

      await loadData({ silent: true });

      showNotification('success', 'Staff Deleted', `${staffToDelete.name} has been removed from the directory.`);

    } catch (error) {
      console.error('❌ Error deleting staff:', error);
      showNotification('error', 'Delete Failed', 'Failed to delete staff member. Please try again.');
    }
  }, [loadData, canEdit, showNotification]);

  // Handle student update/create
  const handleStudentUpdate = useCallback(async (studentToUpdate) => {
    const isNewStudent = !studentToUpdate.id;
    const requiredPermission = isNewStudent ? canCreateStudent() : canEditStudent();

    if (!requiredPermission) {
      const actionName = isNewStudent ? 'create' : 'modify';
      showNotification('warning', 'Permission Denied', `You don't have permission to ${actionName} student workers.`);
      return;
    }

    console.log('🎓 Updating student worker:', studentToUpdate);

    try {
      let studentRef;
      let actionType;

      if (isNewStudent) {
        console.log('🆕 Creating new student worker');
        studentRef = doc(collection(db, 'people'));
        actionType = 'CREATE';
      } else {
        console.log('📝 Updating existing student worker');
        studentRef = doc(db, 'people', studentToUpdate.id);
        actionType = 'UPDATE';
      }

      const cleanStudentData = Object.fromEntries(
        Object.entries(studentToUpdate).filter(([_, value]) => value !== undefined)
      );

      // Derive isActive based on endDate
      let derivedIsActive = cleanStudentData.isActive;
      try {
        const endDateStr = cleanStudentData.endDate || null;
        if (endDateStr) {
          const end = new Date(`${endDateStr}T23:59:59`);
          if (!isNaN(end.getTime())) {
            derivedIsActive = end >= new Date();
          }
        }
      } catch (_) {}

      const updateData = {
        ...cleanStudentData,
        roles: ['student'],
        isActive: (cleanStudentData.isActive !== undefined ? cleanStudentData.isActive : (derivedIsActive !== undefined ? derivedIsActive : true)),
        updatedAt: new Date().toISOString()
      };

      if (isNewStudent) {
        await setDoc(studentRef, { ...updateData, createdAt: new Date().toISOString() });
        await logCreate(
          `Student - ${studentToUpdate.name}`,
          'people',
          studentRef.id,
          { ...updateData, createdAt: new Date().toISOString() },
          'usePeopleOperations - handleStudentUpdate'
        );
      } else {
        const originalData = rawPeople.find(p => p.id === studentToUpdate.id) || null;
        if (!originalData) {
          console.warn('⚠️ Provided student id not found; creating new student instead');
          const createRef = doc(collection(db, 'people'));
          await setDoc(createRef, { ...updateData, createdAt: new Date().toISOString() });
          await logCreate(
            `Student - ${studentToUpdate.name}`,
            'people',
            createRef.id,
            { ...updateData, createdAt: new Date().toISOString() },
            'usePeopleOperations - handleStudentUpdate'
          );
          await loadData({ silent: true });
          showNotification('success', 'Student Added', `${studentToUpdate.name} has been added to the student worker directory successfully.`);
          return;
        }

        await updateDoc(studentRef, updateData);
        await logUpdate(
          `Student - ${studentToUpdate.name}`,
          'people',
          studentToUpdate.id,
          updateData,
          originalData,
          'usePeopleOperations - handleStudentUpdate'
        );
      }

      await loadData({ silent: true });

      const successMessage = isNewStudent
        ? `${studentToUpdate.name} has been added to the student worker directory successfully.`
        : `${studentToUpdate.name} has been updated successfully.`;

      showNotification('success', isNewStudent ? 'Student Added' : 'Student Updated', successMessage);

    } catch (error) {
      console.error('❌ Error updating student:', error);
      const isPermission = (error && (error.code === 'permission-denied' || /insufficient permissions/i.test(error.message || '')));
      if (isPermission) {
        showNotification('warning', 'Permission Denied', 'Your account is not permitted to perform this action.');
      } else {
        const friendly = (error && error.message) ? error.message : 'Unexpected error';
        showNotification('error', 'Operation Failed', !studentToUpdate.id ? 'Failed to add student worker. Please try again.' : `Failed to update student worker. ${friendly}`);
      }
    }
  }, [rawPeople, loadData, canCreateStudent, canEditStudent, showNotification]);

  // Handle student delete
  const handleStudentDelete = useCallback(async (studentToDelete) => {
    if (!canDeleteStudent()) {
      showNotification('warning', 'Permission Denied', 'You don\'t have permission to delete student workers.');
      return;
    }

    console.log('🗑️ Deleting student worker:', studentToDelete);

    try {
      const studentId = typeof studentToDelete === 'string' ? studentToDelete : studentToDelete.id;
      const existing = rawPeople.find(p => p.id === studentId) || null;
      const entityName = existing?.name || (typeof studentToDelete === 'object' ? studentToDelete.name : 'Unknown');

      await deleteDoc(doc(db, 'people', studentId));

      await logDelete(
        `Student - ${entityName}`,
        'people',
        studentId,
        existing || studentToDelete,
        'usePeopleOperations - handleStudentDelete'
      );

      await loadData({ silent: true });

      showNotification('success', 'Student Deleted', `${entityName} has been removed from the directory.`);

    } catch (error) {
      console.error('❌ Error deleting student:', error);
      showNotification('error', 'Delete Failed', 'Failed to delete student worker. Please try again.');
    }
  }, [rawPeople, loadData, canDeleteStudent, showNotification]);

  // Handle program create
  const handleProgramCreate = useCallback(async (programInput = {}) => {
    if (!canCreateProgram()) {
      showNotification('warning', 'Permission Denied', 'You do not have permission to create programs.');
      return null;
    }

    const normalizedName = normalizeProgramName(programInput.name);
    if (!normalizedName) {
      showNotification('error', 'Invalid Name', 'Program name cannot be empty.');
      return null;
    }

    if (isReservedProgramName(normalizedName)) {
      showNotification('error', 'Invalid Name', '"Unassigned" is reserved for faculty without a program.');
      return null;
    }

    const nameKey = getProgramNameKey(normalizedName);
    const existing = (rawPrograms || []).find(p => getProgramNameKey(p.name) === nameKey);
    if (existing) {
      showNotification('error', 'Program Exists', `A program named "${existing.name}" already exists.`);
      return null;
    }

    try {
      const now = new Date().toISOString();
      const programData = {
        name: normalizedName,
        updIds: [],
        createdAt: now,
        updatedAt: now
      };

      const programRef = doc(collection(db, COLLECTIONS.PROGRAMS));
      await setDoc(programRef, programData);

      await logCreate(
        `Program - ${normalizedName}`,
        COLLECTIONS.PROGRAMS,
        programRef.id,
        programData,
        'usePeopleOperations - handleProgramCreate'
      );

      await loadData({ silent: true });

      showNotification('success', 'Program Added', `${normalizedName} has been added successfully.`);
      return { id: programRef.id, ...programData };
    } catch (error) {
      console.error('❌ Error creating program:', error);
      showNotification('error', 'Program Creation Failed', 'Failed to create program. Please try again.');
      return null;
    }
  }, [rawPrograms, loadData, canCreateProgram, showNotification]);

  // Handle revert change (placeholder)
  const handleRevertChange = useCallback(async (changeToRevert) => {
    console.log('↩️ Reverting change:', changeToRevert);

    if (changeToRevert.action === 'DELETE') {
      showNotification('warning', 'Cannot Revert Delete', 'Deleted items cannot be automatically restored.');
      return;
    }

    showNotification('info', 'Revert Not Implemented', 'Change reversion is not yet implemented.');
  }, [showNotification]);

  return {
    handleFacultyUpdate,
    handleFacultyDelete,
    handleStaffUpdate,
    handleStaffDelete,
    handleStudentUpdate,
    handleStudentDelete,
    handleProgramCreate,
    handleRevertChange
  };
};

export default usePeopleOperations;
