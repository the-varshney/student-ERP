import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  Alert,
  Card,
  CardContent,
  CardMedia,
  Button,
  Grid,
  Stack,
  TextField,
  Select,
  MenuItem,
  Chip,
  InputAdornment,
  Divider,
  Skeleton,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  useMediaQuery,
  useTheme,
  Paper,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DownloadIcon from '@mui/icons-material/Download';
import CloseIcon from '@mui/icons-material/Close';
import ClearIcon from '@mui/icons-material/Clear';
import { collection, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../../firebase/Firebase';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Small hook for effect of debounce
function useDebounced(value, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

export default function Library() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [catalogError, setCatalogError] = useState('');
  
  // Filter states
  const [programId, setProgramId] = useState('');
  const [programName, setProgramName] = useState('');
  const [semester, setSemester] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [tags, setTags] = useState([]);
  const [search, setSearch] = useState('');
  const [openPdf, setOpenPdf] = useState(null);
  const [inputValue, setInputValue] = useState(''); // For tag input
  
  const debouncedSearch = useDebounced(search, 400);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const auth = getAuth();
  const user = auth.currentUser;

  // API helpers with authentication
  const getAuthHeaders = async () => {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (user) {
      headers['Authorization'] = `Bearer ${await user.getIdToken()}`;
    }
    return headers;
  };

  const fetchPrograms = async () => {
    const res = await axios.get(`${API_BASE_URL}/api/programs`, { headers: await getAuthHeaders() });
    return res.data;
  };

  const fetchProgramSemesters = async (programId) => {
    const res = await axios.get(`${API_BASE_URL}/api/programs/${programId}/semesters`, { headers: await getAuthHeaders() });
    return res.data;
  };

  const fetchSubjectsFor = async (programId, semNumber) => {
    const res = await axios.get(`${API_BASE_URL}/api/programs/${programId}/semesters/${semNumber}/subjects`, { headers: await getAuthHeaders() });
    return res.data;
  };

  // Load books from Firebase
  useEffect(() => {
    let active = true;
    const fetchBooks = async () => {
      setLoading(true);
      setError(null);
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
    fetchBooks();
    return () => {
      active = false;
    };
  }, []);

  // Load catalog from API
  useEffect(() => {
    let active = true;
    (async () => {
      setCatalogError('');
      try {
        const progs = await fetchPrograms();
        if (!active) return;
        setPrograms(progs);
      } catch (e) {
        console.error('Fetch programs error:', e);
        if (active) setCatalogError('Failed to load catalog.');
      }
    })();
    return () => { active = false; };
  }, []);

  // Load semesters when program changes
  useEffect(() => {
    let active = true;
    if (!programId) {
      setSemesters([]);
      setSubjects([]);
      return;
    }
    (async () => {
      try {
        const sems = await fetchProgramSemesters(programId);
        if (!active) return;
        setSemesters(Array.isArray(sems) ? sems : []);
      } catch (e) {
        console.error('Fetch semesters error:', e);
        if (active) setSemesters([]);
      }
    })();
    return () => { active = false; };
  }, [programId]);

  // Load subjects when program + semester changes
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
  }, [programId, semester]);

  const normalizedTags = (arr) =>
    Array.from(new Set((arr || []).filter(Boolean).map((t) => String(t).trim().toLowerCase()).filter((t) => t.length)));

  // Handle tags input with space/comma separation
  const handleTagsInput = (value) => {
    setInputValue(value);
    const newTags = value
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (value.endsWith(' ') || value.endsWith(',')) {
      const combinedTags = [...tags, ...newTags];
      const normalized = normalizedTags(combinedTags);
      setTags(normalized);
      setInputValue('');
    }
  };

  const handleTagBlur = () => {
    if (inputValue.trim()) {
      const newTags = inputValue
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const combinedTags = [...tags, ...newTags];
      const normalized = normalizedTags(combinedTags);
      setTags(normalized);
      setInputValue('');
    }
  };

  const handleDeleteTag = (tagToDelete) => {
    setTags(tags.filter((tag) => tag !== tagToDelete));
  };

  // Filtered books based on all criteria
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return books.filter((b) => {
      const title = String(b.title || '').toLowerCase();
      const author = String(b.author || '').toLowerCase();
      const bookSubj = String(b.subject || b.subjectName || '').toLowerCase();
      const bookProgId = String(b.programId || '');
      const sem = Number(b.semester || 0);
      const bookSubjId = String(b.subjectId || '');
      const tgs = Array.isArray(b.tags) ? b.tags.map((x) => String(x).toLowerCase()) : [];

      // Filter by program
      if (programId) {
        const matchesId = bookProgId.toLowerCase() === programId.toLowerCase();
        if (!matchesId) return false;
      }
      
      // Filter by semester
      if (semester && sem !== Number(semester)) return false;
      
      // Filter by subject
      if (subjectId || subjectName) {
        const matchesId = subjectId && bookSubjId === subjectId;
        const matchesName = subjectName && bookSubj === subjectName.toLowerCase();
        if (!matchesId && !matchesName) return false;
      }
      
      // Filter by tags (all selected tags must be present)
      if (tags.length) {
        const need = tags.map((x) => x.toLowerCase());
        if (!need.every((x) => tgs.includes(x))) return false;
      }

      // Keyword search
      if (q) {
        const hay = `${title} ${author} ${bookSubj}`;
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [books, programId, programName, semester, subjectId, subjectName, tags, debouncedSearch]);

  const isEmpty = !loading && !error && filtered.length === 0;

  const handleViewPdf = (url) => {
    setOpenPdf(url);
  };

  const handleClosePdf = () => {
    setOpenPdf(null);
  };
  
  // Handlers for dropdowns
  const handleProgramChange = (newProgramId) => {
    const selectedProgram = programs.find(p => String(p._id) === String(newProgramId));
    setProgramId(newProgramId);
    setProgramName(selectedProgram?.name || '');
    setSemester('');
    setSubjectId('');
    setSubjectName('');
  };

  const handleSemesterChange = (newSemester) => {
    setSemester(newSemester);
    setSubjectId('');
    setSubjectName('');
  };

  const handleSubjectChange = (newSubjectId) => {
    const selectedSubject = subjects.find(s => String(s._id) === String(newSubjectId));
    setSubjectId(newSubjectId);
    setSubjectName(selectedSubject?.name || selectedSubject?.title || '');
  };

  const handleClearAllFilters = () => {
    setProgramId('');
    setProgramName('');
    setSemester('');
    setSubjectId('');
    setSubjectName('');
    setTags([]);
    setSearch('');
    setInputValue('');
  };

  // Handlers for chips in cards
  const handleProgramClick = (prog) => {
    const newProgramName = prog.name;
    const newProgramId = prog.id;
    if (programId === newProgramId) {
        removeProgram();
    } else {
        setProgramId(newProgramId);
        setProgramName(newProgramName);
        setSemester('');
        setSubjectId('');
        setSubjectName('');
    }
  };
  
  const handleSemesterClick = (sem) => {
    if (semester === String(sem)) {
        setSemester('');
        setSubjectId('');
        setSubjectName('');
    } else {
        setSemester(String(sem));
    }
  };

  const handleSubjectClick = (subj) => {
      const newSubjectName = subj.name;
      const newSubjectId = subj.id;
      if (subjectId === newSubjectId || subjectName === newSubjectName) {
          setSubjectId('');
          setSubjectName('');
      } else {
        setSubjectId(newSubjectId);
        setSubjectName(newSubjectName);
      }
  };

  const handleTagClick = (tag) => {
    const lowerTag = tag.toLowerCase();
    if (tags.includes(lowerTag)) {
      setTags(tags.filter((t) => t !== lowerTag));
    } else {
      setTags([...tags, lowerTag]);
    }
  };

  const removeProgram = () => {
    setProgramId('');
    setProgramName('');
    setSemester('');
    setSubjectId('');
    setSubjectName('');
  };

  const removeSemester = () => {
    setSemester('');
    setSubjectId('');
    setSubjectName('');
  };

  const removeSubject = () => {
    setSubjectId('');
    setSubjectName('');
  };

  const activeFiltersCount = [programId, semester, subjectId, ...tags].filter(Boolean).length + (search ? 1 : 0);
  const hasActiveFilters = activeFiltersCount > 0;

  // Menu items
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
    <Container maxWidth="lg" sx={{ minHeight: '100vh', py: 4 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          Library
        </Typography>
        {hasActiveFilters && (
          <Button
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={handleClearAllFilters}
            size="small"
          >
            Clear All Filters ({activeFiltersCount})
          </Button>
        )}
      </Stack>

      {catalogError && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{catalogError}</Alert>
      )}

      {/*Filters */}
      <Paper elevation={3} sx={{ p: 3, borderRadius: 2, bgcolor: 'white', mb: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              placeholder="Search by title, author, subject..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
              sx={{ bgcolor: 'grey.50', borderRadius: 1 }}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <Select
              fullWidth
              displayEmpty
              value={programId}
              onChange={(e) => handleProgramChange(e.target.value)}
              sx={{ bgcolor: 'grey.50', borderRadius: 1 }}
            >
              <MenuItem value="">
                <em>All Programs</em>
              </MenuItem>
              {programMenuItems}
            </Select>
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <Select
              fullWidth
              displayEmpty
              value={semester}
              onChange={(e) => handleSemesterChange(e.target.value)}
              disabled={!programId}
              sx={{ bgcolor: 'grey.50', borderRadius: 1 }}
            >
              <MenuItem value="">
                <em>All Semesters</em>
              </MenuItem>
              {semesterMenuItems}
            </Select>
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <Select
              fullWidth
              displayEmpty
              value={subjectId}
              onChange={(e) => handleSubjectChange(e.target.value)}
              disabled={!programId || !semester}
              sx={{ bgcolor: 'grey.50', borderRadius: 1 }}
            >
              <MenuItem value="">
                <em>All Subjects</em>
              </MenuItem>
              {subjectMenuItems}
            </Select>
          </Grid>
        </Grid>
      </Paper>

      {/* Active Filters Display*/}
      {hasActiveFilters && (
        <Paper elevation={2} sx={{ p: 2, borderRadius: 2, bgcolor: 'white', mb: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Active Filters & Tags:
          </Typography>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              border: '1px solid',
              borderColor: 'grey.300',
              borderRadius: 1,
              p: 2,
              bgcolor: 'grey.50',
              minHeight: '56px',
              alignItems: 'flex-start',
              alignContent: 'flex-start',
            }}
          >
            {/*Active filter chips*/}
            {search && (
              <Chip
                label={`Search: "${search}"`}
                onDelete={() => setSearch('')}
                color="primary"
                sx={{ bgcolor: 'primary.main', color: 'white' }}
              />
            )}
            {programName && (
              <Chip
                label={`Program: ${programName}`}
                onDelete={removeProgram}
                color="primary"
                sx={{ bgcolor: 'primary.main', color: 'white' }}
              />
            )}
            {semester && (
              <Chip
                label={`Sem: ${semester}`}
                onDelete={removeSemester}
                color="primary"
                sx={{ bgcolor: 'primary.main', color: 'white' }}
              />
            )}
            {subjectName && (
              <Chip
                label={`Subject: ${subjectName}`}
                onDelete={removeSubject}
                color="primary"
                sx={{ bgcolor: 'primary.main', color: 'white' }}
              />
            )}
            
            {/* Selected tag chips */}
            {tags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                onDelete={() => handleDeleteTag(tag)}
                color="secondary"
                sx={{ bgcolor: 'secondary.main', color: 'white' }}
              />
            ))}

            {/* Tag input field */}
            <TextField
              variant="standard"
              value={inputValue}
              onChange={(e) => handleTagsInput(e.target.value)}
              onBlur={handleTagBlur}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleTagBlur();
                  e.preventDefault();
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
              InputProps={{
                disableUnderline: true,
                sx: { fontSize: '0.875rem' }
              }}
            />
          </Box>
        </Paper>
      )}

      {/* PDF Viewer box */}
      <Dialog
        open={!!openPdf}
        onClose={handleClosePdf}
        fullWidth
        maxWidth={isMobile ? "xs" : "xl"}
        fullScreen={!isMobile}
        sx={{
          '& .MuiDialog-paper': {
            margin: isMobile ? 0 : '32px',
            width: isMobile ? '100vw' : '100vw',
            height: isMobile ? '100vh' : '100vh',
            maxHeight: '100vh',
            maxWidth: '100vw',
            position: isMobile ? 'fixed' : 'relative',
            top: isMobile ? 0 : 'auto',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">View PDF</Typography>
          <IconButton onClick={handleClosePdf}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, overflow: 'hidden' }}>
          <iframe
            src={openPdf}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="PDF Viewer"
          />
        </DialogContent>
      </Dialog>

      {/* Status */}
      {loading && (
        <Grid container spacing={2}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Card variant="outlined">
                <Skeleton variant="rectangular" height={200} />
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

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && (
        <>
          {isEmpty ? (
            <Card variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h6">No books match the current filters</Typography>
              <Typography variant="body2" color="text.secondary">
                Try adjusting or clearing some filters to see more results.
              </Typography>
            </Card>
          ) : (
            <>
              <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Showing {filtered.length} book{filtered.length !== 1 ? 's' : ''}
                </Typography>
              </Box>
              <Grid container spacing={2}>
                {filtered.map((b) => {
                  const hasCover = b.coverURL && b.coverURL !== '';
                  const url = b.pdfURL || b.pdfUrl || '';
                  const fileName = b.title ? `${b.title.replace(/[^a-z0-9]/gi, '_')}.pdf` : 'book.pdf';
                  
                  // Check if book elements match current filters
                  const bookProgName = String(b.program || b.programName || '').trim();
                  const bookProgId = String(b.programId || '');
                  const bookSem = Number(b.semester || 0);
                  const bookSubjName = String(b.subject || b.subjectName || '').trim();
                  const bookSubjId = String(b.subjectId || '');
                  const bookTags = Array.isArray(b.tags) ? b.tags : [];
                  
                  const isProgActive = programId && (bookProgId.toLowerCase() === programId.toLowerCase() || bookProgName.toLowerCase() === programName.toLowerCase());
                  const isSemActive = semester && bookSem === Number(semester);
                  const isSubjActive = (subjectId && bookSubjId === subjectId) || (subjectName && bookSubjName.toLowerCase() === subjectName.toLowerCase());
                  
                  return (
                    <Grid item xs={12} sm={6} md={3} key={b.id}>
                      <Card 
                        variant="outlined" 
                        sx={{ 
                          height: '100%', 
                          display: 'flex', 
                          flexDirection: 'column',
                          transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
                          '&:hover': {
                            transform: 'translateY(-4px)',
                            boxShadow: 4,
                          }
                        }}
                      >
                        {hasCover ? (
                          <CardMedia
                            component="img"
                            height="200"
                            image={b.coverURL}
                            alt={b.title}
                            sx={{ 
                              objectFit: 'cover',
                              aspectRatio: '3/4',
                              height: '200px'
                            }}
                          />
                        ) : (
                          <Box
                            sx={{
                              height: 200,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              bgcolor: 'grey.100',
                              p: 2,
                              textAlign: 'center',
                            }}
                          >
                            <Typography variant="h6" fontWeight={600} sx={{ lineHeight: 1.25 }}>
                              {b.title || 'Untitled'}
                            </Typography>
                          </Box>
                        )}
                        <CardContent sx={{ flex: 1 }}>
                          <Typography variant="h6" sx={{ mb: 1, lineHeight: 1.25 }}>
                            {b.title || 'Untitled'}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {b.author || 'Unknown author'}
                          </Typography>
                          
                          {/*filter chips */}
                          <Stack direction="row" spacing={0.5} sx={{ mb: 1, flexWrap: 'wrap' }}>
                            <Chip
                              label={bookProgName || '—'}
                              size="small"
                              onClick={() => handleProgramClick({ id: bookProgId, name: bookProgName })}
                              sx={{ 
                                cursor: 'pointer',
                                bgcolor: isProgActive ? 'primary.main' : 'grey.200',
                                color: isProgActive ? 'white' : 'text.primary',
                                '&:hover': { bgcolor: isProgActive ? 'primary.dark' : 'grey.300' }
                              }}
                            />
                            <Chip
                              label={bookSem ? `Sem ${bookSem}` : 'Sem —'}
                              size="small"
                              onClick={() => handleSemesterClick(bookSem)}
                              sx={{ 
                                cursor: 'pointer',
                                bgcolor: isSemActive ? 'primary.main' : 'grey.200',
                                color: isSemActive ? 'white' : 'text.primary',
                                '&:hover': { bgcolor: isSemActive ? 'primary.dark' : 'grey.300' }
                              }}
                            />
                            <Chip
                              label={bookSubjName || '—'}
                              size="small"
                              onClick={() => handleSubjectClick({ id: bookSubjId, name: bookSubjName })}
                              sx={{ 
                                cursor: 'pointer',
                                bgcolor: isSubjActive ? 'primary.main' : 'grey.200',
                                color: isSubjActive ? 'white' : 'text.primary',
                                '&:hover': { bgcolor: isSubjActive ? 'primary.dark' : 'grey.300' }
                              }}
                            />
                          </Stack>

                          {/* tag chips */}
<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
  {bookTags.slice(0, 4).map((t) => {
    const isTagActive = tags.includes(String(t).toLowerCase());
    return (
            <Chip
              key={t}
              label={t}
              size="small"
              onClick={() => handleTagClick(t)}
              variant={isTagActive ? 'filled' : 'outlined'}
              sx={{
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
                fontWeight: 'medium',
                // Style for INACTIVE chips
                          ...(!isTagActive && {
                            color: '#9c27b0',
                            borderColor: '#9c27b0',
                            '&:hover': {
                              backgroundColor: '#1A237E',
                              color: 'blue', 
                              borderColor: '#1A237E', 
                            },
                          }),
                          //Style for ACTIVE chips
                          ...(isTagActive && {
                                backgroundColor: '#2a35ca79',
                                color: 'blue',
                                border: '1px solid #0015ffff',
                                '&:hover': {
                                  backgroundColor: '#230d4d7e',
                                },
                              }),
                              }}
                            />
                          );
                        })}
                      </Box>
                        </CardContent>
                        <Divider />
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1 }}>
                          <Button
                            size="small"
                            variant="text"
                            endIcon={<OpenInNewIcon />}
                            onClick={() => handleViewPdf(url)}
                            disabled={!url}
                          >
                            View
                          </Button>
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            endIcon={<DownloadIcon />}
                            component="a"
                            href={url}
                            download={fileName}
                            disabled={!url}
                            sx={{ textTransform: 'none' }}
                          >
                            Download
                          </Button>
                        </Stack>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </>
          )}
        </>
      )}
    </Container>
  );
}
