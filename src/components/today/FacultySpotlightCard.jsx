import React from "react";
import {
  AlertTriangle,
  Building2,
  Clock,
  Info,
  MapPin,
  X,
} from "lucide-react";
import { LOCATION_STATUS } from "../../utils/facultyLocationUtils";
import FacultyStatusBadge from "./FacultyStatusBadge";

const FacultySpotlightCard = ({ faculty, locationStatus, onClose }) => {
  if (!faculty || !locationStatus) return null;

  const {
    currentLocation,
    nextLocation,
    office,
    hasConflict,
    conflictDetails,
    statusLabel,
  } = locationStatus;

  return (
    <div className="university-card border-2 border-baylor-green/20 bg-gradient-to-r from-baylor-green/5 to-transparent animate-fade-in">
      <div className="university-card-content">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-16 h-16 bg-baylor-green rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
              <span className="text-white font-bold text-xl">
                {faculty.name
                  ?.split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2) || "?"}
              </span>
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-xl font-bold text-gray-900">
                  {faculty.name}
                </h3>
                <FacultyStatusBadge
                  status={locationStatus.status}
                  label={statusLabel}
                />
                {hasConflict && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Schedule Conflict
                  </span>
                )}
              </div>

              {faculty.program?.name && (
                <p className="text-sm text-gray-500 mt-1">
                  {faculty.program.name}
                </p>
              )}

              {/* Current Location / Conflict Details */}
              <div className="mt-4 space-y-2">
                {hasConflict && conflictDetails ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-amber-800 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      Conflicting Assignments detected:
                    </div>
                    <div className="grid gap-2">
                      {conflictDetails.map((conflict, idx) => (
                        <div
                          key={idx}
                          className="bg-amber-50/50 border border-amber-100 rounded-lg p-2 flex items-center justify-between"
                        >
                          <div>
                            <div className="font-medium text-gray-900">
                              {conflict.course} {conflict.section}
                            </div>
                            <div className="text-sm text-gray-500 flex items-center gap-2">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {conflict.startTime} - {conflict.endTime}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-gray-700 font-medium bg-white px-2 py-1 rounded shadow-sm">
                            <MapPin className="w-3 h-3 text-baylor-green" />
                            {conflict.room}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : currentLocation ? (
                  <div className="flex items-center justify-between bg-white/60 rounded-lg p-3 border border-gray-100">
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wide">
                        Current
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <MapPin className="w-4 h-4 text-baylor-green" />
                        <span className="font-semibold text-gray-900">
                          {currentLocation.room || "Office"}
                        </span>
                        {currentLocation.course && (
                          <span className="text-sm text-gray-500">
                            ({currentLocation.course})
                          </span>
                        )}
                      </div>
                    </div>
                    {currentLocation.endTime && !currentLocation.isOffice && (
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Until</div>
                        <div className="font-medium text-gray-900">
                          {currentLocation.endTime}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">
                    No scheduled location at this time.
                  </div>
                )}

                {nextLocation && (
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wide">
                        Next
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-900">
                          {nextLocation.room}
                        </span>
                        <span className="text-sm text-gray-500">
                          at {nextLocation.startTime}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Contact Info */}
              <div className="mt-4 text-xs text-gray-500 flex flex-wrap gap-3">
                {faculty.email && (
                  <a
                    href={`mailto:${faculty.email}`}
                    className="hover:text-baylor-green transition-colors"
                  >
                    {faculty.email}
                  </a>
                )}
                {faculty.phone && <span>{faculty.phone}</span>}
                {office && !currentLocation?.isOffice && (
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    Office: {office}
                  </span>
                )}
              </div>

              {locationStatus.status === LOCATION_STATUS.IN_OFFICE && (
                <div className="mt-3 text-xs text-gray-500 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Inferred from office assignment during office hours.
                </div>
              )}
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FacultySpotlightCard;
