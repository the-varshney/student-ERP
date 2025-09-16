/* eslint-disable react/prop-types */
/* eslint-disable no-unused-vars */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Container, Typography, Alert, Card, CardContent, CardMedia, Button, Grid, Stack, TextField, Select, MenuItem, 
  Chip, InputAdornment, Divider, Skeleton, Dialog, DialogContent, DialogTitle, IconButton, useMediaQuery, useTheme, Paper, Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DownloadIcon from '@mui/icons-material/Download';
import CloseIcon from '@mui/icons-material/Close';
import ClearIcon from '@mui/icons-material/Clear';
import PersonIcon from '@mui/icons-material/Person';
import { collection, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../../firebase/Firebase';
import axios from 'axios';
import PdfViewer from '../../components/PdfViewer';
import SecondaryHeader from "../../components/secondaryHeader";
import { HeaderBackButton } from "../../components/header";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function useDebounced(value, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

const normalizedTags = (arr) =>
  Array.from(new Set((arr || []).filter(Boolean).map((t) => String(t).trim().toLowerCase()).filter((t) => t.length)));

const getBookUploaderUid = (b) =>
  b?.uploaderUid || b?.ownerUid || b?.createdBy || b?.addedBy || b?.uid || b?.userId || b?.uploadedBy || '';

const PdfViewerDialog = React.memo(function PdfViewerDialog({ open, url, onClose }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  return (
    <Dialog
      open={!!open}
      onClose={onClose}
      fullWidth
      maxWidth="xl"
      fullScreen={!isMobile}
      sx={{
        '& .MuiDialog-paper': {
          margin: isMobile ? 0 : '24px',
          width: '100vw',
          height: '100vh',
          maxWidth: '100vw',
          maxHeight: '100vh',
          borderRadius: isMobile ? 0 : 2,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pr: 1,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700 }}>Book Viewer</Typography>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0, pt: 0 }}>
        <PdfViewer
          fileUrl={url}
          downloadFileName="book.pdf"
          showHeader={false}
          height="82vh"
          pageMaxWidth={1000}
          pageWidthPct={0.9}
          containerSx={{ bgcolor: 'background.paper', border: 'none' }}
          pageSx={{ borderRadius: 1 }}
          renderAnnotationLayer
          renderTextLayer
        />
      </DialogContent>
    </Dialog>
  );
});

const FilterBar = React.memo(function FilterBar({
  programs, semesters, subjects,
  search, onSearch,
  programId, onProgramChange,
  semester, onSemesterChange,
  subjectId, onSubjectChange,
  locked,
}) {
  const theme = useTheme();
  const programMenuItems = programs.map((p) => (
    <MenuItem key={p._id} value={p._id}>{p.name || p.title || p.code || p._id}</MenuItem>
  ));
  const semesterMenuItems = (Array.isArray(semesters) ? semesters : [])
    .map((s) => s.semesterNumber ?? s.semester ?? s.number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    .map((n) => <MenuItem key={n} value={n}>Sem {n}</MenuItem>);
  const subjectMenuItems = (Array.isArray(subjects) ? subjects : [])
    .map((s) => <MenuItem key={s._id} value={s._id}>{s.name || s.title || s.code || s._id}</MenuItem>);
  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 2, bgcolor: theme.palette.background.paper }}>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            placeholder="Search by title, author, subject, or tag..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><SearchIcon /></InputAdornment>
              ),
            }}
            sx={{ bgcolor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100], borderRadius: 1 }}
          />
        </Grid>
        <Grid item xs={12} sm={4} md={2}>
          <Select
            fullWidth
            displayEmpty
            value={programId}
            onChange={(e) => onProgramChange(e.target.value)}
            sx={{ bgcolor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100], borderRadius: 1 }}
            disabled={locked}
          >
            <MenuItem value=""><em>All Programs</em></MenuItem>
            {programMenuItems}
          </Select>
        </Grid>
        <Grid item xs={12} sm={4} md={2}>
          <Select
            fullWidth
            displayEmpty
            value={semester}
            onChange={(e) => onSemesterChange(e.target.value)}
            disabled={!programId || locked}
            sx={{ bgcolor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100], borderRadius: 1 }}
          >
            <MenuItem value=""><em>All Semesters</em></MenuItem>
            {semesterMenuItems}
          </Select>
        </Grid>
        <Grid item xs={12} sm={4} md={2}>
          <Select
            fullWidth
            displayEmpty
            value={subjectId}
            onChange={(e) => onSubjectChange(e.target.value)}
            disabled={!programId || !semester || locked}
            sx={{ bgcolor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100], borderRadius: 1}}
          >
            <MenuItem value=""><em>All Subjects</em></MenuItem>
            {subjectMenuItems}
          </Select>
        </Grid>
      </Grid>
    </Paper>
  );
});

const ActiveFilters = React.memo(function ActiveFilters({
  search, setSearch,
  // programName/semester/subjectName are not displayed for now
  // programName, removeProgram,
  // semester, removeSemester,
  // subjectName, removeSubject,
  tags, setTags,
  inputValue, setInputValue,
  onInputCommit,
  onClearAll,
}) {
  // Only show Search and Tags
  const hasActiveFilters = Boolean(search || (tags?.length));
  if (!hasActiveFilters) return null;

  const handleTagsInput = (value) => setInputValue(value);
  const handleTagBlur = () => onInputCommit();

  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="body2" color="text.secondary">Active Filters & Tags</Typography>
        <Button variant="outlined" startIcon={<ClearIcon />} onClick={onClearAll} size="small">
          Clear All
        </Button>
      </Stack>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 1,
          p: 1.5,
          minHeight: '56px',
          alignItems: 'flex-start',
          alignContent: 'flex-start',
        }}
      >
        {search && (
          <Chip
            label={`Search: "${search}"`}
            onDelete={() => setSearch('')}
            color="primary"
            sx={{ bgcolor: 'primary.main', color: 'white' }}
            size="small"
          />
        )}

        {(tags || []).map((tag) => (
          <Chip
            key={tag}
            label={tag}
            onDelete={() => setTags((prev) => prev.filter((t) => t !== tag))}
            color="secondary"
            sx={{ bgcolor: 'secondary.main', color: 'white' }}
            size="small"
          />
        ))}

        <TextField
          variant="standard"
          value={inputValue}
          onChange={(e) => handleTagsInput(e.target.value)}
          onBlur={handleTagBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onInputCommit();
            }
          }}
          placeholder="Add custom tags..."
          sx={{
            flexGrow: 1,
            minWidth: '200px',
            '& .MuiInput-underline:before': { borderBottom: 'none' },
            '& .MuiInput-underline:after': { borderBottom: 'none' },
            '& .MuiInput-underline:hover:not(.Mui-disabled):before': { borderBottom: 'none' },
          }}
          InputProps={{ disableUnderline: true, sx: { fontSize: '0.875rem' } }}
        />
      </Box>
    </Paper>
  );
});

const BookCard = React.memo(function BookCard({
  book,
  active,
  onProgramClick,
  onSemesterClick,
  onSubjectClick,
  onView,
  onDownload,
  onTagClick,
}) {
  const hasCover = book.coverURL && book.coverURL !== '';
  const url = book.pdfURL || book.pdfUrl || '';
  const fileName = book.title ? `${book.title.replace(/[^a-z0-9]/gi, '_')}.pdf` : 'book.pdf';
  const bookProgName = String(book.program || book.programName || '').trim();
  const bookProgId = String(book.programId || '');
  const bookSem = Number(book.semester || 0);
  const bookSubjName = String(book.subject || book.subjectName || '').trim();
  const bookSubjId = String(book.subjectId || '');
  const bookTags = Array.isArray(book.tags) ? book.tags : [];
  const theme = useTheme();
  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        minHeight: 380,
        width:  '100%',
        minWidth:{xs:"90vw", md: 370},
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 2,
        transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
                '&:hover': { transform: 'translateY(-3px)', boxShadow: 3 },
                bgcolor: theme.palette.background.paper,
              }}
    >
      {hasCover ? (
        <CardMedia
          component="img"
          image={book.coverURL}
          alt={book.title}
          sx={{ objectFit: 'cover', height: 250, borderTopLeftRadius: 8, borderTopRightRadius: 8, width:'100%' }}
        />
      ) : (
        <Box
          sx={{
            height: 250,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: `${theme.palette.divider}`,
            textAlign: 'center',
            px: 1.5,
          }}
        >
          <Typography
            variant="subtitle1"
            fontWeight={700}
            sx={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.25,
            }}
          >
            {book.title || 'Untitled'}
          </Typography>
        </Box>
      )}

      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 700,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: 48,
          }}
        >
          {book.title || 'Untitled'}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {book.author || 'Unknown author'}
        </Typography>

        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
          <Chip
            label={bookProgName || '—'}
            size="small"
            onClick={() => onProgramClick({ id: bookProgId, name: bookProgName })}
            sx={{
              cursor: 'pointer',
              bgcolor: active.program ? 'primary.main' : '',
              color: active.program ? 'white' : 'text.primary',
              '&:hover': { bgcolor: active.program ? 'primary.dark' : 'grey.300' },
              height: 24,
            }}
          />
          <Chip
            label={bookSem ? `Sem ${bookSem}` : 'Sem —'}
            size="small"
            onClick={() => onSemesterClick(bookSem)}
            sx={{
              cursor: 'pointer',
              bgcolor: active.semester ? 'primary.main' : '',
              color: active.semester ? 'white' : 'text.primary',
              '&:hover': { bgcolor: active.semester ? 'primary.dark' : 'grey.300' },
              height: 24,
            }}
          />
          <Chip
            label={bookSubjName || '—'}
            size="small"
            onClick={() => onSubjectClick({ id: bookSubjId, name: bookSubjName })}
            sx={{
              cursor: 'pointer',
              bgcolor: active.subject ? 'primary.main' : '',
              color: active.subject ? 'white' : 'text.primary',
              '&:hover': { bgcolor: active.subject ? 'primary.dark' : 'grey.300' },
              height: 24,
            }}
          />
        </Stack>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
          {bookTags.slice(0, 4).map((t) => (
            <Chip
              key={t}
              label={t}
              size="small"
              variant="outlined"
              sx={{ height: 22, cursor: 'pointer' }}
              onClick={() => onTagClick?.(t)}
            />
          ))}
        </Box>
      </CardContent>

      <Divider />
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 2 }}>
        <Button size="small" variant="text" endIcon={<OpenInNewIcon />} onClick={() => onView(url)} disabled={!url}>
          View
        </Button>
        <Button
          size="small"
          variant="contained"
          color="primary"
          endIcon={<DownloadIcon />}
          component="a"
          href={url || '#'}
          download={fileName}
          onClick={(e) => {
            if (!url) { e.preventDefault(); return; }
            onDownload?.(book);
          }}
          disabled={!url}
          sx={{ textTransform: 'none' }}
        >
          Download
        </Button>
      </Stack>
    </Card>
  );
});

//main component
export default function LibraryBrowser({
  role = 'generic',
  defaultFilters = { programId: '', semester: '', subjectId: '', tags: [], search: '' },
  lockFilters = false,
  containerProps = {},
}) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [catalogError, setCatalogError] = useState('');

  // My uploads toggle
  const [onlyMyUploads, setOnlyMyUploads] = useState(false);

  // Filter states
  const [programId, setProgramId] = useState(defaultFilters.programId || '');
  const [programName, setProgramName] = useState('');
  const [semester, setSemester] = useState(defaultFilters.semester || '');
  const [subjectId, setSubjectId] = useState(defaultFilters.subjectId || '');
  const [subjectName, setSubjectName] = useState('');
  const [tags, setTags] = useState(Array.isArray(defaultFilters.tags) ? defaultFilters.tags : []);
  const [search, setSearch] = useState(defaultFilters.search || '');
  const [openPdf, setOpenPdf] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const debouncedSearch = useDebounced(search, 400);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const auth = getAuth();
  const user = auth.currentUser;

  const getAuthHeaders = useCallback(async () => {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (user) {
      headers['Authorization'] = `Bearer ${await user.getIdToken()}`;
    }
    return headers;
  }, [user]);

  // API helpers
  const fetchPrograms = useCallback(async () => {
    const res = await axios.get(`${API_BASE_URL}/api/programs`, { headers: await getAuthHeaders() });
    return res.data;
  }, [getAuthHeaders]);

  const fetchProgramSemesters = useCallback(async (pid) => {
    const res = await axios.get(`${API_BASE_URL}/api/programs/${pid}/semesters`, { headers: await getAuthHeaders() });
    return res.data;
  }, [getAuthHeaders]);

  const fetchSubjectsFor = useCallback(async (pid, sem) => {
    const res = await axios.get(`${API_BASE_URL}/api/programs/${pid}/semesters/${sem}/subjects`, { headers: await getAuthHeaders() });
    return res.data;
  }, [getAuthHeaders]);

  // Load books
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const booksRef = collection(db, 'books');
        const snap = await getDocs(booksRef);
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (active) setBooks(rows);
      } catch (err) {
        console.error('Error loading books:', err);
        if (active) setError('Failed to load books. Please try again later.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  // Load catalog
  useEffect(() => {
    let active = true;
    (async () => {
      setCatalogError('');
      try {
        const progs = await fetchPrograms();
        if (!active) return;
        setPrograms(Array.isArray(progs) ? progs : []);
      } catch (e) {
        console.error('Fetch programs error:', e);
        if (active) setCatalogError('Failed to load catalog.');
      }
    })();
    return () => { active = false; };
  }, [fetchPrograms]);

  // Load semesters when program changes
  useEffect(() => {
    let active = true;
    if (!programId) {
      setSemesters([]); setSubjects([]); setProgramName('');
      return;
    }
    (async () => {
      try {
        const sems = await fetchProgramSemesters(programId);
        if (!active) return;
        setSemesters(Array.isArray(sems) ? sems : []);
        const selectedProgram = (programs || []).find(p => String(p._id) === String(programId));
        setProgramName(selectedProgram?.name || selectedProgram?.programName || selectedProgram?.title || '');
      } catch (e) {
        console.error('Fetch semesters error:', e);
        if (active) setSemesters([]);
      }
    })();
    return () => { active = false; };
  }, [programId, fetchProgramSemesters, programs]);

  useEffect(() => {
    let active = true;
    if (!programId || !semester) {
      setSubjects([]);
      return;
    }
    (async () => {
      try {
        const subs = await fetchSubjectsFor(programId, semester);
        if (!active) return;
        setSubjects(Array.isArray(subs) ? subs : []);
      } catch (e) {
        console.error('Fetch subjects error:', e);
        if (active) setSubjects([]);
      }
    })();
    return () => { active = false; };
  }, [programId, semester, fetchSubjectsFor]);

  // Tag input commit
  const commitTagsFromInput = useCallback(() => {
    if (!inputValue.trim()) return;
    const newTags = inputValue.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
    const normalized = normalizedTags([...(tags || []), ...newTags]);
    setTags(normalized);
    setInputValue('');
  }, [inputValue, tags]);

  // Clear all filters
  const handleClearAllFilters = useCallback(() => {
    if (lockFilters) { // keep locked defaults
      setSearch(''); setTags([]); setInputValue('');
      return;
    }
    setProgramId(''); setProgramName('');
    setSemester(''); setSubjectId(''); setSubjectName('');
    setTags([]); setSearch(''); setInputValue('');
  }, [lockFilters]);

  // Filter handlers
  const handleProgramChange = useCallback((newProgramId) => {
    if (lockFilters) return;
    const selectedProgram = programs.find(p => String(p._id) === String(newProgramId));
    setProgramId(newProgramId);
    setProgramName(selectedProgram?.name || selectedProgram?.programName || selectedProgram?.title || '');
    setSemester(''); setSubjectId(''); setSubjectName('');
  }, [programs, lockFilters]);

  const handleSemesterChange = useCallback((newSemester) => {
    if (lockFilters) return;
    setSemester(newSemester);
    setSubjectId(''); setSubjectName('');
  }, [lockFilters]);

  const handleSubjectChange = useCallback((newSubjectId) => {
    if (lockFilters) return;
    const selectedSubject = subjects.find(s => String(s._id) === String(newSubjectId));
    setSubjectId(newSubjectId);
    setSubjectName(selectedSubject?.name || selectedSubject?.title || '');
  }, [subjects, lockFilters]);

  // Card chip handlers
  const handleProgramChip = useCallback((prog) => {
    if (lockFilters) return;
    const newProgramId = prog.id;
    const newProgramName = prog.name;
    if (programId === newProgramId) {
      setProgramId(''); setProgramName(''); setSemester(''); setSubjectId(''); setSubjectName('');
    } else {
      setProgramId(newProgramId); setProgramName(newProgramName);
      setSemester(''); setSubjectId(''); setSubjectName('');
    }
  }, [programId, lockFilters]);

  const handleSemesterChip = useCallback((sem) => {
    if (lockFilters) return;
    const s = String(sem || '');
    if (!s) return;
    setSubjectId(''); setSubjectName('');
    setSemester((prev) => prev === s ? '' : s);
  }, [lockFilters]);

  const handleSubjectChip = useCallback((subj) => {
    if (lockFilters) return;
    const newId = subj.id; const newName = subj.name;
    if (subjectId === newId || subjectName.toLowerCase() === String(newName || '').toLowerCase()) {
      setSubjectId(''); setSubjectName('');
    } else {
      setSubjectId(newId); setSubjectName(newName);
    }
  }, [subjectId, subjectName, lockFilters]);

  const handleTagClick = useCallback((tag) => {
    const lower = String(tag).toLowerCase();
    setTags((prev) => prev.includes(lower) ? prev.filter((t) => t !== lower) : [...prev, lower]);
  }, []);

  const handleViewPdf = useCallback((url) => setOpenPdf(url || null), []);
  const handleClosePdf = useCallback(() => setOpenPdf(null), []);

  // Filtered books
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const uid = user?.uid || '';
    return books.filter((b) => {
      // my uploads mode
      if (onlyMyUploads && uid) {
        const uploadedBy = String(getBookUploaderUid(b) || '');
        if (!uploadedBy || uploadedBy !== uid) return false;
      }

      const title = String(b.title || '').toLowerCase();
      const author = String(b.author || '').toLowerCase();
      const bookSubj = String(b.subject || b.subjectName || '').toLowerCase();
      const bookProgId = String(b.programId || '');
      const bookProgName = String(b.program || b.programName || '').toLowerCase();
      const sem = Number(b.semester || 0);
      const bookSubjId = String(b.subjectId || '');
      const tgs = Array.isArray(b.tags) ? b.tags.map((x) => String(x).toLowerCase()) : [];

      if (programId) {
        const matchesId = bookProgId.toLowerCase() === String(programId).toLowerCase();
        const matchesName = programName && bookProgName === String(programName).toLowerCase();
        if (!matchesId && !matchesName) return false;
      }
      if (semester && sem !== Number(semester)) return false;
      if (subjectId || subjectName) {
        const matchesId = subjectId && bookSubjId === subjectId;
        const matchesName = subjectName && bookSubj === String(subjectName).toLowerCase();
        if (!matchesId && !matchesName) return false;
      }
      if (tags.length) {
        const need = tags.map((x) => x.toLowerCase());
        if (!need.every((x) => tgs.includes(x))) return false;
      }
      if (q) {
        const hay = `${title} ${author} ${bookSubj} ${tgs.join(' ')}`;
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [books, programId, programName, semester, subjectId, subjectName, tags, debouncedSearch, onlyMyUploads, user?.uid]);

  const isEmpty = !loading && !error && filtered.length === 0;

  return (
    <Container maxWidth="lg" sx={{ minHeight: '100vh', py: 4 }} {...containerProps}>
      {/* Header */}
      <SecondaryHeader
                title="Library"
                subtitle="Discover, search, and download course materials"
                leftArea={
                  <HeaderBackButton />
                }
                rightArea={
                  <Stack>

          {/* Teacher-only toggle */}
          {role === 'teacher' && (
            <Tooltip title={onlyMyUploads ? 'Showing only your uploads' : 'Show only your uploads'}>
              <Button
                variant={onlyMyUploads ? 'contained' : 'outlined'}
                color="primary"
                startIcon={<PersonIcon />}
                onClick={() => setOnlyMyUploads((s) => !s)}
                sx={{ textTransform: 'none', minWidth:{xs:"20vw", md: '150px'} }}
              >
                {onlyMyUploads ? 'My uploads: On' : 'My uploads: Off'}
              </Button>
            </Tooltip>
          )}
        </Stack>
                }
              />

      {catalogError && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{catalogError}</Alert>}

      <FilterBar
        programs={programs}
        semesters={semesters}
        subjects={subjects}
        search={search}
        onSearch={setSearch}
        programId={programId}
        onProgramChange={handleProgramChange}
        semester={semester}
        onSemesterChange={handleSemesterChange}
        subjectId={subjectId}
        onSubjectChange={handleSubjectChange}
        locked={lockFilters}
      />

      <ActiveFilters
        search={search}
        setSearch={setSearch}
        programName={programName}
        removeProgram={() => { if (!lockFilters) { setProgramId(''); setProgramName(''); setSemester(''); setSubjectId(''); setSubjectName(''); } }}
        semester={semester}
        removeSemester={() => { if (!lockFilters) { setSemester(''); setSubjectId(''); setSubjectName(''); } }}
        subjectName={subjectName}
        removeSubject={() => { if (!lockFilters) { setSubjectId(''); setSubjectName(''); } }}
        tags={tags}
        setTags={setTags}
        inputValue={inputValue}
        setInputValue={setInputValue}
        onInputCommit={commitTagsFromInput}
        onClearAll={handleClearAllFilters}
      />

      {/* Status */}
      {loading && (
        <Grid container spacing={2}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Card variant="outlined" sx={{ borderRadius: 2 }}>
                <Skeleton variant="rectangular" height={180} />
                <Box sx={{ p: 2 }}>
                  <Skeleton width="60%" />
                  <Skeleton width="90%" />
                  <Skeleton width="40%" />
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && (
        <>
          {isEmpty ? (
            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
              <Typography variant="h6" fontWeight={700}>No books match the current filters</Typography>
              <Typography variant="body2" color="text.secondary">
                Try adjusting or clearing some filters to see more results.
              </Typography>
            </Paper>
          ) : (
            <>
              <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Showing {filtered.length} book{filtered.length !== 1 ? 's' : ''}
                </Typography>
              </Box>
              <Grid container spacing={2}>
                {filtered.map((b) => {
                  const active = {
                    program: Boolean(programId && (String(b.programId || '').toLowerCase() === String(programId).toLowerCase() || String(b.program || b.programName || '').toLowerCase() === String(programName).toLowerCase())),
                    semester: Boolean(semester && Number(b.semester || 0) === Number(semester)),
                    subject: Boolean(
                      (subjectId && String(b.subjectId || '') === String(subjectId)) ||
                      (subjectName && String(b.subject || b.subjectName || '').toLowerCase() === String(subjectName).toLowerCase())
                    ),
                    tags: tags,
                  };
                  return (
                    <Grid item xs={12} sm={6} md={3} key={b.id}>
                      <Box sx={{ height: '100%' }}>
                        <BookCard
                          book={b}
                          active={active}
                          onProgramClick={handleProgramChip}
                          onSemesterClick={handleSemesterChip}
                          onSubjectClick={handleSubjectChip}
                          onView={handleViewPdf}
                          onDownload={() => {}}
                          onTagClick={handleTagClick}
                        />
                      </Box>
                    </Grid>
                  );
                })}
              </Grid>
            </>
          )}
        </>
      )}

      {/* Use PdfViewer for books */}
      <PdfViewerDialog open={!!openPdf} url={openPdf} onClose={handleClosePdf} />
    </Container>
  );
}
