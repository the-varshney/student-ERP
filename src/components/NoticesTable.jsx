import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Alert,
  Chip,
  Tooltip,
  IconButton,
  TextField,
  InputAdornment,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TablePagination,
  Dialog,
  DialogTitle,
  DialogContent,
  Divider,
  Button,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase/Firebase';
import { HeaderBackButton } from './header';
import SecondaryHeader from './secondaryHeader';
import PDFViewer from './pdfViewer';

const ALL_COLLEGES_KEY = 'C000';

const tsToMs = (t) => {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  return 0;
};

function NoticesTable({
  collegeId,
  headerTitle,
  placeholder,
  chipSelfLabel,
  roleFilter,   // 'students' | 'teachers' 
  source,       // 'notices' | 'events' | 'both'
  showType,     
  showAudience,
}) {
  const [rows, setRows] = useState([]);
  const [queryError, setQueryError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRpp] = useState(10);

  useEffect(() => {
    setQueryError('');
  }, [collegeId]);

  useEffect(() => {
    if (!collegeId) return;

    let mounted = true;
    const unsubs = [];
    setRows([]); // reset when college changes

    const subscribe = (collName, typeLabel) => {
      const qRef = query(
        collection(db, collName),
        where('collegeId', 'in', [collegeId, ALL_COLLEGES_KEY]),
        limit(200)
      );
      const unsub = onSnapshot(
        qRef,
        (snap) => {
          if (!mounted) return;
          const docs = snap.docs.map((d) => ({ id: d.id, type: typeLabel, ...d.data() }));
          setRows((prev) => {
            const map = new Map();
            const base = source === 'both' ? prev : [];
            base.forEach((r) => map.set(`${r.type}-${r.id}`, r));
            docs.forEach((r) => map.set(`${r.type}-${r.id}`, r));
            return Array.from(map.values());
          });
        },
        (err) => {
          if (!mounted) return;
          setQueryError(`Failed to load ${collName.toLowerCase()}: ` + err.message);
        }
      );
      unsubs.push(unsub);
    };

    if (source === 'notices') {
      subscribe('Notices', 'notice');
    } else if (source === 'events') {
      subscribe('Events', 'event');
    } else {
      subscribe('Notices', 'notice');
      subscribe('Events', 'event');
    }

    return () => {
      mounted = false;
      unsubs.forEach((fn) => fn && fn());
    };
  }, [collegeId, source]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    const audienceAllowed = (aud) => {
      if (roleFilter === 'both-allowed') return true;
      if (roleFilter === 'students') return aud === 'students' || aud === 'both';
      if (roleFilter === 'teachers') return aud === 'teachers' || aud === 'both';
      return true;
    };

    const list = rows
      .filter((r) => audienceAllowed(r.audience))
      .sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));

    if (!q) return list;

    return list.filter((r) => {
      const hay = [
        r.title,
        r.description,
        r.pdfName,
        r.location,
        r.eventDate,
        r.startTime,
        r.endTime,
        r.collegeId === ALL_COLLEGES_KEY ? 'all colleges' : r.collegeId,
        r.type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, roleFilter]);

  const paged = useMemo(
    () => filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filtered, page, rowsPerPage]
  );

  const total = filtered.length;

  // eslint-disable-next-line no-unused-vars
  const openDetails = (r) => setSelected(r);
  const rowKeyHandler = (e, r) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelected(r);
    }
  };

  const TypeChip = ({ t }) =>
    t === 'event' ? (
      <Chip size="small" label="Event" color="secondary" />
    ) : (
      <Chip size="small" label="Notice" color="primary" />
    );
  TypeChip.propTypes = {
    t: PropTypes.oneOf(['notice', 'event']).isRequired,
  };

  const AudienceChip = ({ a }) => {
    if (a === 'teachers') return <Chip size="small" label="Teachers only" color="warning" variant="outlined" />;
    if (a === 'both') return <Chip size="small" label="Both" color="success" variant="outlined" />;
    if (a === 'students') return <Chip size="small" label="Students only" variant="outlined" />;
    return null;
  };
  AudienceChip.propTypes = {
    a: PropTypes.oneOf(['teachers', 'students', 'both']),
  };

  // Normalizers for PDF fields
  const getPdfMeta = (obj) => {
    const rawUrl =
      (typeof obj.pdfUrl === 'string' && obj.pdfUrl) ||
      (typeof obj.pdfURL === 'string' && obj.pdfURL) ||
      (typeof obj.fileUrl === 'string' && obj.fileUrl) ||
      '';
    const url = rawUrl.trim();
    const name = (obj.pdfName || obj.fileName || '').toString();
    return { url, name };
  };

  const dynamicColSpan = 5 + (showType ? 1 : 0) + (showAudience ? 1 : 0);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, minHeight: '100vh' }}>
      {/* Header */}
      <SecondaryHeader
        title={headerTitle}
        leftArea={<HeaderBackButton />}
        rightArea={
          <Stack direction="row" spacing={1} alignItems="center" sx={{ width: { xs: '100%', sm: 440 } }}>
            <TextField
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              size="small"
              fullWidth
              placeholder={placeholder}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <Chip label={`Total: ${total}`} />
          </Stack>
        }
      />

      {queryError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {queryError}
        </Alert>
      )}

      {/* Table */}
      <Paper elevation={2} sx={{ overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 560 }}>
          <Table stickyHeader size="small" aria-label="announcements table">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: '40%' }}>Title</TableCell>
                {showType && <TableCell sx={{ fontWeight: 700, width: 120 }}>Type</TableCell>}
                <TableCell sx={{ fontWeight: 700, width: 130 }}>Visibility</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 180 }}>Published</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 120 }}>Order Copy</TableCell>
                {showAudience && <TableCell sx={{ fontWeight: 700, width: 150 }}>Audience</TableCell>}
                <TableCell sx={{ fontWeight: 700, width: 100, textAlign: 'right' }}>Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={dynamicColSpan}>
                    <Typography variant="body2" color="text.secondary" component="div">
                      No items found.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}

              {paged.map((r) => {
                const { url: pdfUrl, name: pdfName } = getPdfMeta(r);
                const hasPdf = pdfUrl.length > 0;
                const created = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : '—';
                const visibilityChip =
                  r.collegeId === ALL_COLLEGES_KEY ? (
                    <Chip size="small" label="All Colleges" color="success" variant="outlined" />
                  ) : (
                    <Chip size="small" label={chipSelfLabel} variant="outlined" />
                  );

                return (
                  <TableRow
                    key={`${r.type}-${r.id}`}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setSelected(r)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => rowKeyHandler(e, r)}
                  >
                    <TableCell>
                      <Stack spacing={0.5}>
                        <Typography variant="subtitle2" component="div" sx={{ fontWeight: 600 }}>
                          {r.title}
                        </Typography>
                        {r.description && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            component="div"
                            sx={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {r.description}
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>

                    {showType && (
                      <TableCell>
                        <TypeChip t={r.type} />
                      </TableCell>
                    )}

                    <TableCell>{visibilityChip}</TableCell>

                    <TableCell>
                      <Typography variant="body2" component="div">{created}</Typography>
                    </TableCell>

                    <TableCell>
                      {hasPdf ? (
                        <Tooltip title={pdfName || 'Order copy'}>
                          <Chip
                            size="small"
                            icon={<PictureAsPdfIcon sx={{ fontSize: 16 }} />}
                            label="Available"
                            color="primary"
                            variant="outlined"
                          />
                        </Tooltip>
                      ) : (
                        <Chip
                          size="small"
                          icon={<InsertDriveFileIcon sx={{ fontSize: 16 }} />}
                          label="Not available"
                          variant="outlined"
                        />
                      )}
                    </TableCell>

                    {showAudience && (
                      <TableCell>
                        <AudienceChip a={r.audience} />
                      </TableCell>
                    )}

                    <TableCell align="right">
                      <Tooltip title="Open details">
                        <IconButton
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(r);
                          }}
                          size="small"
                          color="primary"
                        >
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          rowsPerPageOptions={[5, 10, 25, 50]}
          count={total}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRpp(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>

      {/* Details dialog box*/}
      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        fullWidth
        maxWidth="md"
        aria-labelledby="announcement-detail-title"
      >
        <DialogTitle id="announcement-detail-title" sx={{ pr: 6 }}>
          <Typography variant="h6" component="span">{selected?.title || 'Announcement'}</Typography>
          <IconButton
            aria-label="close"
            onClick={() => setSelected(null)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
            size="small"
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selected && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                {selected.type === 'event' ? (
                  <Chip size="small" label="Event" color="secondary" />
                ) : (
                  <Chip size="small" label="Notice" color="primary" />
                )}
                {selected.collegeId === ALL_COLLEGES_KEY && (
                  <Chip size="small" label="All Colleges" color="success" variant="outlined" />
                )}
                <Chip
                  size="small"
                  label={
                    selected.createdAt?.toDate
                      ? selected.createdAt.toDate().toLocaleString()
                      : '—'
                  }
                />
                {showAudience && <AudienceChip a={selected.audience} />}
              </Stack>

              {/* Event details */}
              {selected.type === 'event' && (
                <>
                  <Typography variant="subtitle2" component="div">Event Details</Typography>
                  <Stack direction="row" spacing={2} flexWrap="wrap">
                    {selected.eventDate && (
                      <Chip size="small" label={`Date: ${selected.eventDate}`} variant="outlined" />
                    )}
                    {(selected.startTime || selected.endTime) && (
                      <Chip
                        size="small"
                        label={`Time: ${selected.startTime || '—'} - ${selected.endTime || '—'}`}
                        variant="outlined"
                      />
                    )}
                    {selected.location && (
                      <Chip size="small" label={`Location: ${selected.location}`} variant="outlined" />
                    )}
                  </Stack>
                </>
              )}

              {selected.description && (
                <>
                  <Typography variant="subtitle2" component="div">Description</Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }} component="div">
                    {selected.description}
                  </Typography>
                </>
              )}

              <Divider />

              {(() => {
                const { url: pdfUrl, name: pdfName } = getPdfMeta(selected);
                if (pdfUrl) {
                  return (
                    <Stack spacing={1}>
                      <Typography variant="subtitle2" component="div">
                        Order Copy {pdfName ? `(${pdfName})` : ''}
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<PictureAsPdfIcon />}
                          href={pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          href={pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={pdfName || 'file.pdf'}
                        >
                          Download
                        </Button>
                      </Stack>

                      {/* PDF Viewer */}
                      <PDFViewer
                        fileUrl={pdfUrl}
                        downloadable={false} 
                        showHeader={false}
                        height={{ xs: 360, md: 500 }}
                        containerSx={{
                          mt: 1,
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1,
                          bgcolor: 'background.paper',
                        }}
                        pageMaxWidth={1000}
                        pageWidthPct={0.95}
                      />
                    </Stack>
                  );
                }
                return <Alert severity="info">No order copy attached.</Alert>;
              })()}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}

NoticesTable.displayName = 'NoticesTable';

NoticesTable.propTypes = {
  collegeId: PropTypes.string.isRequired,
  headerTitle: PropTypes.string,
  placeholder: PropTypes.string,
  chipSelfLabel: PropTypes.string,
  roleFilter: PropTypes.oneOf(['students', 'teachers', 'both-allowed']),
  source: PropTypes.oneOf(['notices', 'events', 'both']),
  showType: PropTypes.bool,
  showAudience: PropTypes.bool,
};

NoticesTable.defaultProps = {
  headerTitle: 'Notices',
  placeholder: 'Search by title, description, order copy, visibility...',
  chipSelfLabel: 'My College',
  roleFilter: 'students',
  source: 'notices',
  showType: false,
  showAudience: false,
};

export default NoticesTable;
