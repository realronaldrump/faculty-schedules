import { useState } from "react";
import { createStudentJobDraft, getStudentJobError } from "../utils/studentJobDrafts";

// The containing form owns the draft, including while its JobCard is unmounted
// by a tab change. JobCard never copies a new prop object over entered values.
export default function useStudentJobEditor(jobs, setJobs, employment) {
  const [editor, setEditor] = useState(null);
  const [jobError, setJobError] = useState("");

  const collectJobs = () => {
    if (!editor) return jobs;
    const error = getStudentJobError(editor.draft);
    setJobError(error);
    if (error) return null;
    const next = [...jobs];
    if (editor.index === "new") next.push(editor.draft);
    else next[editor.index] = editor.draft;
    return next;
  };

  const commitJob = () => {
    const next = collectJobs();
    if (!next) return null;
    setJobs(next);
    setEditor(null);
    setJobError("");
    return next;
  };

  const startNewJob = () => {
    if (!commitJob()) return;
    setEditor({
      index: "new",
      draft: createStudentJobDraft({
        id: crypto.randomUUID(),
        startDate: employment.startDate || "",
        endDate: employment.endDate || "",
      }),
    });
  };

  const startEditingJob = (index) => {
    const next = commitJob();
    if (!next) return;
    setEditor({ index, draft: createStudentJobDraft(next[index]) });
  };

  const changeDraft = (draft) => {
    setEditor((current) => current ? { ...current, draft } : current);
    setJobError("");
  };

  const cancelJob = () => {
    setEditor(null);
    setJobError("");
  };

  const removeJob = (index) => {
    const next = editor?.index === index ? jobs : collectJobs();
    if (!next) return;
    setJobs(next.filter((_, jobIndex) => jobIndex !== index));
    cancelJob();
  };

  return { editor, jobError, collectJobs, commitJob, startNewJob, startEditingJob, changeDraft, cancelJob, removeJob };
}
