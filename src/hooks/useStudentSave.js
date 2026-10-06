import { useRef, useState } from "react";
import { getStudentSaveError } from "../utils/studentJobDrafts";

export default function useStudentSave(onSave) {
  const pending = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const saveStudent = async (student) => {
    if (pending.current) return;
    pending.current = true;
    setIsSaving(true);
    setSaveError("");
    try {
      const result = await onSave(student);
      if (result === false) throw new Error("The student worker could not be saved. Please try again.");
      return result;
    } catch (error) {
      setSaveError(getStudentSaveError(error));
    } finally {
      pending.current = false;
      setIsSaving(false);
    }
  };

  return { saveStudent, isSaving, saveError };
}
