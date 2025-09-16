import React, { useContext, useMemo } from "react";
import PropTypes from "prop-types";
import AuthContext from "../context/AuthContext";
import FlexHeaderCard from "./pageHeader";
import { useTheme } from '@mui/material/styles';
import { useMediaQuery } from '@mui/material';

const NS = "erp";
const VER = "v1";
const LAST_UID_KEY = `${NS}:lastUid:${VER}`;
const key = (uid, name) => `${NS}:${uid}:${name}:${VER}`;
const parseCache = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

// Read Teacher/CollegeAssociate data from localStorage cache
const readTeacherFromLocal = () => {
  if (typeof window === "undefined") return { role: null, details: null };
  
  try {
    const uid = window.localStorage.getItem(LAST_UID_KEY);
    if (!uid) return { role: null, details: null };
    const roleRaw = window.localStorage.getItem(key(uid, "role"));
    const detailsRaw = window.localStorage.getItem(key(uid, "details"));
    
    const roleEntry = parseCache(roleRaw);
    const detailsEntry = parseCache(detailsRaw);
    
    const role = roleEntry?.v || null;
    const details = detailsEntry?.v || null;

    if (role && details) return { role, details };

    const legacyRole = window.localStorage.getItem(`role_${uid}`);
    const legacyDetailsRaw = window.localStorage.getItem(`userDetails_${uid}`);
    const legacyDetails = parseCache(legacyDetailsRaw);

    return {
      role: role || legacyRole,
      details: details || legacyDetails,
    };
  } catch {
    return { role: null, details: null };
  }
};

const normalizeTeacher = (details, role) => {
  if (!details) return null;
  
  return {
    firstName: details.firstName || "",
    lastName: details.lastName || "",
    email: details.email || "",
    profilePicUrl: details.profilePicUrl || "",
    teacherId: details.teacherId || "",
    department: details.department || "",
    college: details.college || "",
    program: details.program || "",
    phone: details.phone || "",
    role: role || "Teacher",
    isCollegeAssociate: details.isCollegeAssociate || false,
  };
};

const TeacherHeader = ({
  title,
  avatar,
  avatarSx,
  extraTexts = [],          
  rightExtras = [],  
  showBack = false,
  onBack = undefined,
  backButtonProps = {},
  containerGridProps = { justifyContent: "flex-start", alignItems: "center" },
  leftGridProps = { item: true },
  centerGridProps = { item: true },
  rightGridProps = { item: true },
  sx,
  cardProps,
  cardContentProps,
}) => {
  const { userDetails: ctxUserDetails, role: ctxRole } = useContext(AuthContext);
  
  const { role: cachedRole, details: cachedDetails } = useMemo(() => readTeacherFromLocal(), []);
  
  const effectiveRole = ctxRole || cachedRole;
  const isStaff = effectiveRole === 'Teacher' || effectiveRole === 'CollegeAssociate';
  const effectiveDetails = isStaff ? (ctxUserDetails || cachedDetails) : ctxUserDetails;

  const teacher = useMemo(() => {
    if (!isStaff) return null;
    return normalizeTeacher(effectiveDetails, effectiveRole);
  }, [effectiveDetails, effectiveRole, isStaff]);

  if (!teacher) return null;

  const displayRole = teacher.isCollegeAssociate ? "College Associate" : "Teacher";
  
  const headerTexts = [
    ...(teacher.email ? [{ text: teacher.email }] : []),
    ...(teacher.teacherId ? [{ text: `Employee ID: ${teacher.teacherId}` }] : []),
    ...(teacher.department ? [{ text: `Department: ${teacher.department}` }] : []),
    ...(teacher.college ? [{ text: `College: ${teacher.college}` }] : []),
    ...(teacher.program ? [{ text: `Program: ${teacher.program}` }] : []),
    { text: displayRole },
    ...extraTexts,
  ];
   const theme = useTheme();
   const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  return (
    <FlexHeaderCard
      sx={{mb: 3, ...sx}}

      avatarSrc={avatar || teacher.profilePicUrl}
      avatarSx={avatarSx || {bgcolor: 'white', color: theme.palette.primary.main} }
      title={title || `${teacher.firstName} ${teacher.lastName}`}
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

TeacherHeader.propTypes = {
  title: PropTypes.node,
  avatar: PropTypes.string,
  avatarSx: PropTypes.object,
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

export default TeacherHeader;