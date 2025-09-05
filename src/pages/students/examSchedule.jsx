/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Box, Container, Typography, Card, CardContent, Chip, IconButton,
  Alert, CircularProgress, Stack, FormControl, InputLabel, Select, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Tabs, Tab, Tooltip
} from '@mui/material';
import {
  CalendarToday as CalendarIcon,
  Refresh as RefreshIcon,
  Assignment as AssignmentIcon,
  Schedule as ScheduleIcon,
  DoneAll as DoneAllIcon,
  Upcoming as UpcomingIcon
} from '@mui/icons-material';
import axios from 'axios';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

import { auth, db } from '../../firebase/Firebase';
import { doc, getDoc } from 'firebase/firestore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const TZ = 'Asia/Kolkata';

// Helpers  
const parseTime12h = (str) => 
                     (typeof str === 'string' && str.trim() ? dayjs(str.trim(), 'hh:mm A', true) : null);
const combineDayAndTime = (d, t) =>  
                          (d && t && d.isValid() && t.isValid() ? d.hour(t.hour()).minute(t.minute()).second(0).millisecond(0) : null);
const computeEndDateTime = (dateDjs, startTimeDjs, endTimeStr, durationHours) => 
  {
  const startDT = combineDayAndTime(dateDjs, startTimeDjs);
  if (!startDT) return null;
  if (endTimeStr && String(endTimeStr).trim()) {
    const endDjs = dayjs(String(endTimeStr).trim(), 'hh:mm A', true);
    if (!endDjs.isValid()) return null;
    let endDT = combineDayAndTime(dateDjs, endDjs);
    if (endDT && endDT.isBefore(startDT)) endDT = endDT.add(1, 'day');
    return endDT;
  }
  if (typeof durationHours === 'number' && durationHours > 0) return startDT.add(Math.round(durationHours * 60), 'minute');
  return null;
};
const formatDate = (d) => (d ? d.format('DD/MM/YYYY') : '—');
const formatTime = (s) => (s && String(s).trim() ? String(s).trim() : '—');

const ExamSchedule = () => {
  const [loading, setLoading] = useState(true);
  const [loadMsg, setLoadMsg] = useState('Loading profile...');
  const [error, setError] = useState('');
  const [studentFB, setStudentFB] = useState(null);
  const [studentInfo, setStudentInfo] = useState(null);
  const [filters, setFilters] = useState({
    collegeId: '',
    departmentId: '',
    programId: '',
    semester: '',
    academicYear: '',
    examMonthYear: ''
  });
  const [publishedDoc, setPublishedDoc] = useState(null);
  const [publishedList, setPublishedList] = useState([]);
  const [tab, setTab] = useState('upcoming');

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setLoading(true);
        const user = auth.currentUser;
        if (!user) {
          setError('Please log in to view exam schedule.');
          setLoading(false);
          return;
        }
        const sDoc = await getDoc(doc(db, 'Students', user.uid));
        if (!sDoc.exists()) {
          setError('Student profile not found.');
          setLoading(false);
          return;
        }
        const fb = sDoc.data();
        setStudentFB(fb);
        const response = await axios.get(`${API_BASE_URL}/api/attendance/student/${fb.firebaseId}`);
        const mongoStudent = response.data.student || {};
        setStudentInfo(mongoStudent);
        const currentYear = dayjs().tz(TZ).year();
        setFilters((p) => ({
          ...p,
          collegeId: fb.collegeId || '',
          departmentId: fb.department || '',
          programId: fb.program || mongoStudent.program || '',
          semester: String(mongoStudent.semester || fb.semester || ''),
          academicYear: `${currentYear - 1}-${currentYear}`,
          examMonthYear: dayjs().tz(TZ).format('MM/YYYY')
        }));
        setError('');
      } catch (e) {
        setError('Failed to initialize profile.');
      } finally {
        setLoading(false);
        setLoadMsg('');
      }
    };
    bootstrap();
  }, []);

  const canQueryPublic = useMemo(() => Boolean(filters.collegeId && filters.programId && filters.semester), [filters]);

  const fetchPublished = useCallback(async () => {
    if (!studentFB) return;
    setError('');
    setLoading(true);
    try {
      if (canQueryPublic) {
        setLoadMsg('Loading published schedule...');
        const res = await axios.get(`${API_BASE_URL}/api/exam-schedules/public`, {
          params: { collegeId: filters.collegeId, programId: filters.programId, semester: filters.semester, academicYear: filters.academicYear, examMonthYear: filters.examMonthYear }
        });
        setPublishedDoc(res.data || null);
        setPublishedList([]);
      } else {
        setLoadMsg('Loading published list...');
        const res = await axios.get(`${API_BASE_URL}/api/exam-schedules/list`, {
          params: { status: 'PUBLISHED', programId: filters.programId, semester: filters.semester }
        });
        setPublishedList(Array.isArray(res.data) ? res.data : []);
        setPublishedDoc(null);
      }
    } catch (e) {
      setPublishedDoc(null);
      setPublishedList([]);
      if (e?.response?.status !== 404) setError('Failed to load schedules.');
    } finally {
      setLoading(false);
      setLoadMsg('');
    }
  }, [studentFB, filters, canQueryPublic]);

  useEffect(() => {
    fetchPublished();
  }, [fetchPublished]);

  const handleRefresh = () => fetchPublished();

  const docToRows = (doc) => {
    if (!doc) return [];
    const list = Array.isArray(doc.exams) ? doc.exams : [];
    return list.map((ex, idx) => {
      const dateStr = ex.date ? String(ex.date).substring(0, 10) : '';
      const dateDjs = dateStr ? dayjs.tz(dateStr, 'YYYY-MM-DD', TZ, true) : null;
      const startTimeDjs = parseTime12h(ex.startTime || ex.time || '');
      const startDT = startTimeDjs ? combineDayAndTime(dateDjs, startTimeDjs) : null;
      const endDT = computeEndDateTime(dateDjs, startTimeDjs, ex.endTime || '', ex.durationHours);
      return {
        key: `${doc._id || 'pub'}-${idx}`,
        subjectId: ex.subjectId || '',
        course: ex.course || '',
        date: dateDjs,
        startLabel: formatTime(ex.startTime || ex.time || ''),
        endLabel: formatTime(ex.endTime || ''),
        durationLabel: typeof ex.durationHours === 'number' && ex.durationHours > 0 ? `${ex.durationHours} hours` : ex.duration || '',
        startDT,
        endDT
      };
    });
  };

  const rows = useMemo(() => (publishedDoc ? docToRows(publishedDoc) : publishedList.flatMap(docToRows)), [publishedDoc, publishedList]);
  const now = dayjs().tz(TZ); //use TZ for consistency
  const { upcoming, completed } = useMemo(() => {
    const upcomingArr = rows.filter((r) => r.endDT && r.endDT.isAfter(now));
    const completedArr = rows.filter((r) => !r.endDT || !r.endDT.isAfter(now));
    upcomingArr.sort((a, b) => (a.startDT || now).valueOf() - (b.startDT || now).valueOf());
    completedArr.sort((a, b) => (b.startDT || now).valueOf() - (a.startDT || now).valueOf());
    return { upcoming: upcomingArr, completed: completedArr };
  }, [rows, now]);
  const nextExam = useMemo(() => upcoming[0] || null, [upcoming]);
  const handlePeriodChange = (key) => (e) => setFilters((p) => ({ ...p, [key]: e.target.value }));

  const renderTable = (data, emptyText) => (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Subject</TableCell>
            <TableCell>Date</TableCell>
            <TableCell>Start</TableCell>
            <TableCell>End</TableCell>
            <TableCell>Duration</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} align="center" sx={{ py: 5 }}>
                <Typography variant="body2" color="text.secondary">{emptyText}</Typography>
              </TableCell>
            </TableRow>
          ) : (
            data.map((r) => (
              <TableRow key={r.key} hover>
                <TableCell>
                  <Typography sx={{ fontWeight: 700, display: 'inline' }}>{r.subjectId || '—'}:</Typography>{' '}
                  <Typography variant="body2" sx={{ display: 'inline' }}>{r.course || '—'}</Typography>
                </TableCell>
                <TableCell>{formatDate(r.date)}</TableCell>
                <TableCell>{r.startLabel}</TableCell>
                <TableCell>{r.endLabel}</TableCell>
                <TableCell>{r.durationLabel || '—'}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <Box sx={{ backgroundColor: (t) => t.palette.grey[100], minHeight: '100vh', py: 4 }}>
      <Container maxWidth="xl">
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" mb={3} spacing={2}>
          <Typography variant="h4" fontWeight="bold" color="primary.dark">Exam Schedule</Typography>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="body2" sx={{ fontWeight: 500, whiteSpace: 'nowrap', color: 'text.secondary' }}>
              College: {filters.collegeId}
            </Typography>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Program</InputLabel>
              <Select label="Program" value={filters.programId} onChange={handlePeriodChange('programId')}>
                <MenuItem value={filters.programId || ''}>{filters.programId || '—'}</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Semester</InputLabel>
              <Select label="Semester" value={filters.semester} onChange={handlePeriodChange('semester')}>
                <MenuItem value={filters.semester || ''}>{filters.semester || '—'}</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Academic Year</InputLabel>
              <Select label="Academic Year" value={filters.academicYear} onChange={handlePeriodChange('academicYear')}>
                <MenuItem value={filters.academicYear}>{filters.academicYear}</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Exam Month/Year</InputLabel>
              <Select label="Exam Month/Year" value={filters.examMonthYear} onChange={handlePeriodChange('examMonthYear')}>
                <MenuItem value={filters.examMonthYear}>{filters.examMonthYear}</MenuItem>
              </Select>
            </FormControl>
            <Tooltip title="Refresh Schedule">
              <span>
                <IconButton color="primary" onClick={handleRefresh} disabled={loading}>
                  <RefreshIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Stack>

        {loading && (
          <Box display="flex" alignItems="center" gap={2} sx={{ mb: 2 }}>
            <CircularProgress size={24} />
            <Typography variant="body2">{loadMsg || 'Loading schedule…'}</Typography>
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!error && (publishedDoc || publishedList.length > 0) && (
          <Stack spacing={3}>
            <Card variant="outlined" sx={{ borderRadius: 2, boxShadow: 1 }}>
              <CardContent>
                <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} gap={2}>
                  <AssignmentIcon color="primary" sx={{ fontSize: 40 }} />
                  <Box flexGrow={1}>
                    <Typography variant="h6" fontWeight="bold">Next Exam</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Chip icon={<UpcomingIcon />} color="primary" label={`${upcoming.length} upcoming`} />
                    <Chip icon={<DoneAllIcon />} variant="outlined" label={`${completed.length} completed`} />
                  </Box>
                </Stack>
                <Box sx={{ mt: 2, p: 2, backgroundColor: (t) => t.palette.action.hover, borderRadius: 1, border: '1px solid', borderColor: (t) => t.palette.divider }}>
                  {nextExam ? (
                    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Chip label={nextExam.subjectId || '—'} color="secondary" size="small" sx={{ fontWeight: 'bold' }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{nextExam.course || '—'}</Typography>
                      <Chip icon={<CalendarIcon />} label={formatDate(nextExam.date)} size="small" />
                      <Chip icon={<ScheduleIcon />} label={`${nextExam.startLabel} → ${nextExam.endLabel}`} size="small" />
                      {nextExam.durationLabel && <Chip label={nextExam.durationLabel} variant="outlined" size="small" />}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                      No upcoming exams found.
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
            <Box sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tab value="upcoming" label={`Upcoming (${upcoming.length})`} />
                <Tab value="completed" label={`Completed (${completed.length})`} />
              </Tabs>
              {tab === 'upcoming' ? renderTable(upcoming, 'No upcoming exams.') : renderTable(completed, 'No completed exams.')}
            </Box>
          </Stack>
        )}

        {!error && !loading && !publishedDoc && publishedList.length === 0 && (
          <Alert severity="info">No published schedules available for the selected filters.</Alert>
        )}
      </Container>
    </Box>
  );
};

export default ExamSchedule;