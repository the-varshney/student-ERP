import React, { useContext, useMemo } from "react";
import PropTypes from "prop-types";
import { auth } from "../firebase/Firebase";
import AuthContext from "../context/AuthContext";
import FlexHeaderCard from "./pageHeader";
import { useTheme } from '@mui/material/styles';
import { useMediaQuery } from '@mui/material';

//cache helpers
const NS = "erp";
const VER = "v1";
const key = (uid, name) => `${NS}:${uid}:${name}:${VER}`;
const parseCache = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

// Readstudent from localStorage
const readMergedStudentFromLocal = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const mergedRaw = typeof window !== "undefined" ? window.localStorage.getItem(key(uid, "student")) : null;
  const mergedEntry = parseCache(mergedRaw);
  const merged = mergedEntry?.v || null;
  if (merged) return merged;
  const legacyRaw = typeof window !== "undefined" ? window.localStorage.getItem(`userDetails_${uid}`) : null;
  try { return legacyRaw ? JSON.parse(legacyRaw) : null; } catch { return null; }
};

// Normalize student data
const normalizeStudent = (merged) => {
  if (!merged) return null;
  return {
    firstName: merged.firstName || "",
    lastName: merged.lastName || "",
    email: merged.email || "",
    profilePicUrl: merged.profilePicUrl || "",
    enrollmentNo: merged.EnrollmentNo || merged.enrollmentNo || "",
    department: merged.Department || merged.department || "",
    program: merged.Program || merged.program || "",
    semester: String(merged.Semester || merged.semester || ""),
  };
};

const StudentHeader = ({
  titleOverride,
  avatarOverride,
  extraTexts = [],          // [{ icon, text, textProps, sx }]
  rightExtras = [],
  showBack = false,
  onBack = undefined,
  backButtonProps = {},
  containerGridProps = { justifyContent: "flex-start", alignItems: "center", rowSpacing: { xs: 9, md: 9 } },
  leftGridProps = { item: true },
  centerGridProps = { item: true },  
  rightGridProps = { item: true },
  sx,
  cardProps,
  cardContentProps,
}) => {
  const { userDetails: ctxUserDetails } = useContext(AuthContext);
  const merged = useMemo(() => {
    // Prefer AuthContext if present or fallback to local cache
    if (ctxUserDetails && (ctxUserDetails.EnrollmentNo || ctxUserDetails._academic || ctxUserDetails.firebaseId)) return ctxUserDetails;
    return readMergedStudentFromLocal();
  }, [ctxUserDetails]);

  const student = useMemo(() => normalizeStudent(merged), [merged]);

  if (!student) return null;

  const headerTexts = [

    ...(student.email ? [{ text: student.email }] : []),
    ...(student.enrollmentNo ? [{ text: `Enrollment: ${student.enrollmentNo}` }] : []),
    ...(student.department ? [{ text: `Department: ${student.department}` }] : []),
    ...(student.program || student.semester
      ? [{ text: `${student.program || ""}${student.program ? " : " : ""}${student.semester ? `Sem ${student.semester}` : ""}` }]
      : []),
    ...extraTexts,
  ];
  
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  return (
    <FlexHeaderCard
      sx={{mb: 3, ...sx }}
      avatarSrc={avatarOverride || student.profilePicUrl}
      title={titleOverride || `${student.firstName} ${student.lastName}`}
      texts={isMobile ? [] : headerTexts}
      containerGridProps={containerGridProps}
      leftGridProps={leftGridProps}
      centerGridProps={centerGridProps}
      rightGridProps={rightGridProps}
      showBack={showBack}
      onBack={onBack}
      backButtonProps={backButtonProps}
      rightExtras={rightExtras}
      cardProps={cardProps}
      cardContentProps={cardContentProps}
    />
  );
};

StudentHeader.propTypes = {
  titleOverride: PropTypes.node,
  avatarOverride: PropTypes.string,
  extraTexts: PropTypes.arrayOf(
    PropTypes.shape({
      icon: PropTypes.node,
      text: PropTypes.node,
      textProps: PropTypes.object,
      sx: PropTypes.object,
    })
  ),
  rightExtras: PropTypes.arrayOf(PropTypes.node),
  showBack: PropTypes.bool,
  onBack: PropTypes.func,
  backButtonProps: PropTypes.object,
  containerGridProps: PropTypes.object,
  leftGridProps: PropTypes.object,
  centerGridProps: PropTypes.object,
  rightGridProps: PropTypes.object,
  debug: PropTypes.bool,
  sx: PropTypes.object,
  cardProps: PropTypes.object,
  cardContentProps: PropTypes.object,
};

export default StudentHeader;