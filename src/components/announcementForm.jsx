import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Paper,
  Stack,
  TextField,
  Button,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  Switch,
  FormLabel,
  Divider,
  LinearProgress,
  Chip,
  Alert,
} from '@mui/material';
import { db, storage } from '../firebase/Firebase';
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';

const defaultState = {
  title: '',
  description: '',
  audience: 'both',
  eventDate: '',
  startTime: '',
  endTime: '',
  location: '',
  pdfFile: null,
};

function AnnouncementForm({
  mode = 'create',
  initialType = 'notice',
  defaultValues = null,
  collegeId,
  currentUser,
  onSaved,
  onCancel,
  onCreated,
}) {
  const [type, setType] = useState(initialType);
  const [values, setValues] = useState(defaultState);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const isEdit = mode === 'edit';
  const isNotice = type === 'notice';

  useEffect(() => {
  }, [mode, initialType, defaultValues, collegeId, currentUser]);

  useEffect(() => {
    if (isEdit && defaultValues) {
      setType(defaultValues.type || initialType);
      setValues((prev) => ({
        ...prev,
        title: defaultValues.title || '',
        description: defaultValues.description || '',
        audience: defaultValues.audience || 'both',
        eventDate: defaultValues.eventDate || '',
        startTime: defaultValues.startTime || '',
        endTime: defaultValues.endTime || '',
        location: defaultValues.location || '',
        pdfFile: null,
      }));
    }
  }, [isEdit, defaultValues, initialType]);

  const collName = useMemo(() => (isNotice ? 'Notices' : 'Events'), [isNotice]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setValues((s) => ({ ...s, [name]: value }));
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0] || null;
    setValues((s) => ({ ...s, pdfFile: file }));
  };

  const validate = () => {
    if (!values.title.trim()) return 'Title is required.';
    if (!['students', 'teachers', 'both'].includes(values.audience))
      return 'Audience is invalid.';
    if (isNotice && !isEdit && !values.pdfFile)
      return 'PDF is required for notices.';
    if (!collegeId) return 'collegeId is missing.';
    if (!currentUser?.uid) return 'currentUser is missing.';
    return null;
  };

  const uploadPdfIfAny = async (docId) => {
    if (!values.pdfFile) {
      return {
        pdfUrl: defaultValues?.pdfUrl || '',
        pdfName: defaultValues?.pdfName || '',
      };
    }
    const safeName = values.pdfFile.name.replace(/\s+/g, '-');
    const path = `${collName.toLowerCase()}/${collegeId}/${docId}-${safeName}`;
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, values.pdfFile);

    try {
      const url = await new Promise((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setProgress(pct);
          },
          reject,
          async () => {
            const u = await getDownloadURL(task.snapshot.ref);
            resolve(u);
          }
        );
      });
      return { pdfUrl: url, pdfName: values.pdfFile.name };
    } catch (err) {
      throw new Error('PDF upload failed: ' + err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }

    setSubmitting(true);
    setProgress(0);
    setError(null);

    try {
      if (isEdit) {
        const docId = defaultValues.id;
        const pdfMeta = await uploadPdfIfAny(docId);

        const payload = {
          title: values.title.trim(),
          description: values.description.trim(),
          audience: values.audience,
          updatedAt: serverTimestamp(),
          updatedBy: {
            uid: currentUser.uid,
            name: currentUser.displayName || '',
            role: currentUser.role || 'associate',
          },
          ...(type === 'event' && {
            eventDate: values.eventDate || '',
            startTime: values.startTime || '',
            endTime: values.endTime || '',
            location: values.location || '',
          }),
          ...(pdfMeta.pdfUrl && { pdfUrl: pdfMeta.pdfUrl, pdfName: pdfMeta.pdfName }),
        };

        await updateDoc(doc(db, collName, docId), payload);
      } else {
        const newRef = doc(collection(db, collName));
        const docId = newRef.id;
        const pdfMeta = await uploadPdfIfAny(docId);

        const payload = {
          id: docId,
          type, // 'notice' or 'event'
          title: values.title.trim(),
          description: values.description.trim(),
          audience: values.audience,
          collegeId,
          createdAt: serverTimestamp(),
          createdBy: {
            uid: currentUser.uid,
            name: currentUser.displayName || '',
            role: currentUser.role || 'associate',
          },
          ...(type === 'event' && {
            eventDate: values.eventDate || '',
            startTime: values.startTime || '',
            endTime: values.endTime || '',
            location: values.location || '',
          }),
          ...(pdfMeta.pdfUrl && { pdfUrl: pdfMeta.pdfUrl, pdfName: pdfMeta.pdfName }),
        };

        await setDoc(newRef, payload);
        onCreated?.({ id: docId, ...payload });
      }

      setSubmitting(false);
      setProgress(0);
      if (!isEdit) setValues(defaultState);
      onSaved?.();
    } catch (error) {
      console.error('Submit error:', error);
      setSubmitting(false);
      setError('Failed to save announcement: ' + error.message);
    }
  };

  return (
    <Paper elevation={2} sx={{ p: 2 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <form onSubmit={handleSubmit}>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">
              {isEdit ? 'Edit Announcement' : 'Create Announcement'}
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <Chip
                label={isNotice ? 'Notice' : 'Event'}
                color={isNotice ? 'primary' : 'secondary'}
                size="small"
              />
              {!isEdit && (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="body2">Notice</Typography>
                  <Switch
                    checked={type === 'event'}
                    onChange={(e) => setType(e.target.checked ? 'event' : 'notice')}
                  />
                  <Typography variant="body2">Event</Typography>
                </Stack>
              )}
            </Stack>
          </Stack>

          <TextField
            label="Title"
            name="title"
            value={values.title}
            onChange={handleChange}
            required
            fullWidth
            error={!!error && error.toLowerCase().includes('title')}
            helperText={error && error.toLowerCase().includes('title') ? error : ''}
          />

          <TextField
            label="Description"
            name="description"
            value={values.description}
            onChange={handleChange}
            multiline
            minRows={3}
            fullWidth
          />

          <Box>
            <FormLabel component="legend">Audience</FormLabel>
            <RadioGroup
              row
              name="audience"
              value={values.audience}
              onChange={handleChange}
            >
              <FormControlLabel value="students" control={<Radio />} label="Students" />
              <FormControlLabel value="teachers" control={<Radio />} label="Teachers" />
              <FormControlLabel value="both" control={<Radio />} label="Both" />
            </RadioGroup>
          </Box>

          {type === 'event' && (
            <>
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                <TextField
                  label="Event Date"
                  name="eventDate"
                  type="date"
                  value={values.eventDate}
                  onChange={handleChange}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
                <TextField
                  label="Start Time"
                  name="startTime"
                  type="time"
                  value={values.startTime}
                  onChange={handleChange}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
                <TextField
                  label="End Time"
                  name="endTime"
                  type="time"
                  value={values.endTime}
                  onChange={handleChange}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Stack>
              <TextField
                label="Location"
                name="location"
                value={values.location}
                onChange={handleChange}
                fullWidth
              />
            </>
          )}
          <Divider />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
            <Button variant="outlined" component="label">
              {isNotice ? 'Upload PDF (required)' : 'Upload PDF (optional)'}
              <input type="file" accept="application/pdf" hidden onChange={handleFile} />
            </Button>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {values.pdfFile
                ? values.pdfFile.name
                : isEdit && defaultValues?.pdfName
                ? `Current: ${defaultValues.pdfName}`
                : 'No file selected'}
            </Typography>
            {error && error.includes('PDF') && (
              <Typography color="error" variant="caption">
                {error}
              </Typography>
            )}
          </Stack>

          {submitting && (
            <Box>
              <LinearProgress variant="determinate" value={progress} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Uploading {progress}%
              </Typography>
            </Box>
          )}

          <Stack direction="row" spacing={2} justifyContent="flex-end">
            <Button onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={submitting || !!error}>
              {isEdit ? 'Save Changes' : 'Create'}
            </Button>
          </Stack>
        </Stack>
      </form>
    </Paper>
  );
}

AnnouncementForm.propTypes = {
  mode: PropTypes.oneOf(['create', 'edit']),
  initialType: PropTypes.oneOf(['notice', 'event']),
  defaultValues: PropTypes.shape({
    id: PropTypes.string,
    type: PropTypes.oneOf(['notice', 'event']),
    title: PropTypes.string,
    description: PropTypes.string,
    audience: PropTypes.oneOf(['students', 'teachers', 'both']),
    collegeId: PropTypes.string,
    createdAt: PropTypes.any,
    updatedAt: PropTypes.any,
    createdBy: PropTypes.shape({
      uid: PropTypes.string,
      name: PropTypes.string,
      role: PropTypes.string,
    }),
    updatedBy: PropTypes.shape({
      uid: PropTypes.string,
      name: PropTypes.string,
      role: PropTypes.string,
    }),
    eventDate: PropTypes.string,
    startTime: PropTypes.string,
    endTime: PropTypes.string,
    location: PropTypes.string,
    pdfUrl: PropTypes.string,
    pdfName: PropTypes.string,
  }),
  collegeId: PropTypes.string,
  currentUser: PropTypes.shape({
    uid: PropTypes.string,
    displayName: PropTypes.string,
    role: PropTypes.string,
    collegeId: PropTypes.string,
  }),
  onSaved: PropTypes.func,
  onCancel: PropTypes.func,
  onCreated: PropTypes.func,
};

AnnouncementForm.defaultProps = {
  mode: 'create',
  initialType: 'notice',
  defaultValues: null,
  collegeId: undefined,
  currentUser: undefined,
  onSaved: undefined,
  onCancel: undefined,
  onCreated: undefined,
};

export default AnnouncementForm;
