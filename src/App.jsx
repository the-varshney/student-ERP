import React, { useContext, useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { CssBaseline } from '@mui/material';
import { CircularProgress, Box, Typography } from "@mui/material";
import ProtectedRoute from './context/ProtectedRoute';
import AuthContext from './context/AuthContext';
import './App.css';

// Pages
import Register from './pages/common/registration';
import Login from './pages/common/login';
import Message from './pages/common/Message';
import Settings from './pages/common/Settings';
import Test from './pages/common/testing';

import AdminHome from './pages/admins/AdminHome';
import AddTeacher from './pages/admins/AddTeacher';
import StudentApproval from './pages/admins/studentsApproval';
import AdminAnnouncements from './pages/admins/announcements';
import SyllabusManager from './pages/admins/UploadSyllabus';
import Tickets from './pages/admins/Tickets';
import FeeManager from './pages/admins/FeeManager';
import UsersList from './pages/admins/UsersList';
import DBWorkbench from './pages/admins/DBQuery';
import UserDetails from './pages/admins/UsersDetails';
import AdminCatalogManager from './pages/admins/Colleges&CoursesManager';
import UniLibrary from './pages/admins/UniLibrary';

import TeacherHome from './pages/teachers/home';
import AttendanceTaking from './pages/teachers/attendanceTaking';
import ResultUpdate from './pages/teachers/resultUpdate';
import TeacherLibrary from './pages/teachers/teacherLibrary';
import ManageAssignments from './pages/teachers/manageAssignments';
import UploadNotes from './pages/teachers/uploadNotes';
import TeachersAnnouncements from './pages/teachers/Announcement';
import FeedbackManagement from './pages/teachers/FeedbackForm';
import Schedule from './pages/teachers/Schedule';
import TeacherSyllabus from './pages/teachers/TeacherSyllabus';
import FacultySpace from './pages/teachers/FacultySpace'
import StudentProgress from './pages/teachers/StudentProgress';

import StudentsVerify from './pages/teachers/verifyStudentData';
import AssociatePublishResults from './pages/teachers/publishResults';
import ExamScheduleCreator from './pages/teachers/examSchedular';
import CreateAnnouncement from './pages/teachers/AnnouncementPage';
import CollegeResources from './pages/teachers/uploadResources';
import TimetableUploader from './pages/teachers/UploadTT';
import TeacherSchedules from './pages/teachers/TeachersSchedules';
import AchievementsManager from './pages/teachers/AchievementsManager';
import StudentsTickets from './pages/teachers/StudentsTickets';
import AssociateTickets from './pages/teachers/AssociateTickets';
import StudentFeeStatus from './pages/teachers/StudentFeesStatus';
import StudentsList from './pages/teachers/StudentsList';

import Home from './pages/students/home';
import Attendance from './pages/students/attendance';
import Results from './pages/students/result';
import Library from './pages/students/library';
import ExamSchedule from './pages/students/examSchedule';
import HolidaysPage from './pages/students/holidays';
import Assignment from './pages/students/assignment';
import Notes from './pages/students/notes';
import Notices from './pages/students/notices';
import StudentEvents from './pages/students/Events';
import StudentsResources from './pages/students/Eresources';
import Feedback from './pages/students/Feedback';
import Timetable from './pages/students/Timetable&Syllabus';
import Syllabus from './pages/students/Syllabus';
import Achievements from './pages/students/Achievements';
import Assistance from './pages/students/Assistance';
import Fees from './pages/students/Fees';

const API_URL = import.meta.env.VITE_API_BASE_URL;
// Ping backend /status or fail → backend is sleeping
async function pingBackend() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${API_URL}/status`, { signal: controller.signal });

    clearTimeout(timeout);
    return res.ok; // Backend is awake
  } catch {
    return false; // Still sleeping
  }
}

export default function App() {
  const { role, loading } = useContext(AuthContext);
  const [waking, setWaking] = useState(true);
  useEffect(() => {
    let interval;

    async function pollBackend() {
      const awake = await pingBackend();
      if (awake) {
        setWaking(false);
        clearInterval(interval);
      }
    }

    // First loading check
    pollBackend();
     // Re-check every 5 seconds until backend wakes
     interval = setInterval(pollBackend, 5000);

     return () => clearInterval(interval);
   }, []);
 
   // Loading UI for cold start
   if (waking) {
     return (
       <Box
         display="flex"
         justifyContent="center"
         alignItems="center"
         minHeight="100vh"
         sx={{ flexDirection: "column" }}
       >
         <CircularProgress size={60} />
         <Typography sx={{ mt: 2 }} variant="h6" color="text.secondary">
           Warming up the server…
         </Typography>
       </Box>
     );
   }
  return (
    <>
      <CssBaseline />
      <Routes>
        {/* Public Routes */}
        <Route element={<ProtectedRoute allowedRoles={["Guest"]} />} >
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>
        
          <Route path="/test" element={<Test/>} />
          <Route path="/settings" element={<Settings />} />

        <Route element={<ProtectedRoute allowedRoles={["unverified", "verified"]} />} >
          <Route path="/message" element={<Message />} />
        </Route>

        {/* Student Routes */}
        <Route element={<ProtectedRoute allowedRoles={['Student']} />}>
          <Route path="/home" element={<Home />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/result" element={<Results />} />
          <Route path="/library" element={<Library />} />
          <Route path="/exams" element={<ExamSchedule />} />
          <Route path="/holidays" element={<HolidaysPage />} />
          <Route path="/assignments" element={<Assignment />} />
          <Route path='/notes' element={<Notes/>}/>
          <Route path='/notices' element={<Notices/>}/>
          <Route path='/events' element={<StudentEvents/>}/>
          <Route path='/Eresources' element={<StudentsResources/>}/>
          <Route path='/feedback' element={<Feedback/>}/>
          <Route path="/timetable_syllabus" element={<Timetable/>}/>
          <Route path="/syllabus" element={<Syllabus/>}/>
          <Route path="/achievements" element={<Achievements/>}/>
          <Route path="/assistance" element={<Assistance/>}/>
          <Route path="/dues" element={<Fees/>}/>
        </Route>

        {/* Teacher Routes */}
        <Route element={<ProtectedRoute allowedRoles={['Teacher', 'CollegeAssociate']} />}>
          <Route path="/teacher" element={<TeacherHome />} />
          <Route path="/teacher/attendance" element={<AttendanceTaking />} />
          <Route path="/teacher/results" element={< ResultUpdate />} />
          <Route path="/teacher/library" element={<TeacherLibrary />} />
          <Route path="/teacher/assignments" element={<ManageAssignments />} />
          <Route path='/teacher/upload-notes' element={<UploadNotes />} />
          <Route path='/teacher/announcement' element={<TeachersAnnouncements/>}/>
          <Route path='/teacher/feedback' element={<FeedbackManagement/>}/>
          <Route path='/teacher/schedule' element={<Schedule/>}/>
          <Route path='/teacher/syllabus' element={<TeacherSyllabus/>}/>
          <Route path='/teacher/chat' element={<FacultySpace/>}/>
          <Route path='/teacher/progress' element={<StudentProgress/>}/>
          <Route path='/teacher/Eresources' element={<StudentsResources/>}/>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['CollegeAssociate']} />}>
          <Route path="/college/publish-results" element={< AssociatePublishResults />} />
          <Route path="/college/verify-students" element={<StudentsVerify/>} />
          <Route path="/college/exam-schedule-create" element={<ExamScheduleCreator/>} />
          <Route path='/college/announcement' element={< CreateAnnouncement/>} />
          <Route path='/college/eresources' element={<CollegeResources/>}/>
          <Route path='/college/timetable' element={<TimetableUploader/>}/>
          <Route path='/college/teacher_schedules' element={<TeacherSchedules/>}/>
          <Route path='/college/achievements' element={<AchievementsManager/>}/>
          <Route path='/college/student-tickets' element={<StudentsTickets/>}/>
          <Route path="/associate/tickets" element={<AssociateTickets/>}/>
          <Route path="/college/fees-status" element={<StudentFeeStatus/>}/>
          <Route path="/college/students" element={<StudentsList/>}/>
        </Route>

        {/* Admin Routes */}
        <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
          <Route path="/admin" element={<AdminHome />} />
          <Route path="/admin/student-approval" element={<StudentApproval />} />
          <Route path="/admin/add-teacher" element={<AddTeacher />} />
          <Route path='/admin/announcements' element={<AdminAnnouncements/>}/>
          <Route path='/admin/syllabus' element={<SyllabusManager/>}/>
          <Route path="/admin/tickets" element={<Tickets/>}/>
          <Route path="/admin/billing" element={<FeeManager/>}/>
          <Route path="/admin/space" element={<FacultySpace/>}/>
          <Route path="/admin/lists" element={<UsersList/>}/>
          <Route path="/admin/executeDB" element={<DBWorkbench/>}/>
          <Route path="/admin/user-details" element={<UserDetails/>}/>
          <Route path='/admin/college_courses' element={<AdminCatalogManager/>}/>
          <Route path="/admin/library" element={<UniLibrary/>}/>
        </Route>

        {/* Default Redirect */}
        <Route path="*" element={
            loading ? <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
            <CircularProgress size={60} />
            <Typography sx={{ ml: 2 }} variant="h6" color="text.secondary">
              Getting things ready…
            </Typography>
          </Box> :
            <Navigate
              to={
                role === 'Admin' ? '/admin' :
                role === 'Teacher' ? '/teacher' :
                role === 'CollegeAssociate' ? '/teacher' :
                role === 'Student' ? '/home' :
                role === 'verified' || role === 'unverified' ? '/message' :
                '/login'
              } replace
            />
          }
        />
      </Routes>
    </>
  );
}
