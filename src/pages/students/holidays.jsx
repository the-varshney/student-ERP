/* eslint-disable no-unused-vars */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Container, Typography, Card, CardContent, Stack, FormControl, InputLabel, Select, MenuItem,
  Button, IconButton, Alert, CircularProgress, Tabs, Tab, Table, TableHead, TableBody,
  TableRow, TableCell, TableContainer, Paper, Chip
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import {
  Refresh as RefreshIcon,
  Event as EventIcon,
  Upcoming as UpcomingIcon,
  Today as TodayIcon
} from '@mui/icons-material';
import axios from 'axios';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import SecondaryHeader from '../../components/secondaryHeader';
import { HeaderBackButton } from '../../components/header';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const TZ = 'Asia/Kolkata';

const TYPES = ['Gazetted', 'Restricted', 'Observance'];

const formatDate = (d) => (d ? dayjs(d).tz(TZ).format('DD/MM/YYYY') : '—');

const NS = 'erp';
const VER = 'v1';
const STORE = typeof window !== 'undefined' ? window.localStorage : null;
const LAST_UID_KEY = `${NS}:lastUid:${VER}`;
const key = (uid, name) => `${NS}:${uid}:${name}:${VER}`;

const readCachedStudent = () => {
  if (!STORE) return null;
  const uid = STORE.getItem(LAST_UID_KEY);
  if (!uid) return null;
  const raw = STORE.getItem(key(uid, 'student'));
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw);
    return payload?.v || null; 
  } catch {
    return null;
  }
};

const Holidays = () => {
  const [tab, setTab] = useState('all'); 
  const [loading, setLoading] = useState(true);
  const [loadMsg, setLoadMsg] = useState('Loading holidays…');
  const [error, setError] = useState('');

  const [student, setStudent] = useState(null);

  const nowTz = dayjs().tz(TZ);
  const [year, setYear] = useState(nowTz.year());
  const [month, setMonth] = useState('');
  const [type, setType] = useState('');
  const [startDate, setStartDate] = useState(null); // dayjs
  const [endDate, setEndDate] = useState(null);     // dayjs
  const [rows, setRows] = useState([]);             // list of data
  const [upcoming, setUpcoming] = useState([]);

  // read cached student once
  useEffect(() => {
    const s = readCachedStudent();
    setStudent(s || null);
  }, []);

  const years = useMemo(() => {
    const base = nowTz.year();
    const spread = [];
    for (let y = base - 2; y <= base + 2; y += 1) spread.push(y);
    return spread;
  }, [nowTz]);

  const buildAllParams = useCallback(() => {
    const params = {};
    if (student?.collegeId) params.collegeId = String(student.collegeId);

    if (type) params.type = type;
    const hasRange = !!startDate || !!endDate;
    if (hasRange) {
      if (startDate?.isValid?.()) params.start = startDate.tz(TZ).format('YYYY-MM-DD');
      if (endDate?.isValid?.()) params.end = endDate.tz(TZ).format('YYYY-MM-DD');
      return params;
    }
    if (year) params.year = year;
    if (month) params.month = month;
    return params;
  }, [student?.collegeId, type, startDate, endDate, year, month]);

  const fetchAll = useCallback(async () => {
    setError('');
    setLoading(true);
    setLoadMsg('Loading holidays…');
    try {
      const params = buildAllParams();
      const res = await axios.get(`${API_BASE_URL}/api/holidays`, { params });
      const list = Array.isArray(res.data) ? res.data : [];
      list.sort((a, b) => new Date(a.date).valueOf() - new Date(b.date).valueOf());
      setRows(list);
    } catch (e) {
      setRows([]);
      setError('Failed to fetch holidays.');
    } finally {
      setLoading(false);
      setLoadMsg('');
    }
  }, [buildAllParams]);

  const fetchUpcoming = useCallback(async () => {
    setError('');
    setLoading(true);
    setLoadMsg('Loading upcoming holidays…');
    try {
      const from = dayjs().tz(TZ).format('YYYY-MM-DD');
      const params = { from };
      if (student?.collegeId) params.collegeId = String(student.collegeId);

      const res = await axios.get(`${API_BASE_URL}/api/holidays/upcoming`, { params });
      const list = Array.isArray(res.data) ? res.data : [];
      list.sort((a, b) => new Date(a.date).valueOf() - new Date(b.date).valueOf());
      setUpcoming(list);
    } catch (e) {
      setUpcoming([]);
      setError('Failed to fetch upcoming holidays.');
    } finally {
      setLoading(false);
      setLoadMsg('');
    }
  }, [student?.collegeId]);

  const refresh = useCallback(async () => {
    if (tab === 'all') {
      await fetchAll();
    } else {
      await fetchUpcoming();
    }
  }, [tab, fetchAll, fetchUpcoming]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refetch All on filter changes
  useEffect(() => {
    if (tab === 'all') {
      fetchAll();
    }
  }, [year, month, type, startDate, endDate, student?.collegeId]);

  // Reset filters helper
  const resetFilters = () => {
    setYear(nowTz.year());
    setMonth('');
    setType('');
    setStartDate(null);
    setEndDate(null);
  };

  const dataForTab = tab === 'all' ? rows : upcoming;

  const renderTable = (data) => (
    <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            <TableCell>Day</TableCell>
            <TableCell>Holiday</TableCell>
            <TableCell>Type</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                <Typography variant="body2" color="text.secondary">
                  No holidays found for the selected filters.
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            data.map((h) => {
              const d = dayjs(h.date).tz(TZ);
              return (
                <TableRow key={`${h.name}-${h.date}`}>
                  <TableCell>{formatDate(h.date)}</TableCell>
                  <TableCell>{d.format('dddd')}</TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{h.name}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={h.type}
                      color={h.type === 'Gazetted' ? 'success' : h.type === 'Restricted' ? 'warning' : 'default'}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ backgroundColor: (t) => t.palette.grey, minHeight: '100vh', py: 4 }}>
        <Container maxWidth="xl">
          <SecondaryHeader
                    title="Holidays"
                    leftArea={<><HeaderBackButton /><EventIcon fontSize="large" color="primary" /></>}
                    rightArea={
                      <IconButton color="primary" onClick={refresh} disabled={loading}>
                    <RefreshIcon />
                  </IconButton>
                    }
                    
                  />

          {/* Tabs: All or Upcoming */}
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tab value="all" label="All" />
            <Tab value="upcoming" label="Upcoming" icon={<UpcomingIcon />} iconPosition="start" />
          </Tabs>

          {/* Filter tabs */}
          {tab === 'all' && (
            <Card variant="outlined" sx={{ mt: 2 }}>
              <CardContent>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" useFlexGap flexWrap="wrap">
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>Year</InputLabel>
                    <Select label="Year" value={year} onChange={(e) => setYear(e.target.value)}>
                      {years.map((y) => (
                        <MenuItem key={y} value={y}>{y}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>Month</InputLabel>
                    <Select label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
                      <MenuItem value="">All months</MenuItem>
                      {[...Array(12)].map((_, i) => (
                        <MenuItem key={i + 1} value={i + 1}>
                          {dayjs().month(i).format('MMMM')}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 160 }}>
                    <InputLabel>Type</InputLabel>
                    <Select label="Type" value={type} onChange={(e) => setType(e.target.value)}>
                      <MenuItem value="">All types</MenuItem>
                      {TYPES.map((t) => (
                        <MenuItem key={t} value={t}>{t}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                    <DatePicker
                      label="From date"
                      value={startDate}
                      onChange={(v) => setStartDate(v)}
                      slotProps={{ textField: { size: 'small' } }}
                      views={['year', 'month', 'day']}
                    />
                    <DatePicker
                      label="To date"
                      value={endDate}
                      onChange={(v) => setEndDate(v)}
                      slotProps={{ textField: { size: 'small' } }}
                      views={['year', 'month', 'day']}
                    />
                  </Stack>

                  <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
                    <Button variant="outlined" onClick={resetFilters}>Reset</Button>
                    <Button variant="contained" onClick={fetchAll} startIcon={<TodayIcon />}>
                      Apply
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          )}

          {loading && (
            <Box display="flex" alignItems="center" gap={2} sx={{ mt: 2 }}>
              <CircularProgress size={22} />
              <Typography variant="body2">{loadMsg || 'Loading…'}</Typography>
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}

          {!loading && !error && (
            <>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2, flexWrap: 'wrap' }}>
                <Chip label={`${dataForTab.length} holidays`} size="small" />
                {student?.collegeId && <Chip label={`College: ${student.collegeId}`} size="small" variant="outlined" />}
                {tab === 'all' && (
                  <>
                    {type && <Chip label={`Type: ${type}`} size="small" color="primary" variant="outlined" />}
                    {startDate && <Chip label={`From: ${startDate.tz(TZ).format('DD/MM/YYYY')}`} size="small" variant="outlined" />}
                    {endDate && <Chip label={`To: ${endDate.tz(TZ).format('DD/MM/YYYY')}`} size="small" variant="outlined" />}
                    {!!month && <Chip label={`Month: ${dayjs().month(month - 1).format('MMMM')}`} size="small" variant="outlined" />}
                    <Chip label={`Year: ${year}`} size="small" variant="outlined" />
                  </>
                )}
                {tab === 'upcoming' && <Chip label="From today" size="small" variant="outlined" />}
              </Stack>

              {renderTable(dataForTab)}
            </>
          )}
        </Container>
      </Box>
    </LocalizationProvider>
  );
};

export default Holidays;
