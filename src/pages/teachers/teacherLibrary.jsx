import React, { useEffect, useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Tabs,
  Tab,
  Button,
  Stack,
  TextField,
  Select,
  MenuItem,
  Chip,
  Alert,
  LinearProgress,
  FormHelperText,
  Paper,
} from '@mui/material';
import { motion } from 'framer-motion';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ImageIcon from '@mui/icons-material/Image';
import { collection, doc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase/Firebase';
import axios from 'axios';
import { toast } from 'react-toastify';
import Library from '../students/library';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const MAX_PDF_BYTES = 20 * 1024 * 1024; 

export default function TeacherLibrary() {
  const [tab, setTab] = useState('upload');
  const auth = getAuth();
  const user = auth.currentUser;
  const [programs, setPrograms] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [catalogError, setCatalogError] = useState('');
  const [subjectError, setSubjectError] = useState('');
  const [form, setForm] = useState({
    title: '',
    author: '',
    programId: '',
    semester: '',
    subjectId: '',
    subjectName: '',
    tags: [],
    year: '',
    isbn: '',
  });
  const [inputValue, setInputValue] = useState('');
  const [errors, setErrors] = useState({ year: '', pdf: '', tags: '' });
  const [pdfFile, setPdfFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [books, setBooks] = useState([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [viewMode, setViewMode] = useState('all');

  // API fetch helpers with authentication
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

  const fetchSubjectById = async (subjectId) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/subjects/${subjectId}`, { headers: await getAuthHeaders() });
      return res.data;
    } catch (err) {
      console.error('Error fetching subject:', err);
      throw new Error('Failed to fetch subject details');
    }
  };

  // Load catalog
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

  useEffect(() => {
    let active = true;
    if (!form.programId) {
      setSemesters([]);
      setSubjects([]);
      setForm((s) => ({ ...s, semester: '', subjectId: '', subjectName: '' }));
      return;
    }
    (async () => {
      try {
        const sems = await fetchProgramSemesters(form.programId);
        if (!active) return;
        setSemesters(Array.isArray(sems) ? sems : []);
      } catch (e) {
        console.error('Fetch semesters error:', e);
        if (active) setSemesters([]);
      }
    })();
    return () => { active = false; };
  }, [form.programId]);

  useEffect(() => {
    let active = true;
    if (!form.programId || !form.semester) {
      setSubjects([]);
      setForm((s) => ({ ...s, subjectId: '', subjectName: '' }));
      return;
    }
    (async () => {
      try {
        const subs = await fetchSubjectsFor(form.programId, form.semester);
        if (!active) return;
        setSubjects(Array.isArray(subs) ? subs : []);
      } catch (e) {
        console.error('Fetch subjects error:', e);
        if (active) setSubjects([]);
      }
    })();
    return () => { active = false; };
  }, [form.programId, form.semester]);

  // Fetch subject name
  useEffect(() => {
    let active = true;
    if (!form.subjectId) {
      setForm((s) => ({ ...s, subjectName: '' }));
      setSubjectError('');
      return;
    }
    (async () => {
      setSubjectError('');
      try {
        const subject = await fetchSubjectById(form.subjectId);
        if (!active) return;
        setForm((s) => ({ ...s, subjectName: subject.subjectName || '' }));
      } catch (e) {
        console.error('Fetch subject name error:', e);
        if (active) {
          setSubjectError('Failed to load subject details.');
          toast.error('Failed to load subject details.');
        }
      }
    })();
    return () => { active = false; };
  }, [form.subjectId]);

  // Read library
  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingBooks(true);
      setLoadError('');
      try {
        const snap = await getDocs(collection(db, 'books'));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (active) setBooks(rows);
      } catch (e) {
        console.error('Fetch books error:', e);
        if (active) setLoadError('Failed to load books.');
      } finally {
        if (active) setLoadingBooks(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // Validations
  const currentYear = new Date().getFullYear();
  const validateYear = (val) => {
    const str = String(val || '').trim();
    if (!str) return '';
    if (!/^\d{4}$/.test(str)) return 'Enter a 4-digit year';
    const num = Number(str);
    if (num < 1900) return 'Year must be >= 1900';
    if (num > currentYear) return 'Year cannot be in the future';
    return '';
  };
  const validatePdfFile = (file) => {
    if (!file) return 'PDF is required';
    if (file.type !== 'application/pdf') return 'Only PDF files are allowed';
    if (file.size > MAX_PDF_BYTES) return 'PDF must be 20MB or smaller';
    return '';
  };
  const normalizedTags = (arr) =>
    Array.from(new Set((arr || []).filter(Boolean).map((t) => String(t).trim().toLowerCase()).filter((t) => t.length)));

  // Handle tags input
  const handleTagsInput = (value) => {
    setInputValue(value);
    const newTags = value
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (value.endsWith(' ') || value.endsWith(',')) {
      const combinedTags = [...form.tags, ...newTags];
      const normalized = normalizedTags(combinedTags);
      setForm((s) => ({ ...s, tags: normalized }));
      setErrors((er) => ({ ...er, tags: normalized.length > 10 ? 'Max 10 tags allowed' : '' }));
      setInputValue('');
    }
  };

  const handleDeleteTag = (tagToDelete) => {
    const updatedTags = form.tags.filter((tag) => tag !== tagToDelete);
    setForm((s) => ({ ...s, tags: updatedTags }));
    setErrors((er) => ({ ...er, tags: updatedTags.length > 10 ? 'Max 10 tags allowed' : '' }));
  };

  const handleBlur = () => {
    if (inputValue.trim()) {
      const newTags = inputValue
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const combinedTags = [...form.tags, ...newTags];
      const normalized = normalizedTags(combinedTags);
      setForm((s) => ({ ...s, tags: normalized }));
      setErrors((er) => ({ ...er, tags: normalized.length > 10 ? 'Max 10 tags allowed' : '' }));
      setInputValue('');
    }
  };

  // Upload
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (!user) {
      setSubmitError('Sign in required to upload.');
      toast.error('Sign in required to upload.');
      return;
    }

    const pdfErr = validatePdfFile(pdfFile);
    const yrErr = validateYear(form.year);
    const tagErr = form.tags.length > 10 ? 'Max 10 tags allowed' : '';
    setErrors({ pdf: pdfErr, year: yrErr, tags: tagErr });
    if (pdfErr || yrErr || tagErr) {
      toast.error('Please fix form errors before submitting.');
      return;
    }

    try {
      setUploading(true);
      const docRef = doc(collection(db, 'books'));
      const bookId = docRef.id;

      // Upload PDF
      const pdfPath = `books/${bookId}/${encodeURIComponent(pdfFile.name)}`;
      const pdfRef = ref(storage, pdfPath);
      const pdfTask = uploadBytesResumable(pdfRef, pdfFile, { contentType: pdfFile.type });
      const pdfURL = await new Promise((resolve, reject) => {
        pdfTask.on(
          'state_changed',
          (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          async () => resolve(await getDownloadURL(pdfTask.snapshot.ref))
        );
      });

      // Optional cover image
      let coverURL = '';
      if (coverFile) {
        const coverPath = `books/${bookId}/cover-${Date.now()}-${encodeURIComponent(coverFile.name)}`;
        const coverRef = ref(storage, coverPath);
        const coverTask = uploadBytesResumable(coverRef, coverFile, { contentType: coverFile.type });
        await new Promise((resolve, reject) => {
          coverTask.on('state_changed', () => {}, reject, resolve);
        });
        coverURL = await getDownloadURL(coverRef);
      }


      const payload = {
        title: form.title.trim(),
        author: form.author.trim(),
        programId: form.programId || '',
        semester: form.semester ? Number(form.semester) : null,
        subjectId: form.subjectId || '',
        subject: form.subjectName || '',
        tags: normalizedTags(form.tags),
        year: form.year ? Number(form.year) : null,
        isbn: form.isbn || '',
        pdfURL,
        coverURL,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      };

      await setDoc(docRef, payload);
      setBooks((prev) => [{ id: bookId, ...payload }, ...prev]);

      setSubmitSuccess('Book uploaded successfully.');
      toast.success('Book uploaded successfully.');
      setTab('library');
      setForm({
        title: '',
        author: '',
        programId: '',
        semester: '',
        subjectId: '',
        subjectName: '',
        tags: [],
        year: '',
        isbn: '',
      });
      setInputValue('');
      setPdfFile(null);
      setCoverFile(null);
      setProgress(0);
    } catch (err) {
      console.error('Upload error:', err);
      setSubmitError('Upload failed. Please try again.');
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  // Menus
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

  // Form validation
  const formInvalid = uploading || !form.title.trim() || !form.author.trim() || !!errors.year || !!errors.pdf || !!errors.tags || !pdfFile;

  return (
    <Container maxWidth="lg" sx={{ py: 6, bgcolor: 'grey.50', minHeight: '100vh' }}>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
          <Typography variant="h4" fontWeight={700} color="primary.main">
            Teacher Library
          </Typography>
        </Stack>

        {catalogError && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{catalogError}</Alert>
        )}

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            mb: 4,
            bgcolor: 'white',
            borderRadius: 2,
            boxShadow: 1,
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 },
            '& .MuiTabs-indicator': { backgroundColor: 'primary.main' },
          }}
        >
          <Tab value="upload" label="Upload Book" />
          <Tab value="library" label="Library" />
        </Tabs>

        {tab === 'upload' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
            <Paper elevation={3} sx={{ p: 4, borderRadius: 3, bgcolor: 'white' }}>
              <Typography variant="h5" fontWeight={600} sx={{ mb: 3, color: 'text.primary' }}>
                Upload New Book
              </Typography>

              <Box component="form" onSubmit={handleSubmit}>
                <Stack spacing={3}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                      label="Title"
                      value={form.title}
                      onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                      fullWidth
                      required
                      variant="outlined"
                      sx={{ bgcolor: 'white', borderRadius: 1 }}
                    />
                    <TextField
                      label="Author"
                      value={form.author}
                      onChange={(e) => setForm((s) => ({ ...s, author: e.target.value }))}
                      fullWidth
                      required
                      variant="outlined"
                      sx={{ bgcolor: 'white', borderRadius: 1 }}
                    />
                  </Stack>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Select
                      fullWidth
                      displayEmpty
                      value={form.programId}
                      onChange={(e) => {
                        const p = programs.find((x) => String(x._id) === String(e.target.value));
                        setForm((s) => ({
                          ...s,
                          programId: e.target.value,
                          programName: p?.name || '',
                          semester: '',
                          subjectId: '',
                          subjectName: '',
                        }));
                      }}
                      variant="outlined"
                      sx={{ bgcolor: 'white', borderRadius: 1 }}
                    >
                      <MenuItem value=""><em>Select Program (Optional)</em></MenuItem>
                      {programMenuItems}
                    </Select>
                    <Select
                      fullWidth
                      displayEmpty
                      value={form.semester}
                      onChange={(e) => setForm((s) => ({ ...s, semester: e.target.value, subjectId: '', subjectName: '' }))}
                      disabled={!form.programId}
                      variant="outlined"
                      sx={{ bgcolor: 'white', borderRadius: 1 }}
                    >
                      <MenuItem value=""><em>Select Semester (Optional)</em></MenuItem>
                      {semesterMenuItems}
                    </Select>
                    <Select
                      fullWidth
                      displayEmpty
                      value={form.subjectId}
                      onChange={(e) => {
                        setForm((s) => ({ ...s, subjectId: e.target.value }));
                      }}
                      disabled={!form.programId || !form.semester}
                      variant="outlined"
                      sx={{ bgcolor: 'white', borderRadius: 1 }}
                    >
                      <MenuItem value=""><em>Select Subject (Optional)</em></MenuItem>
                      {subjectMenuItems}
                    </Select>
                  </Stack>

                  {form.subjectName && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Selected Subject: {form.subjectName}
                    </Typography>
                  )}
                  {subjectError && (
                    <Alert severity="error" sx={{ borderRadius: 2 }}>{subjectError}</Alert>
                  )}

                  <Stack spacing={1}>
                    <Box
                      sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 1,
                        mb: 1,
                        border: '1px solid',
                        borderColor: errors.tags ? 'error.main' : 'grey.300',
                        borderRadius: 1,
                        p: 1,
                        bgcolor: 'white',
                      }}
                    >
                      {form.tags.map((tag) => (
                        <Chip
                          key={tag}
                          label={tag}
                          onDelete={() => handleDeleteTag(tag)}
                          sx={{
                            bgcolor: 'primary.light',
                            color: 'primary.contrastText',
                            borderRadius: '16px',
                            height: '24px',
                            fontSize: '0.75rem',
                            m: 0.5,
                            '& .MuiChip-label': { px: 1.5 },
                            '& .MuiChip-deleteIcon': { fontSize: '16px' },
                          }}
                        />
                      ))}
                      <TextField
                        variant="standard"
                        value={inputValue}
                        onChange={(e) => handleTagsInput(e.target.value)}
                        onBlur={handleBlur}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            handleBlur();
                            e.preventDefault();
                          }
                        }}
                        placeholder={form.tags.length === 0 ? "Add tags (e.g., python, django)" : ""}
                        sx={{ flexGrow: 1, minWidth: '150px' }}
                        InputProps={{
                          disableUnderline: true,
                        }}
                        error={!!errors.tags}
                      />
                    </Box>
                    {errors.tags && <FormHelperText error>{errors.tags}</FormHelperText>}
                  </Stack>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                      label="Year"
                      type="text"
                      inputMode="numeric"
                      value={form.year}
                      onChange={(e) => {
                        const next = e.target.value.replace(/[^\d]/g, '').slice(0, 4);
                        setForm((s) => ({ ...s, year: next }));
                        setErrors((er) => ({ ...er, year: validateYear(next) }));
                      }}
                      onBlur={() => setErrors((er) => ({ ...er, year: validateYear(form.year) }))}
                      error={!!errors.year}
                      helperText={errors.year || '4-digit year, not in the future'}
                      fullWidth
                      variant="outlined"
                      sx={{ bgcolor: 'white', borderRadius: 1 }}
                    />
                    <TextField
                      label="ISBN (Optional)"
                      value={form.isbn}
                      onChange={(e) => setForm((s) => ({ ...s, isbn: e.target.value }))}
                      fullWidth
                      variant="outlined"
                      sx={{ bgcolor: 'white', borderRadius: 1 }}
                    />
                  </Stack>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Button
                      variant="outlined"
                      component="label"
                      startIcon={<UploadFileIcon />}
                      fullWidth
                      sx={{ py: 1, borderRadius: 1 }}
                    >
                      {pdfFile ? pdfFile.name : 'Choose PDF (max 20MB)'}
                      <input
                        hidden
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null;
                          setPdfFile(f);
                          setErrors((er) => ({ ...er, pdf: validatePdfFile(f) }));
                        }}
                      />
                    </Button>
                    <Button
                      variant="outlined"
                      component="label"
                      startIcon={<ImageIcon />}
                      fullWidth
                      sx={{ py: 1, borderRadius: 1 }}
                    >
                      {coverFile ? coverFile.name : 'Choose Cover (optional)'}
                      <input
                        hidden
                        type="file"
                        accept="image/*"
                        onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
                      />
                    </Button>
                  </Stack>
                  {errors.pdf && <FormHelperText error>{errors.pdf}</FormHelperText>}

                  {uploading && (
                    <Stack spacing={1}>
                      <LinearProgress variant="determinate" value={progress} sx={{ borderRadius: 2 }} />
                      <Typography variant="caption" color="text.secondary">
                        Uploading… {progress}%
                      </Typography>
                    </Stack>
                  )}

                  {submitError && (
                    <Alert severity="error" sx={{ borderRadius: 2 }}>{submitError}</Alert>
                  )}
                  {submitSuccess && (
                    <Alert severity="success" sx={{ borderRadius: 2 }}>{submitSuccess}</Alert>
                  )}

                  <Stack direction="row" spacing={2} justifyContent="flex-end">
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setForm({
                          title: '',
                          author: '',
                          programId: '',
                          semester: '',
                          subjectId: '',
                          subjectName: '',
                          tags: [],
                          year: '',
                          isbn: '',
                        });
                        setInputValue('');
                        setPdfFile(null);
                        setCoverFile(null);
                        setErrors({ year: '', pdf: '', tags: '' });
                      }}
                      disabled={uploading}
                      sx={{ borderRadius: 1 }}
                    >
                      Reset
                    </Button>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={formInvalid}
                      sx={{ borderRadius: 1, px: 4 }}
                    >
                      Upload
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            </Paper>
          </motion.div>
        )}

        {tab === 'library' && (
          <Library
            books={books}
            user={user}
            loadingBooks={loadingBooks}
            loadError={loadError}
            viewMode={viewMode}
            setViewMode={setViewMode}
          />
        )}
      </motion.div>
    </Container>
  );
}