import React from "react";
import {
  GraduationCap,
  Coffee,
  Clock,
  Moon,
  AlertTriangle,
} from "lucide-react";
import { LOCATION_STATUS } from "../../utils/facultyLocationUtils";

const FacultyStatusBadge = ({ status, label, small = false }) => {
  const baseClasses = small
    ? "px-2 py-0.5 text-xs font-medium rounded-full inline-flex items-center gap-1"
    : "px-3 py-1 text-sm font-medium rounded-full inline-flex items-center gap-1.5";

  const statusStyles = {
    [LOCATION_STATUS.TEACHING]: "bg-baylor-green/10 text-baylor-green",
    [LOCATION_STATUS.IN_OFFICE]: "bg-blue-100 text-blue-700",
    [LOCATION_STATUS.FREE]: "bg-gray-100 text-gray-600",
    [LOCATION_STATUS.NOT_AVAILABLE]: "bg-gray-50 text-gray-400",
    [LOCATION_STATUS.UNKNOWN]: "bg-gray-50 text-gray-400",
  };

  const statusIcons = {
    [LOCATION_STATUS.TEACHING]: (
      <GraduationCap className={small ? "w-3 h-3" : "w-4 h-4"} />
    ),
    [LOCATION_STATUS.IN_OFFICE]: (
      <Coffee className={small ? "w-3 h-3" : "w-4 h-4"} />
    ),
    [LOCATION_STATUS.FREE]: <Clock className={small ? "w-3 h-3" : "w-4 h-4"} />,
    [LOCATION_STATUS.NOT_AVAILABLE]: (
      <Moon className={small ? "w-3 h-3" : "w-4 h-4"} />
    ),
    [LOCATION_STATUS.UNKNOWN]: (
      <AlertTriangle className={small ? "w-3 h-3" : "w-4 h-4"} />
    ),
  };

  return (
    <span
      className={`${baseClasses} ${statusStyles[status] || statusStyles[LOCATION_STATUS.UNKNOWN]}`}
    >
      {statusIcons[status]}
      {label}
    </span>
  );
};

export default FacultyStatusBadge;
