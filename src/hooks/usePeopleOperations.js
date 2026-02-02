/**
 * usePeopleOperations - Hook for people (faculty, staff, student) CRUD operations
 *
 * This hook encapsulates all people-related business logic that was previously
 * in App.jsx, including create, update, and delete operations for all person types.
 */

import { useCallback } from "react";
import { db, COLLECTIONS } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  addDoc,
} from "firebase/firestore";
import { logCreate, logUpdate, logDelete } from "../utils/changeLogger";
import { useData } from "../contexts/DataContext";
import { usePeople } from "../contexts/PeopleContext";
import { useUI } from "../contexts/UIContext";
import {
  getProgramNameKey,
  isReservedProgramName,
  normalizeProgramName,
} from "../utils/programUtils";
import { deletePersonSafely } from "../utils/dataHygiene";
import { standardizePerson } from "../utils/hygieneCore";
import {
  normalizeStudentWeeklySchedule,
  sortWeeklySchedule,
} from "../utils/studentScheduleUtils";
// Use centralized location service
import {
  parseRoomLabel,
  normalizeSpaceNumber,
  extractSpaceNumber,
  formatSpaceDisplayName,
  SPACE_TYPE,
} from "../utils/locationService";

const usePeopleOperations = () => {
  const {
    rawPeople,
    rawPrograms,
    loadPrograms,
    spacesByKey,
    canEdit,
    canEditFaculty,
    canCreateFaculty,
    canDeleteFaculty,
    canEditStaff,
    canCreateStaff,
    canEditStudent,
    canCreateStudent,
    canDeleteStudent,
    canCreateProgram,
    canCreateRoom,
    canEditRoom,
  } = useData();
  const { loadPeople } = usePeople();

  const { showNotification } = useUI();

  // NOTE: normalizeNameFields has been replaced by standardizePerson from hygieneCore
  // which provides more comprehensive standardization including phone, email, baylorId, etc.

  const normalizeStudentSchedules = useCallback((studentData) => {
    if (!studentData || typeof studentData !== "object") return studentData;
    const next = { ...studentData };

    if (Array.isArray(next.jobs)) {
      next.jobs = next.jobs.map((job) => {
        if (!job || typeof job !== "object") return job;
        const weeklySchedule = sortWeeklySchedule(
          normalizeStudentWeeklySchedule(job.weeklySchedule),
        );
        return { ...job, weeklySchedule };
      });
    }

    if (next.weeklySchedule !== undefined) {
      next.weeklySchedule = sortWeeklySchedule(
        normalizeStudentWeeklySchedule(next.weeklySchedule),
      );
    }

    if (next.semesterSchedules && typeof next.semesterSchedules === "object") {
      next.semesterSchedules = Object.fromEntries(
        Object.entries(next.semesterSchedules).map(([key, entry]) => {
          if (!entry || typeof entry !== "object") return [key, entry];
          const entryJobs = Array.isArray(entry.jobs)
            ? entry.jobs.map((job) => {
                if (!job || typeof job !== "object") return job;
                const weeklySchedule = sortWeeklySchedule(
                  normalizeStudentWeeklySchedule(job.weeklySchedule),
                );
                return { ...job, weeklySchedule };
              })
            : entry.jobs;
          const entryWeeklySchedule =
            entry.weeklySchedule !== undefined
              ? sortWeeklySchedule(
                  normalizeStudentWeeklySchedule(entry.weeklySchedule),
                )
              : entry.weeklySchedule;
          return [
            key,
            {
              ...entry,
              jobs: entryJobs,
              weeklySchedule: entryWeeklySchedule,
            },
          ];
        }),
      );
    }

    return next;
  }, []);

  const resolveOfficeSpaceId = useCallback(
    async (personData, { allowCreate = true } = {}) => {
      const office = (personData?.office || "").toString().trim();
      const hasNoOffice =
        personData?.hasNoOffice === true || personData?.isRemote === true;

      if (hasNoOffice || !office) return { officeSpaceId: "" };

      const parsed = parseRoomLabel(office);
      if (!parsed?.spaceKey) return { officeSpaceId: "" };

      const now = new Date().toISOString();
      const spaceKey = parsed.spaceKey;
      const buildingCode = (
        parsed.buildingCode ||
        parsed.building?.code ||
        ""
      ).toUpperCase();
      const spaceNumber = normalizeSpaceNumber(parsed.spaceNumber || "");
      const buildingDisplayName = parsed.building?.displayName || "";
      const displayName =
        formatSpaceDisplayName({
          buildingCode,
          buildingDisplayName,
          spaceNumber,
        }) ||
        parsed.displayName ||
        office;

      if (spacesByKey instanceof Map) {
        const existing = spacesByKey.get(spaceKey);
        if (existing) {
          return { officeSpaceId: spaceKey };
        }
      }

      // 1) Try to find by spaceKey first (new format)
      try {
        const bySpaceKeySnap = await getDocs(
          query(
            collection(db, COLLECTIONS.ROOMS),
            where("spaceKey", "==", spaceKey),
          ),
        );
        if (!bySpaceKeySnap.empty) {
          const docId = bySpaceKeySnap.docs[0].id;
          // Update with new fields if we have edit permission
          if (typeof canEditRoom === "function" && canEditRoom()) {
            setDoc(
              doc(db, COLLECTIONS.ROOMS, docId),
              {
                buildingCode,
                buildingDisplayName: buildingDisplayName || buildingCode,
                spaceNumber,
                spaceKey,
                displayName,
                updatedAt: now,
              },
              { merge: true },
            ).catch(() => null);
          }
          return { officeSpaceId: spaceKey };
        }
      } catch (error) {
        void error;
      }

      // 2) Building-only query (avoids composite index) + local match on space number
      try {
        const byBuildingSnap = await getDocs(
          query(
            collection(db, COLLECTIONS.ROOMS),
            where("buildingCode", "==", buildingCode),
          ),
        );

        const targetNumber = normalizeSpaceNumber(spaceNumber);
        const matchDoc = byBuildingSnap.docs.find((docSnap) => {
          const data = docSnap.data() || {};
          if (data.spaceKey && data.spaceKey === spaceKey) return true;
          const candidateNumber = normalizeSpaceNumber(
            data.spaceNumber || extractSpaceNumber(data.displayName || ""),
          );
          return candidateNumber && candidateNumber === targetNumber;
        });

        if (matchDoc) {
          return { officeSpaceId: spaceKey };
        }
      } catch (error) {
        void error;
      }

      const canCreate =
        typeof canCreateRoom === "function" ? canCreateRoom() : false;
      if (!allowCreate || !canCreate) return { officeSpaceId: "" };

      // Create new room
      const newRoom = {
        displayName: displayName,
        // New canonical fields
        spaceKey,
        spaceNumber,
        buildingCode,
        buildingDisplayName: buildingDisplayName || buildingCode,
        buildingId: buildingCode.toLowerCase(),
        // Properties
        capacity: null,
        type: SPACE_TYPE.OFFICE,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      try {
        await setDoc(doc(db, COLLECTIONS.ROOMS, spaceKey), newRoom, {
          merge: true,
        });
        return { officeSpaceId: spaceKey };
      } catch (error) {
        console.warn("Unable to create office room record:", error);
        return { officeSpaceId: "" };
      }
    },
    [canCreateRoom, canEditRoom],
  );

  // Handle faculty update/create
  const handleFacultyUpdate = useCallback(
    async (facultyToUpdate, originalData = null) => {
      const isNewFaculty = !facultyToUpdate.id;
      const requiredPermission = isNewFaculty
        ? canCreateFaculty()
        : canEditFaculty();

      if (!requiredPermission) {
        const actionName = isNewFaculty ? "create" : "modify";
        showNotification(
          "warning",
          "Permission Denied",
          `You don't have permission to ${actionName} faculty members.`,
        );
        return;
      }

      console.log("👤 Updating faculty member:", facultyToUpdate);

      try {
        let facultyRef;
        let actionType;

        if (isNewFaculty) {
          console.log("🆕 Creating new faculty member");
          facultyRef = doc(collection(db, "people"));
          actionType = "CREATE";
        } else {
          console.log("📝 Updating existing faculty member");
          facultyRef = doc(db, "people", facultyToUpdate.id);
          actionType = "UPDATE";
        }

        // Clean data - remove undefined values and derived fields
        const derivedFields = ["program", "instructor", "rooms", "room"];
        const cleanDataRecursively = (obj) => {
          if (obj === null || typeof obj !== "object") return obj;
          if (Array.isArray(obj)) {
            return obj
              .map((item) => cleanDataRecursively(item))
              .filter((item) => item !== undefined);
          }
          return Object.fromEntries(
            Object.entries(obj)
              .filter(
                ([key, value]) =>
                  value !== undefined && !derivedFields.includes(key),
              )
              .map(([key, value]) => [key, cleanDataRecursively(value)]),
          );
        };
        const cleanData = cleanDataRecursively(facultyToUpdate);
        // Use hygieneCore standardization for consistent data quality
        const normalizedData = standardizePerson(cleanData, {
          updateTimestamp: false,
        });

        const updateData = {
          ...normalizedData,
          updatedAt: new Date().toISOString(),
        };

        const shouldClearTenure =
          normalizedData.isAdjunct === true ||
          (normalizedData.isAdjunct === undefined &&
            originalData?.isAdjunct === true);
        if (shouldClearTenure) {
          updateData.isTenured = false;
        }

        // Handle office fields - sync both singular and array fields
        const nextOffices = Array.isArray(normalizedData.offices)
          ? normalizedData.offices.filter(Boolean)
          : [];
        const nextOffice = (normalizedData.office || nextOffices[0] || "")
          .toString()
          .trim();
        const nextHasNoOffice =
          normalizedData.hasNoOffice === true ||
          normalizedData.isRemote === true;

        if (nextHasNoOffice || (!nextOffice && nextOffices.length === 0)) {
          // Clear all office fields
          updateData.officeSpaceId = "";
          updateData.office = "";
          updateData.offices = [];
          updateData.officeSpaceIds = [];
        } else {
          // Build arrays from offices field or fall back to singular office
          const officesToResolve =
            nextOffices.length > 0
              ? nextOffices
              : nextOffice
                ? [nextOffice]
                : [];
          const resolvedOffices = [];
          const resolvedSpaceIds = [];

          for (const officeStr of officesToResolve) {
            const resolved = await resolveOfficeSpaceId({
              office: officeStr,
              hasNoOffice: false,
            });
            resolvedOffices.push(officeStr);
            resolvedSpaceIds.push(resolved.officeSpaceId || "");
          }

          // Set array fields
          updateData.offices = resolvedOffices;
          updateData.officeSpaceIds = resolvedSpaceIds;

          // Set singular fields to primary (first) office
          updateData.office = resolvedOffices[0] || "";
          updateData.officeSpaceId = resolvedSpaceIds[0] || "";
        }

        if (isNewFaculty) {
          await setDoc(facultyRef, updateData);
          await logCreate(
            `Faculty - ${facultyToUpdate.name}`,
            "people",
            facultyRef.id,
            updateData,
            "usePeopleOperations - handleFacultyUpdate",
          );
        } else {
          await updateDoc(facultyRef, updateData);
          await logUpdate(
            `Faculty - ${facultyToUpdate.name}`,
            "people",
            facultyToUpdate.id,
            updateData,
            originalData,
            "usePeopleOperations - handleFacultyUpdate",
          );
        }

        await loadPeople({ force: true });

        const successMessage = isNewFaculty
          ? `${facultyToUpdate.name} has been added to the directory successfully.`
          : `${facultyToUpdate.name} has been updated successfully.`;

        showNotification(
          "success",
          isNewFaculty ? "Faculty Added" : "Faculty Updated",
          successMessage,
        );
      } catch (error) {
        console.error("❌ Error updating faculty:", error);
        const errorMessage = !facultyToUpdate.id
          ? "Failed to add faculty member. Please try again."
          : "Failed to update faculty member. Please try again.";
        showNotification("error", "Operation Failed", errorMessage);
      }
    },
    [
      loadPeople,
      canCreateFaculty,
      canEditFaculty,
      showNotification,
      resolveOfficeSpaceId,
    ],
  );

  // Handle faculty delete
  const handleFacultyDelete = useCallback(
    async (facultyToDelete) => {
      if (!canDeleteFaculty()) {
        showNotification(
          "warning",
          "Permission Denied",
          "You don't have permission to delete faculty members.",
        );
        return;
      }

      console.log("🗑️ Deleting faculty member:", facultyToDelete);

      try {
        await deletePersonSafely(facultyToDelete.id);

        await logDelete(
          `Faculty - ${facultyToDelete.name}`,
          "people",
          facultyToDelete.id,
          facultyToDelete,
          "usePeopleOperations - handleFacultyDelete",
        );

        await loadPeople({ force: true });

        showNotification(
          "success",
          "Faculty Deleted",
          `${facultyToDelete.name} has been removed from the directory.`,
        );
      } catch (error) {
        console.error("❌ Error deleting faculty:", error);
        const message =
          error?.message ||
          "Failed to delete faculty member. Please try again.";
        showNotification("error", "Delete Failed", message);
      }
    },
    [loadPeople, canDeleteFaculty, showNotification],
  );

  // Handle staff update/create
  const handleStaffUpdate = useCallback(
    async (staffToUpdate) => {
      const isNewStaff = !staffToUpdate.id;
      const requiredPermission = isNewStaff ? canCreateStaff() : canEditStaff();

      if (!requiredPermission) {
        const actionName = isNewStaff ? "create" : "modify";
        showNotification(
          "warning",
          "Permission Denied",
          `You don't have permission to ${actionName} staff members.`,
        );
        return;
      }

      console.log("👥 Updating staff member:", staffToUpdate);

      try {
        let docRef;
        let action;
        let originalData = null;

        const cleanStaffData = Object.fromEntries(
          Object.entries(staffToUpdate).filter(
            ([_, value]) => value !== undefined,
          ),
        );
        // Use hygieneCore standardization for consistent data quality
        const normalizedStaffData = standardizePerson(cleanStaffData, {
          updateTimestamp: false,
        });

        const nextOffices = Array.isArray(normalizedStaffData.offices)
          ? normalizedStaffData.offices.filter(Boolean)
          : [];
        const nextOffice = (normalizedStaffData.office || nextOffices[0] || "")
          .toString()
          .trim();
        const nextHasNoOffice =
          normalizedStaffData.hasNoOffice === true ||
          normalizedStaffData.isRemote === true;

        // Helper to resolve all offices
        const resolveAllOffices = async () => {
          if (nextHasNoOffice || (!nextOffice && nextOffices.length === 0)) {
            return {
              offices: [],
              officeSpaceIds: [],
              office: "",
              officeSpaceId: "",
            };
          }
          const officesToResolve =
            nextOffices.length > 0
              ? nextOffices
              : nextOffice
                ? [nextOffice]
                : [];
          const resolvedOffices = [];
          const resolvedSpaceIds = [];
          for (const officeStr of officesToResolve) {
            const resolved = await resolveOfficeSpaceId({
              office: officeStr,
              hasNoOffice: false,
            });
            resolvedOffices.push(officeStr);
            resolvedSpaceIds.push(resolved.officeSpaceId || "");
          }
          return {
            offices: resolvedOffices,
            officeSpaceIds: resolvedSpaceIds,
            office: resolvedOffices[0] || "",
            officeSpaceId: resolvedSpaceIds[0] || "",
          };
        };

        if (staffToUpdate.id) {
          originalData =
            rawPeople.find((p) => p.id === staffToUpdate.id) || null;
          const staffRef = doc(db, "people", staffToUpdate.id);
          const updateData = {
            ...normalizedStaffData,
            updatedAt: new Date().toISOString(),
          };

          const officeFields = await resolveAllOffices();
          Object.assign(updateData, officeFields);

          await updateDoc(staffRef, updateData);
          docRef = staffRef;
          action = "UPDATE";

          await logUpdate(
            `Staff - ${staffToUpdate.name}`,
            "people",
            staffToUpdate.id,
            updateData,
            originalData,
            "usePeopleOperations - handleStaffUpdate",
          );
        } else {
          const createData = {
            ...normalizedStaffData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          const officeFields = await resolveAllOffices();
          Object.assign(createData, officeFields);

          docRef = await addDoc(collection(db, "people"), createData);
          action = "CREATE";

          await logCreate(
            `Staff - ${staffToUpdate.name}`,
            "people",
            docRef.id,
            createData,
            "usePeopleOperations - handleStaffUpdate",
          );
        }

        await loadPeople({ force: true });

        const successMessage =
          action === "CREATE"
            ? `${staffToUpdate.name} has been created successfully.`
            : `${staffToUpdate.name} has been updated successfully.`;

        showNotification(
          "success",
          `Staff ${action === "CREATE" ? "Created" : "Updated"}`,
          successMessage,
        );
      } catch (error) {
        console.error("❌ Error updating staff:", error);
        showNotification(
          "error",
          "Operation Failed",
          "Failed to save staff member. Please try again.",
        );
      }
    },
    [
      rawPeople,
      loadPeople,
      canCreateStaff,
      canEditStaff,
      showNotification,
      resolveOfficeSpaceId,
    ],
  );

  // Handle staff delete
  const handleStaffDelete = useCallback(
    async (staffToDelete) => {
      if (!canEdit()) {
        showNotification(
          "warning",
          "Permission Denied",
          "Only admins can delete staff.",
        );
        return;
      }

      console.log("🗑️ Deleting staff member:", staffToDelete);

      try {
        await deletePersonSafely(staffToDelete.id);

        await logDelete(
          `Staff - ${staffToDelete.name}`,
          "people",
          staffToDelete.id,
          staffToDelete,
          "usePeopleOperations - handleStaffDelete",
        );

        await loadPeople({ force: true });

        showNotification(
          "success",
          "Staff Deleted",
          `${staffToDelete.name} has been removed from the directory.`,
        );
      } catch (error) {
        console.error("❌ Error deleting staff:", error);
        const message =
          error?.message || "Failed to delete staff member. Please try again.";
        showNotification("error", "Delete Failed", message);
      }
    },
    [loadPeople, canEdit, showNotification],
  );

  // Handle student update/create
  const handleStudentUpdate = useCallback(
    async (studentToUpdate) => {
      const isNewStudent = !studentToUpdate.id;
      const requiredPermission = isNewStudent
        ? canCreateStudent()
        : canEditStudent();

      if (!requiredPermission) {
        const actionName = isNewStudent ? "create" : "modify";
        showNotification(
          "warning",
          "Permission Denied",
          `You don't have permission to ${actionName} student workers.`,
        );
        return;
      }

      console.log("🎓 Updating student worker:", studentToUpdate);

      try {
        let studentRef;
        let actionType;

        if (isNewStudent) {
          console.log("🆕 Creating new student worker");
          studentRef = doc(collection(db, "people"));
          actionType = "CREATE";
        } else {
          console.log("📝 Updating existing student worker");
          studentRef = doc(db, "people", studentToUpdate.id);
          actionType = "UPDATE";
        }

        const cleanStudentData = Object.fromEntries(
          Object.entries(studentToUpdate).filter(
            ([_, value]) => value !== undefined,
          ),
        );
        // Use hygieneCore standardization for consistent data quality
        // This handles name normalization, and student schedule normalization is done separately
        const normalizedStudentData = standardizePerson(cleanStudentData, {
          updateTimestamp: false,
        });
        const normalizedStudentWithSchedules = normalizeStudentSchedules(
          normalizedStudentData,
        );

        const existingStudent = !isNewStudent
          ? rawPeople.find((p) => p.id === studentToUpdate.id) || null
          : null;
        const fallbackIsActive = existingStudent?.isActive ?? true;

        const updateData = {
          ...normalizedStudentWithSchedules,
          roles: ["student"],
          hasNoOffice: true,
          office: "",
          officeSpaceId: "",
          officeSpaceIds: [],
          offices: [],
          isActive:
            normalizedStudentData.isActive !== undefined
              ? normalizedStudentData.isActive
              : fallbackIsActive,
          updatedAt: new Date().toISOString(),
        };

        if (isNewStudent) {
          await setDoc(studentRef, {
            ...updateData,
            createdAt: new Date().toISOString(),
          });
          await logCreate(
            `Student - ${studentToUpdate.name}`,
            "people",
            studentRef.id,
            { ...updateData, createdAt: new Date().toISOString() },
            "usePeopleOperations - handleStudentUpdate",
          );
        } else {
          const originalData = existingStudent;
          if (!originalData) {
            console.warn(
              "⚠️ Provided student id not found; creating new student instead",
            );
            const createRef = doc(collection(db, "people"));
            await setDoc(createRef, {
              ...updateData,
              createdAt: new Date().toISOString(),
            });
            await logCreate(
              `Student - ${studentToUpdate.name}`,
              "people",
              createRef.id,
              { ...updateData, createdAt: new Date().toISOString() },
              "usePeopleOperations - handleStudentUpdate",
            );
            await loadPeople({ force: true });
            showNotification(
              "success",
              "Student Added",
              `${studentToUpdate.name} has been added to the student worker directory successfully.`,
            );
            return;
          }

          await updateDoc(studentRef, updateData);
          await logUpdate(
            `Student - ${studentToUpdate.name}`,
            "people",
            studentToUpdate.id,
            updateData,
            originalData,
            "usePeopleOperations - handleStudentUpdate",
          );
        }

        await loadPeople({ force: true });

        const successMessage = isNewStudent
          ? `${studentToUpdate.name} has been added to the student worker directory successfully.`
          : `${studentToUpdate.name} has been updated successfully.`;

        showNotification(
          "success",
          isNewStudent ? "Student Added" : "Student Updated",
          successMessage,
        );
      } catch (error) {
        console.error("❌ Error updating student:", error);
        const isPermission =
          error &&
          (error.code === "permission-denied" ||
            /insufficient permissions/i.test(error.message || ""));
        if (isPermission) {
          showNotification(
            "warning",
            "Permission Denied",
            "Your account is not permitted to perform this action.",
          );
        } else {
          const friendly =
            error && error.message ? error.message : "Unexpected error";
          showNotification(
            "error",
            "Operation Failed",
            !studentToUpdate.id
              ? "Failed to add student worker. Please try again."
              : `Failed to update student worker. ${friendly}`,
          );
        }
      }
    },
    [
      rawPeople,
      loadPeople,
      canCreateStudent,
      canEditStudent,
      showNotification,
      normalizeStudentSchedules,
    ],
  );

  // Handle student delete
  const handleStudentDelete = useCallback(
    async (studentToDelete) => {
      if (!canDeleteStudent()) {
        showNotification(
          "warning",
          "Permission Denied",
          "You don't have permission to delete student workers.",
        );
        return;
      }

      console.log("🗑️ Deleting student worker:", studentToDelete);

      try {
        const studentId =
          typeof studentToDelete === "string"
            ? studentToDelete
            : studentToDelete.id;
        const existing = rawPeople.find((p) => p.id === studentId) || null;
        const entityName =
          existing?.name ||
          (typeof studentToDelete === "object"
            ? studentToDelete.name
            : "Unknown");

        await deletePersonSafely(studentId);

        await logDelete(
          `Student - ${entityName}`,
          "people",
          studentId,
          existing || studentToDelete,
          "usePeopleOperations - handleStudentDelete",
        );

        await loadPeople({ force: true });

        showNotification(
          "success",
          "Student Deleted",
          `${entityName} has been removed from the directory.`,
        );
      } catch (error) {
        console.error("❌ Error deleting student:", error);
        const message =
          error?.message ||
          "Failed to delete student worker. Please try again.";
        showNotification("error", "Delete Failed", message);
      }
    },
    [rawPeople, loadPeople, canDeleteStudent, showNotification],
  );

  // Handle program create
  const handleProgramCreate = useCallback(
    async (programInput = {}) => {
      if (!canCreateProgram()) {
        showNotification(
          "warning",
          "Permission Denied",
          "You do not have permission to create programs.",
        );
        return null;
      }

      const normalizedName = normalizeProgramName(programInput.name);
      if (!normalizedName) {
        showNotification(
          "error",
          "Invalid Name",
          "Program name cannot be empty.",
        );
        return null;
      }

      if (isReservedProgramName(normalizedName)) {
        showNotification(
          "error",
          "Invalid Name",
          '"Unassigned" is reserved for faculty without a program.',
        );
        return null;
      }

      const nameKey = getProgramNameKey(normalizedName);
      const existing = (rawPrograms || []).find(
        (p) => getProgramNameKey(p.name) === nameKey,
      );
      if (existing) {
        showNotification(
          "error",
          "Program Exists",
          `A program named "${existing.name}" already exists.`,
        );
        return null;
      }

      try {
        const now = new Date().toISOString();
        const programData = {
          name: normalizedName,
          updIds: [],
          createdAt: now,
          updatedAt: now,
        };

        const programRef = doc(collection(db, COLLECTIONS.PROGRAMS));
        await setDoc(programRef, programData);

        await logCreate(
          `Program - ${normalizedName}`,
          COLLECTIONS.PROGRAMS,
          programRef.id,
          programData,
          "usePeopleOperations - handleProgramCreate",
        );

        await loadPrograms({ force: true });

        showNotification(
          "success",
          "Program Added",
          `${normalizedName} has been added successfully.`,
        );
        return { id: programRef.id, ...programData };
      } catch (error) {
        console.error("❌ Error creating program:", error);
        showNotification(
          "error",
          "Program Creation Failed",
          "Failed to create program. Please try again.",
        );
        return null;
      }
    },
    [rawPrograms, loadPrograms, canCreateProgram, showNotification],
  );

  // Handle program update (including rename)
  const handleProgramUpdate = useCallback(
    async (programToUpdate, newName) => {
      if (!canCreateProgram()) {
        showNotification(
          "warning",
          "Permission Denied",
          "You do not have permission to edit programs.",
        );
        return null;
      }

      const normalizedName = normalizeProgramName(newName);
      if (!normalizedName) {
        showNotification(
          "error",
          "Invalid Name",
          "Program name cannot be empty.",
        );
        return null;
      }

      if (isReservedProgramName(normalizedName)) {
        showNotification(
          "error",
          "Invalid Name",
          '"Unassigned" is reserved for faculty without a program.',
        );
        return null;
      }

      const nameKey = getProgramNameKey(normalizedName);
      const existing = (rawPrograms || []).find(
        (p) =>
          p.id !== programToUpdate.id && getProgramNameKey(p.name) === nameKey,
      );
      if (existing) {
        showNotification(
          "error",
          "Program Exists",
          `A program named "${existing.name}" already exists.`,
        );
        return null;
      }

      try {
        const now = new Date().toISOString();
        const programRef = doc(db, COLLECTIONS.PROGRAMS, programToUpdate.id);

        const updateData = {
          name: normalizedName,
          updatedAt: now,
        };

        await updateDoc(programRef, updateData);

        await logUpdate(
          `Program - ${normalizedName}`,
          COLLECTIONS.PROGRAMS,
          programToUpdate.id,
          updateData,
          { name: programToUpdate.name },
          "usePeopleOperations - handleProgramUpdate",
        );

        await loadPrograms({ force: true });

        showNotification(
          "success",
          "Program Updated",
          `Program renamed to "${normalizedName}" successfully.`,
        );
        return { id: programToUpdate.id, ...updateData };
      } catch (error) {
        console.error("❌ Error updating program:", error);
        showNotification(
          "error",
          "Program Update Failed",
          "Failed to update program. Please try again.",
        );
        return null;
      }
    },
    [rawPrograms, loadPrograms, canCreateProgram, showNotification],
  );

  // Handle revert change (placeholder)
  const handleRevertChange = useCallback(
    async (changeToRevert) => {
      console.log("↩️ Reverting change:", changeToRevert);

      if (changeToRevert.action === "DELETE") {
        showNotification(
          "warning",
          "Cannot Revert Delete",
          "Deleted items cannot be automatically restored.",
        );
        return;
      }

      showNotification(
        "info",
        "Revert Not Implemented",
        "Change reversion is not yet implemented.",
      );
    },
    [showNotification],
  );

  // Handle Baylor ID update - minimal update that preserves roles
  const handleBaylorIdUpdate = useCallback(
    async (personId, baylorId) => {
      if (!personId) {
        showNotification(
          "error",
          "Invalid Request",
          "Person ID is required to update Baylor ID.",
        );
        return;
      }

      console.log("🎫 Updating Baylor ID for person:", personId);

      try {
        const personRef = doc(db, "people", personId);
        const personSnap = await getDoc(personRef);

        if (!personSnap.exists()) {
          showNotification("error", "Not Found", "Person record not found.");
          return;
        }

        const originalData = { id: personId, ...personSnap.data() };
        const updateData = {
          baylorId: baylorId || "",
          updatedAt: new Date().toISOString(),
        };

        await updateDoc(personRef, updateData);

        await logUpdate(
          `Person - ${originalData.name || "Unknown"}`,
          "people",
          personId,
          updateData,
          originalData,
          "usePeopleOperations - handleBaylorIdUpdate",
        );

        await loadPeople({ force: true });

        showNotification(
          "success",
          "Baylor ID Updated",
          `Baylor ID has been updated successfully.`,
        );
      } catch (error) {
        console.error("❌ Error updating Baylor ID:", error);
        showNotification(
          "error",
          "Update Failed",
          "Failed to update Baylor ID. Please try again.",
        );
      }
    },
    [loadPeople, showNotification],
  );

  return {
    handleFacultyUpdate,
    handleFacultyDelete,
    handleStaffUpdate,
    handleStaffDelete,
    handleStudentUpdate,
    handleStudentDelete,
    handleProgramCreate,
    handleProgramUpdate,
    handleRevertChange,
    handleBaylorIdUpdate,
  };
};

export default usePeopleOperations;
