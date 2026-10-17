/**
 * Message that is safe to show staff. Errors the app throws itself read as plain
 * sentences ("Another person already has that Baylor ID.") and pass through;
 * Firebase and runtime errors are replaced with the fallback. Log the raw error
 * with console.error where it is caught.
 */
export const getUserFacingErrorMessage = (error, fallback) => {
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  const isTechnical =
    !message ||
    Boolean(error?.code) ||
    error?.name === "FirebaseError" ||
    error instanceof TypeError ||
    error instanceof ReferenceError ||
    /firebase|firestore|permission|undefined|null|is not a function|cannot read/i.test(message);
  return isTechnical ? fallback : message;
};
