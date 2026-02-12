/**
 * Legacy direct import runtime path.
 *
 * NOTE:
 * The active application import flow uses transaction preview/commit via
 * `src/utils/importTransactionUtils.js`.
 *
 * This module preserves direct-import helpers for backwards compatibility and
 * isolates them from the primary import surface.
 */

import {
  processDirectoryImport as processDirectoryImportLegacy,
  processScheduleImport as processScheduleImportLegacy,
  createPersonModel,
  createScheduleModel,
} from "../../dataImportUtils";

export const processDirectoryImport = (...args) =>
  processDirectoryImportLegacy(...args);

export const processScheduleImport = (...args) =>
  processScheduleImportLegacy(...args);

export {
  createPersonModel,
  createScheduleModel,
};

export default {
  processDirectoryImport,
  processScheduleImport,
  createPersonModel,
  createScheduleModel,
};
