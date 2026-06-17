import {
  GraduationCap,
  Coffee,
  Clock,
  Moon,
  AlertTriangle,
} from "lucide-react";
import { LOCATION_STATUS } from "../../utils/facultyLocationUtils";
import Badge from "../shared/Badge";

/**
 * FacultyStatusBadge - location/availability indicator for faculty.
 *
 * Thin wrapper that maps a location status to the shared Badge primitive so all
 * badges across the app share one consistent, on-brand appearance.
 */
const STATUS_CONFIG = {
  [LOCATION_STATUS.TEACHING]: { tone: "success", icon: GraduationCap },
  [LOCATION_STATUS.IN_OFFICE]: { tone: "info", icon: Coffee },
  [LOCATION_STATUS.FREE]: { tone: "neutral", icon: Clock },
  [LOCATION_STATUS.NOT_AVAILABLE]: { tone: "muted", icon: Moon },
  [LOCATION_STATUS.UNKNOWN]: { tone: "muted", icon: AlertTriangle },
};

const FacultyStatusBadge = ({ status, label, size = "md" }) => {
  const { tone, icon } = STATUS_CONFIG[status] || STATUS_CONFIG[LOCATION_STATUS.UNKNOWN];
  return (
    <Badge tone={tone} size={size} icon={icon}>
      {label}
    </Badge>
  );
};

export default FacultyStatusBadge;
