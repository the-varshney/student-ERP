import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Chip,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Alert,
  CircularProgress,
  TextField,
  Autocomplete,
  Tabs,
  Tab,
  InputAdornment,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import axios from 'axios';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../firebase/Firebase';
import AuthContext from '../../context/AuthContext';
import AnnouncementForm from '../../components/announcementForm';
import SecondaryHeader from "../../components/secondaryHeader";
import { HeaderBackButton } from "../../components/header";

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

const ALL_COLLEGES_KEY = 'C000';

const tsToMs = (t) => {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  return 0;
};

const groupByBatch = (items) => {
  const groups = new Map();
  for (const it of items) {
    const key = it.batchId || it.id;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        type: it.type,
        docs: [],
        colleges: new Set(),
        first: it,
        targetAll: !!it.targetAll || it.collegeId === ALL_COLLEGES_KEY,
      });
    }
    const g = groups.get(key);
    g.docs.push(it);
    if (it.collegeId) g.colleges.add(String(it.collegeId));
    if (it.targetAll || it.collegeId === ALL_COLLEGES_KEY) g.targetAll = true;
    if (tsToMs(it.createdAt) > tsToMs(g.first.createdAt)) g.first = it;
  }
  return Array.from(groups.values()).sort(
    (a, b) => tsToMs(b.first.createdAt) - tsToMs(a.first.createdAt)
  );
};

export default function AdminAnnouncements() {
  const { userDetails, user, authLoading, role } = useContext(AuthContext);
  const [authUid, setAuthUid] = useState('');
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setAuthUid(u?.uid || ''));
    return () => unsub();
  }, []);
  const adminUid = user?.uid || authUid || userDetails?.uid || userDetails?.firebaseId || '';

  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');

  const [open, setOpen] = useState(false);
  const [targetAll, setTargetAll] = useState(false);
  const [selectedColleges, setSelectedColleges] = useState([]);
  const [collegeOptions, setCollegeOptions] = useState([]);
  const [collegesLoading, setCollegesLoading] = useState(false);

  const [noticesMine, setNoticesMine] = useState([]);
  const [eventsMine, setEventsMine] = useState([]);
  const [noticesAll, setNoticesAll] = useState([]);
  const [eventsAll, setEventsAll] = useState([]);

  const [queryError, setQueryError] = useState('');
  const [editGroup, setEditGroup] = useState(null);

  // eslint-disable-next-line no-unused-vars
  const allCollegeIds = useMemo(
    () => collegeOptions.filter((c) => c.id && c.id !== '*').map((c) => c.id),
    [collegeOptions]
  );
  const collegeNameMap = useMemo(() => {
    const map = new Map();
    collegeOptions.forEach((c) => map.set(c.id, c.name || c.id));
    return map;
  }, [collegeOptions]);

  // Colleges via Mongo API
  useEffect(() => {
    let mounted = true;
    const key = 'admin_all_colleges';
    (async () => {
      setCollegesLoading(true);
      try {
        const cached = getCache(key);
        const normalize = (data) =>
          (Array.isArray(data) ? data : [])
            .map((c) => ({
              id: String(c._id || c.id || c.code || '').trim(),
              name: c.name || String(c._id || c.id || c.code || 'Unknown'),
            }))
            .filter((c) => c.id);
        if (cached) {
          if (mounted) setCollegeOptions([{ id: '*', name: 'All Colleges' }, ...cached]);
        } else {
          const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/colleges`);
          const normalized = normalize(res.data);
          setCache(key, normalized);
          if (mounted) setCollegeOptions([{ id: '*', name: 'All Colleges' }, ...normalized]);
        }
      } catch (e) {
        console.error('Failed to fetch colleges', e);
        if (mounted) setCollegeOptions([{ id: '*', name: 'All Colleges' }]);
      } finally {
        if (mounted) setCollegesLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  //Created by me
  useEffect(() => {
    if (!adminUid) return;
    let mounted = true;
    setQueryError('');

    const qNotices = query(collection(db, 'Notices'), where('createdBy.uid', '==', adminUid), limit(500));
    const qEvents = query(collection(db, 'Events'), where('createdBy.uid', '==', adminUid), limit(500));

    const unsubA = onSnapshot(
      qNotices,
      (snap) => {
        if (!mounted) return;
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data(), type: 'notice' }));
        setNoticesMine(rows);
      },
      (err) => {
        if (!mounted) return;
        console.error('Admin notices error', err);
        setQueryError('Failed to load notices: ' + err.message);
      }
    );

    const unsubB = onSnapshot(
      qEvents,
      (snap) => {
        if (!mounted) return;
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data(), type: 'event' }));
        setEventsMine(rows);
      },
      (err) => {
        if (!mounted) return;
        console.error('Admin events error', err);
        setQueryError('Failed to load events: ' + err.message);
      }
    );

    return () => {
      mounted = false;
      unsubA();
      unsubB();
    };
  }, [adminUid]);

  // All
  useEffect(() => {
    let mounted = true;
    const qAllN = query(collection(db, 'Notices'), limit(800));
    const qAllE = query(collection(db, 'Events'), limit(800));

    const unsubN = onSnapshot(
      qAllN,
      (snap) => {
        if (!mounted) return;
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data(), type: 'notice' }));
        setNoticesAll(rows);
      },
      (err) => {
        if (!mounted) return;
        console.error('All notices error', err);
      }
    );
    const unsubE = onSnapshot(
      qAllE,
      (snap) => {
        if (!mounted) return;
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data(), type: 'event' }));
        setEventsAll(rows);
      },
      (err) => {
        if (!mounted) return;
        console.error('All events error', err);
      }
    );

    return () => {
      mounted = false;
      unsubN();
      unsubE();
    };
  }, []);

  const groupedMine = useMemo(() => groupByBatch([...noticesMine, ...eventsMine]), [noticesMine, eventsMine]);

  const filteredAllNotices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = [...noticesAll].sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));
    if (!q) return rows;
    return rows.filter((r) => {
      const s = [
        r.title,
        r.description,
        r.audience,
        r.collegeId,
        collegeNameMap.get(String(r.collegeId)) || '',
        r.pdfName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return s.includes(q);
    });
  }, [noticesAll, search, collegeNameMap]);

  const filteredAllEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = [...eventsAll].sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));
    if (!q) return rows;
    return rows.filter((r) => {
      const s = [
        r.title,
        r.description,
        r.audience,
        r.collegeId,
        collegeNameMap.get(String(r.collegeId)) || '',
        r.location,
        r.eventDate,
        r.pdfName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return s.includes(q);
    });
  }, [eventsAll, search, collegeNameMap]);

  const openCreate = () => {
    setEditGroup(null);
    setOpen(true);
  };

  const openEdit = (group) => {
    setEditGroup(group);
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setEditGroup(null);
  };

  const handleSelectColleges = (vals) => {
    const ids = vals.map((v) => v.id || v).map(String);
    if (ids.includes('*')) {
      setTargetAll(true);
      setSelectedColleges([ALL_COLLEGES_KEY]); //C000
    } else {
      setTargetAll(false);
      setSelectedColleges(ids);
    }
  };

  const selectedAutocompleteValue = useMemo(() => {
    if (targetAll) {
      return collegeOptions.filter((o) => o.id === '*');
    }
    return collegeOptions.filter((o) => selectedColleges.includes(o.id));
  }, [targetAll, selectedColleges, collegeOptions]);

  const handleCreated = async (created) => {
    const collName = created.type === 'event' ? 'Events' : 'Notices';
    const batchId = created.batchId || created.id;

    try {
      await updateDoc(doc(db, collName, created.id), {
        batchId,
        ...(targetAll ? { targetAll: true, collegeId: ALL_COLLEGES_KEY } : {}),
      });
    } catch (e) {
      console.log(e)
    }

    if (targetAll) return;

    const others = selectedColleges.filter((c) => c !== String(created.collegeId));
    if (others.length === 0) return;

    const base = {
      type: created.type,
      title: created.title,
      description: created.description || '',
      audience: created.audience || 'both',
      createdAt: serverTimestamp(),
      createdBy: created.createdBy,
      batchId,
      ...(created.type === 'event' && {
        eventDate: created.eventDate || '',
        startTime: created.startTime || '',
        endTime: created.endTime || '',
        location: created.location || '',
      }),
      ...(created.pdfUrl && { pdfUrl: created.pdfUrl, pdfName: created.pdfName }),
    };

    try {
      await Promise.all(
        others.map(async (collegeId) => {
          const refDoc = doc(collection(db, collName));
          const payload = {
            ...base,
            id: refDoc.id,
            collegeId: String(collegeId),
          };
          await setDoc(refDoc, payload);
        })
      );
    } catch (e) {
      console.error('Clone to colleges failed', e);
    }
  };

  // Edit
  const handleEditedPropagate = async () => {
    if (!editGroup?.first) return;
    const edited = editGroup.first;
    const collName = editGroup.type === 'event' ? 'Events' : 'Notices';
    try {
      const editedSnap = await getDoc(doc(db, collName, edited.id));
      if (!editedSnap.exists()) return;
      const data = editedSnap.data();
      if (!data.batchId) return;

      const qBatch = query(collection(db, collName), where('batchId', '==', data.batchId));
      const snap = await getDocs(qBatch);

      const fields = {
        title: data.title || '',
        description: data.description || '',
        audience: data.audience || 'both',
        ...(editGroup.type === 'event' && {
          eventDate: data.eventDate || '',
          startTime: data.startTime || '',
          endTime: data.endTime || '',
          location: data.location || '',
        }),
        ...(data.pdfUrl && { pdfUrl: data.pdfUrl, pdfName: data.pdfName }),
        updatedAt: serverTimestamp(),
        updatedBy: data.updatedBy || {
          uid: adminUid,
          name:
            userDetails?.displayName ||
            [userDetails?.firstName, userDetails?.lastName].filter(Boolean).join(' ') ||
            'Admin',
          role: role || 'Admin',
        },
      };
      await Promise.all(
        snap.docs.filter((d) => d.id !== edited.id).map((d) => updateDoc(d.ref, fields))
      );
    } catch (e) {
      console.error('Propagate edit failed', e);
    }
  };

  if (authLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!userDetails && !user) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="warning">Please log in as Admin to view this page.</Alert>
      </Box>
    );
  }
  if (!(role === 'Admin' || role === 'SuperAdmin')) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Access denied. Only Admin can manage announcements.</Alert>
      </Box>
    );
  }

  const cannotOpen = !adminUid || collegesLoading || selectedColleges.length === 0;
  return (
    <Box sx={{ p: { xs: 2, md: 3 }, minHeight:'100vh' }}>
      <SecondaryHeader
                      title="Manage Announcements"
                      leftArea={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <HeaderBackButton size="small" />
                        </Stack>
                      }
                      elevation={0}
                      border
                      paperSx={{
                        p: { xs: 1.5, md: 2 },
                        borderRadius: 2,
                        mb: 2,
                        border: "1px solid",
                        borderColor: "divider",
                      }}
                    />
      
      <Stack spacing={2} mb={2}>
        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Autocomplete
              multiple
              options={collegeOptions}
              loading={collegesLoading}
              getOptionLabel={(o) => o.name || o.id}
              value={selectedAutocompleteValue}
              onChange={(_, newVal) => handleSelectColleges(newVal)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Target Colleges"
                  placeholder="Select one or more"
                />
              )}
            />
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              {targetAll ? (
                <Chip color="success" label="All Colleges" />
              ) : (
                selectedColleges.map((id) => (
                  <Chip
                    key={id}
                    label={collegeNameMap.get(id) || id}
                    onDelete={() =>
                      setSelectedColleges((prev) => prev.filter((c) => c !== id))
                    }
                    sx={{ mr: 1, mb: 1 }}
                  />
                ))
              )}
            </Stack>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">
                {targetAll
                  ? 'This will create a single announcement for ALL colleges (collegeId = C000).'
                  : 'Create once and it will clone to each selected college.'}
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={openCreate}
                disabled={cannotOpen}
              >
                New Announcement
              </Button>
            </Stack>
          </Stack>
        </Paper>

        <Paper sx={{ p: 1 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile>
            <Tab label={`Created by Me (${groupedMine.length})`} />
            <Tab label={`All Notices (${noticesAll.length})`} />
            <Tab label={`All Events (${eventsAll.length})`} />
          </Tabs>
        </Paper>

        {tab !== 0 && (
          <TextField
            placeholder="Search title, description, college, audience..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        )}
      </Stack>

      {queryError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {queryError}
        </Alert>
      )}

      {/* Tab 0, Created by me */}
      {tab === 0 && (
        <Paper elevation={1}>
          <List dense>
            {groupedMine.length === 0 && (
              <ListItem>
                <ListItemText
                  primary="No announcements yet."
                  primaryTypographyProps={{ component: 'div' }}
                />
              </ListItem>
            )}

            {groupedMine.map((g) => {
              const item = g.first;
              const created =
                item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString() : '—';
              const collegeCount = g.colleges.size;

              const summary = [
                item.description || '',
                `Audience: ${item.audience}`,
                g.type === 'event'
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
                <ListItem key={g.key} divider>
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }} component="span">
                          {item.title}
                        </Typography>
                        <Chip
                          size="small"
                          label={g.type === 'notice' ? 'Notice' : 'Event'}
                          color={g.type === 'notice' ? 'primary' : 'secondary'}
                        />
                        {g.targetAll ? (
                          <Chip size="small" color="success" variant="outlined" label="All Colleges" />
                        ) : (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`${collegeCount} college${collegeCount > 1 ? 's' : ''}`}
                          />
                        )}
                      </Stack>
                    }
                    secondary={
                      <Stack spacing={0.5}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }} component="div">
                          {created}
                        </Typography>
                        {summary && (
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }} component="div">
                            {summary}
                          </Typography>
                        )}
                      </Stack>
                    }
                    primaryTypographyProps={{ component: 'div' }}
                    secondaryTypographyProps={{ component: 'div' }}
                  />
                  <ListItemSecondaryAction>
                    <Button size="small" startIcon={<EditIcon />} onClick={() => openEdit(g)}>
                      Edit
                    </Button>
                  </ListItemSecondaryAction>
                </ListItem>
              );
            })}
          </List>
        </Paper>
      )}

      {/* Tab 1, All Notices */}
      {tab === 1 && (
        <Paper elevation={1}>
          <List dense>
            {filteredAllNotices.length === 0 && (
              <ListItem>
                <ListItemText
                  primary="No notices found."
                  primaryTypographyProps={{ component: 'div' }}
                />
              </ListItem>
            )}
            {filteredAllNotices.map((it) => {
              const created =
                it.createdAt?.toDate ? it.createdAt.toDate().toLocaleString() : '—';
              const collegeLabel =
                it.targetAll || it.collegeId === ALL_COLLEGES_KEY
                  ? 'All Colleges'
                  : collegeNameMap.get(String(it.collegeId)) || String(it.collegeId || '—');

              const summary = [
                it.description || '',
                `Audience: ${it.audience}`,
                it.pdfName ? `PDF: ${it.pdfName}` : null,
              ]
                .filter(Boolean)
                .join(' • ');

              return (
                <ListItem key={`n-${it.id}`} divider>
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }} component="span">
                          {it.title}
                        </Typography>
                        <Chip size="small" label="Notice" color="primary" />
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
                        {summary && (
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }} component="div">
                            {summary}
                          </Typography>
                        )}
                      </Stack>
                    }
                    primaryTypographyProps={{ component: 'div' }}
                    secondaryTypographyProps={{ component: 'div' }}
                  />
                  {it.createdBy?.uid === adminUid && (
                    <ListItemSecondaryAction>
                      <Button
                        size="small"
                        startIcon={<EditIcon />}
                        onClick={() =>
                          openEdit({
                            key: it.batchId || it.id,
                            type: 'notice',
                            docs: [it],
                            first: it,
                            colleges: new Set([String(it.collegeId)]),
                            targetAll: !!it.targetAll || it.collegeId === ALL_COLLEGES_KEY,
                          })
                        }
                      >
                        Edit
                      </Button>
                    </ListItemSecondaryAction>
                  )}
                </ListItem>
              );
            })}
          </List>
        </Paper>
      )}

      {/* Tab 2, All Events */}
      {tab === 2 && (
        <Paper elevation={1}>
          <List dense>
            {filteredAllEvents.length === 0 && (
              <ListItem>
                <ListItemText
                  primary="No events found."
                  primaryTypographyProps={{ component: 'div' }}
                />
              </ListItem>
            )}
            {filteredAllEvents.map((it) => {
              const created =
                it.createdAt?.toDate ? it.createdAt.toDate().toLocaleString() : '—';
              const collegeLabel =
                it.targetAll || it.collegeId === ALL_COLLEGES_KEY
                  ? 'All Colleges'
                  : collegeNameMap.get(String(it.collegeId)) || String(it.collegeId || '—');

              const eventMeta = [it.eventDate, it.startTime, it.endTime, it.location]
                .filter(Boolean)
                .join(' | ');

              const summary = [
                it.description || '',
                `Audience: ${it.audience}`,
                eventMeta || '',
                it.pdfName ? `PDF: ${it.pdfName}` : null,
              ]
                .filter(Boolean)
                .join(' • ');

              return (
                <ListItem key={`e-${it.id}`} divider>
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }} component="span">
                          {it.title}
                        </Typography>
                        <Chip size="small" label="Event" color="secondary" />
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
                        {summary && (
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }} component="div">
                            {summary}
                          </Typography>
                        )}
                      </Stack>
                    }
                    primaryTypographyProps={{ component: 'div' }}
                    secondaryTypographyProps={{ component: 'div' }}
                  />
                  {it.createdBy?.uid === adminUid && (
                    <ListItemSecondaryAction>
                      <Button
                        size="small"
                        startIcon={<EditIcon />}
                        onClick={() =>
                          openEdit({
                            key: it.batchId || it.id,
                            type: 'event',
                            docs: [it],
                            first: it,
                            colleges: new Set([String(it.collegeId)]),
                            targetAll: !!it.targetAll || it.collegeId === ALL_COLLEGES_KEY,
                          })
                        }
                      >
                        Edit
                      </Button>
                    </ListItemSecondaryAction>
                  )}
                </ListItem>
              );
            })}
          </List>
        </Paper>
      )}

      <Dialog open={open} onClose={closeDialog} fullWidth maxWidth="md">
        <DialogTitle>
          {editGroup ? 'Edit Announcement' : 'Create Announcement'}
          <IconButton
            aria-label="close"
            onClick={closeDialog}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {!editGroup ? (
            <AnnouncementForm
              mode="create"
              initialType="notice"
              collegeId={targetAll ? ALL_COLLEGES_KEY : selectedColleges[0] || undefined}
              currentUser={{
                uid: adminUid,
                displayName:
                  userDetails?.displayName ||
                  [userDetails?.firstName, userDetails?.lastName].filter(Boolean).join(' ') ||
                  'Admin',
                role: role || 'Admin',
              }}
              onSaved={closeDialog}
              onCancel={closeDialog}
              onCreated={async (created) => {
                try {
                  await handleCreated(created);
                } finally {
                  closeDialog();
                }
              }}
            />
          ) : (
            <AnnouncementForm
              mode="edit"
              initialType={editGroup.type}
              defaultValues={editGroup.first}
              collegeId={editGroup.first.collegeId}
              currentUser={{
                uid: adminUid,
                displayName:
                  userDetails?.displayName ||
                  [userDetails?.firstName, userDetails?.lastName].filter(Boolean).join(' ') ||
                  'Admin',
                role: role || 'Admin',
              }}
              onSaved={async () => {
                await handleEditedPropagate();
                closeDialog();
              }}
              onCancel={closeDialog}
            />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}