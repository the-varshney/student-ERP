import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Box, Stack, Typography, Button, Dialog, DialogTitle, DialogContent, IconButton, Chip, Paper, List, ListItem, 
  ListItemText, ListItemSecondaryAction, Alert, CircularProgress, TextField, Tabs, Tab, InputAdornment,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import axios from 'axios';
import { db } from '../../firebase/Firebase';
import { collection, onSnapshot, query, limit } from 'firebase/firestore';
import AuthContext from '../../context/AuthContext';
import AnnouncementForm from '../../components/announcementForm';
import { HeaderBackButton } from '../../components/header';

const ALL_COLLEGES_KEY = 'C000';
const normalizeCurrentUser = (u = {}) => {
  const fullName = [u.firstName || '', u.lastName || ''].filter(Boolean).join(' ') || 'Unknown User';
  return {
    uid: u.firebaseId || u.uid || '',
    displayName: u.displayName || fullName,
    role: u.isCollegeAssociate ? 'CollegeAssociate' : u.role || 'Teacher',
    collegeId: u.college || u.collegeId || '',
  };
};

const tsToMs = (t) => {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  return 0;
};

//cache (1 hour)
const CACHE_TTL = 1000 * 60 * 60;
const setCache = (key, data) =>
  localStorage.setItem(key, JSON.stringify({ data, expiry: Date.now() + CACHE_TTL }));
const getCache = (key) => {
  const cached = localStorage.getItem(key);
  if (!cached) return null;
  try {
    const parsed = JSON.parse(cached);
    if (Date.now() > parsed.expiry) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
};

export default function CreateAnnouncement() {
  const { userDetails, authLoading, role } = useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [myCollegeOnly, setMyCollegeOnly] = useState(true);
  const [allNotices, setAllNotices] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [queryError, setQueryError] = useState('');
  // College list to show readable names for chips
  const [collegeOptions, setCollegeOptions] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [collegesLoading, setCollegesLoading] = useState(false);
  const normalizedUser = useMemo(() => normalizeCurrentUser(userDetails), [userDetails]);
  const effectiveCollegeId = useMemo(() => normalizedUser.collegeId || '', [normalizedUser]);

  // College ID -> name map
  const collegeNameMap = useMemo(() => {
    const map = new Map();
    collegeOptions.forEach((c) => map.set(c.id, c.name || c.id));
    return map;
  }, [collegeOptions]);

  // Fetch college options from Mongo API (for name labels)
  useEffect(() => {
    let mounted = true;
    const key = 'associate_all_colleges';
    (async () => {
      setCollegesLoading(true);
      try {
        const cached = getCache(key);
        if (cached) {
          if (mounted) setCollegeOptions(cached);
        } else {
          const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/colleges`);
          const data = Array.isArray(res.data) ? res.data : [];
          const normalized = data
            .map((c) => ({
              id: String(c._id || c.id || c.code || '').trim(),
              name: c.name || String(c._id || c.id || c.code || 'Unknown'),
            }))
            .filter((c) => c.id);
          setCache(key, normalized);
          if (mounted) setCollegeOptions(normalized);
        }
      } catch (e) {
        console.log(e);
        if (mounted) setCollegeOptions([]);
      } finally {
        if (mounted) setCollegesLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setQueryError('');
    const qN = query(collection(db, 'Notices'), limit(800));
    const qE = query(collection(db, 'Events'), limit(800));

    const unsubN = onSnapshot(
      qN,
      (snap) => {
        if (!mounted) return;
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data(), type: 'notice' }));
        setAllNotices(rows);
      },
      (err) => {
        if (!mounted) return;
        setQueryError('Failed to load notices: ' + err.message);
      }
    );

    const unsubE = onSnapshot(
      qE,
      (snap) => {
        if (!mounted) return;
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data(), type: 'event' }));
        setAllEvents(rows);
      },
      (err) => {
        if (!mounted) return;
        setQueryError('Failed to load events: ' + err.message);
      }
    );

    return () => {
      mounted = false;
      unsubN();
      unsubE();
    };
  }, []);

  // Filters
  const filterBySearch = (rows) => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const s = [
        r.title,
        r.description,
        r.audience,
        r.collegeId,
        collegeNameMap.get(String(r.collegeId)) || '',
        r.pdfName,
        r.location,
        r.eventDate,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return s.includes(q);
    });
  };

  const filterByMyCollege = (rows) => {
    if (!myCollegeOnly) return rows;
    return rows.filter((r) => r.collegeId === effectiveCollegeId || r.collegeId === ALL_COLLEGES_KEY);
  };

  const noticesDisplay = useMemo(() => {
    const base = [...allNotices].sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));
    return filterByMyCollege(filterBySearch(base));
  }, [allNotices, search, myCollegeOnly, effectiveCollegeId, collegeNameMap]);

  const eventsDisplay = useMemo(() => {
    const base = [...allEvents].sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));
    return filterByMyCollege(filterBySearch(base));
  }, [allEvents, search, myCollegeOnly, effectiveCollegeId, collegeNameMap]);

  // Actions
  const openCreate = () => {
    setEditItem(null);
    setOpen(true);
  };
  const openEdit = (item) => {
    setEditItem(item);
    setOpen(true);
  };
  const closeDialog = () => {
    setOpen(false);
    setEditItem(null);
  };

  // Permissions
  const cannotCreate = !normalizedUser.uid || !effectiveCollegeId || role !== 'CollegeAssociate';

  if (authLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!userDetails) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="warning">Please log in to view this page.</Alert>
      </Box>
    );
  }

  if (role !== 'CollegeAssociate') {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Access denied. Only College Associates can manage announcements.</Alert>
      </Box>
    );
  }

  // Current list by tab
  const currentList = tab === 0 ? noticesDisplay : eventsDisplay;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, minHeight:"100vh" }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Stack direction="row" spacing={2} alignItems="center">
          <HeaderBackButton/>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Announcements
          </Typography>
          <Chip size="small" color="primary" variant="outlined" label={`College: ${effectiveCollegeId || '—'}`} />
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            variant={myCollegeOnly ? 'contained' : 'outlined'}
            color="primary"
            onClick={() => setMyCollegeOnly((v) => !v)}
          >
            {myCollegeOnly ? 'My College Only' : 'Show All Colleges'}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openCreate}
            disabled={cannotCreate}
          >
            New Announcement
          </Button>
        </Stack>
      </Stack>

      {cannotCreate && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Missing identity. Ensure user.uid and collegeId are available.
        </Alert>
      )}

      {queryError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {queryError}
        </Alert>
      )}

      {/* Controls */}
      <Paper sx={{ p: 1, mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile>
          <Tab label={`Notices (${noticesDisplay.length})`} />
          <Tab label={`Events (${eventsDisplay.length})`} />
        </Tabs>
      </Paper>

      <TextField
        placeholder="Search title, description, college, audience..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        fullWidth
        size="small"
        sx={{ mb: 2 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />

      {/* List */}
      <Paper elevation={1}>
        <List dense>
          {currentList.length === 0 && (
            <ListItem>
              <ListItemText
                primary="No announcements found."
                primaryTypographyProps={{ component: 'div' }}
              />
            </ListItem>
          )}

          {currentList.map((item) => {
            const created = item.createdAt?.toDate
              ? item.createdAt.toDate().toLocaleString()
              : '—';

            const isEvent = item.type === 'event';
            const collegeLabel =
              item.collegeId === ALL_COLLEGES_KEY
                ? 'All Colleges'
                : collegeNameMap.get(String(item.collegeId)) || String(item.collegeId || '—');

            const summaryParts = [
              item.description || '',
              `Audience: ${item.audience}`,
              isEvent
                ? [
                    item.eventDate ? `Date: ${item.eventDate}` : null,
                    item.startTime ? `Start: ${item.startTime}` : null,
                    item.endTime ? `End: ${item.endTime}` : null,
                    item.location ? `Location: ${item.location}` : null,
                  ]
                    .filter(Boolean)
                    .join(' | ')
                : null,
              item.pdfName ? `PDF: ${item.pdfName}` : null,
            ]
              .filter(Boolean)
              .join(' • ');

            return (
              <ListItem key={`${item.type}-${item.id}`} divider>
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }} component="span">
                        {item.title}
                      </Typography>
                      <Chip
                        size="small"
                        label={isEvent ? 'Event' : 'Notice'}
                        color={isEvent ? 'secondary' : 'primary'}
                      />
                      <Chip
                        size="small"
                        variant={collegeLabel === 'All Colleges' ? 'filled' : 'outlined'}
                        color={collegeLabel === 'All Colleges' ? 'success' : 'default'}
                        label={collegeLabel}
                      />
                    </Stack>
                  }
                  secondary={
                    <Stack spacing={0.5}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }} component="div">
                        {created}
                      </Typography>
                      {summaryParts && (
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }} component="div">
                          {summaryParts}
                        </Typography>
                      )}
                    </Stack>
                  }
                  primaryTypographyProps={{ component: 'div' }}
                  secondaryTypographyProps={{ component: 'div' }}
                />
                <ListItemSecondaryAction>
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => openEdit(item)}
                  >
                    Edit
                  </Button>
                </ListItemSecondaryAction>
              </ListItem>
            );
          })}
        </List>
      </Paper>

      {/* Dialog: Create/Edit */}
      <Dialog open={open} onClose={closeDialog} fullWidth maxWidth="md">
        <DialogTitle>
          {editItem ? 'Edit Announcement' : 'Create Announcement'}
          <IconButton
            aria-label="close"
            onClick={closeDialog}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <AnnouncementForm
            mode={editItem ? 'edit' : 'create'}
            initialType={editItem?.type || (tab === 1 ? 'event' : 'notice')}
            defaultValues={editItem || undefined}
            collegeId={effectiveCollegeId}
            currentUser={normalizedUser}
            onSaved={closeDialog}
            onCancel={closeDialog}
          />
        </DialogContent>
      </Dialog>
    </Box>
  );
}
