/* eslint-disable no-unused-vars */
import React, { useEffect, useState, useCallback } from "react";
import {
  Box, Typography, IconButton, Snackbar,
  Alert, Stack, Dialog, DialogTitle, DialogContent, Skeleton,
  Button, Chip, Grid, Avatar, useTheme, Card, CardContent,Tooltip
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  Close as CloseIcon,
  EmojiEvents as TrophyIcon,
  Download as DownloadIcon,
  Visibility as PreviewIcon,
  PictureAsPdf as PdfIcon,
  MilitaryTech as PremiumIcon,
} from "@mui/icons-material";
import { motion } from "framer-motion";

import { auth, db } from "../../firebase/Firebase";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import PdfViewer from "../../components/PdfViewer";
 import { HeaderBackButton } from "../../components/header";
 import SecondaryHeader from "../../components/secondaryHeader";

//Cache
const NS = "erp";
const VER = "v1";
const LAST_UID_KEY = `${NS}:lastUid:${VER}`;
const readUidFromCache = () => {
  if (typeof window === "undefined") return null;
  const uid = window.localStorage.getItem(LAST_UID_KEY);
  return uid || null;
};

const fmtDate = (val) => {
  if (!val) return "";
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
};

// Animation variants for the list container and items
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

// Skeleton Loader
const AchievementSkeleton = () => (
  <Stack spacing={2.5}>
    {[...Array(3)].map((_, index) => (
      <Card key={index} variant="outlined" sx={{ borderRadius: 4 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 }, display: 'flex', gap: 2, alignItems: 'center' }}>
          <Skeleton variant="circular" width={60} height={60} />
          <Stack sx={{ flexGrow: 1 }}>
            <Skeleton variant="text" width="60%" height={32} />
            <Skeleton variant="text" width="80%" height={20} />
            <Skeleton variant="text" width="40%" height={20} />
          </Stack>
          <Stack direction={{ xs: "row", sm: "column" }} spacing={1}>
            <Skeleton variant="rounded" width={80} height={30} />
            <Skeleton variant="rounded" width={110} height={30} />
          </Stack>
        </CardContent>
      </Card>
    ))}
  </Stack>
);

export default function StudentAchievements() {
  const theme = useTheme();
  const [student, setStudent] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "info" });
  const [viewerUrl, setViewerUrl] = useState("");
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfUrlToView, setPdfUrlToView] = useState("");

  const fetchAchievements = useCallback(async () => {
    setLoading(true);

    // Prefer cache uid
    const cachedUid = readUidFromCache();
    const authUid = auth.currentUser?.uid || null;
    const uid = cachedUid || authUid;

    if (!uid) {
      setSnackbar({ open: true, message: "Please log in to view achievements.", severity: "warning" });
      setLoading(false);
      return;
    }
    setStudent({ uid });

    try {
      const qRef = query(collection(db, "Achievements"), where("studentFirebaseId", "==", uid));
      const snap = await getDocs(qRef);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setAchievements(rows);
    } catch (e) {
      console.error("Failed to fetch achievements:", e);
      setSnackbar({ open: true, message: "Could not load achievements. Please try again.", severity: "error" });
      setAchievements([]);
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  }, []);

  useEffect(() => {
    fetchAchievements();
  }, [fetchAchievements]);

  const openPdf = (url) => {
    if (!url) return;
    setPdfUrlToView(url);
    setPdfDialogOpen(true);
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, Width: "100vw", height: "100vh", mx: "auto" }}>
      <SecondaryHeader
                title="My Achievements"
                titleSx={{ color: theme.palette.primary.main }}
                leftArea={
                  <HeaderBackButton />
                }
                rightArea={
                   <Tooltip title="Refresh">
                  <IconButton onClick={fetchAchievements} color="primary" sx={{ bgcolor: "white", boxShadow: 1 }}>
                    <RefreshIcon />
                  </IconButton>
                </Tooltip>
                }
              />
      {loading ? (
        <AchievementSkeleton />
      ) : achievements.length === 0 ? (
        <Box textAlign="center" sx={{ mt: 8, p: 3 }}>
          <TrophyIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">No Achievements Yet</Typography>
          <Typography variant="body1" color="text.secondary">Your achievements will appear here once they are added by the college.</Typography>
        </Box>
      ) : (
        <motion.div variants={containerVariants} initial="hidden" animate="visible">
          <Stack spacing={2.5}>
            {achievements.map((a) => {
              const isFirstPlace = a.position === '1st';
              const cardStyles = {
                borderRadius: 4,
                transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: theme.shadows[8],
                },
                ...(isFirstPlace && {
                  border: '2px solid transparent',
                  backgroundImage: `linear-gradient(white, white), linear-gradient(45deg, ${theme.palette.warning.light}, ${theme.palette.warning.dark})`,
                  backgroundOrigin: 'border-box',
                  backgroundClip: 'content-box, border-box',
                  boxShadow: `0 0 20px -5px ${theme.palette.warning.main}`,
                }),
              };

              return (
                <motion.div key={a.id} variants={cardVariants}>
                  <Card variant="outlined" sx={cardStyles}>
                    <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                      <Grid container spacing={2} alignItems="center">
                        <Grid item xs="auto">
                          <Avatar sx={{ width: 60, height: 60, bgcolor: isFirstPlace ? 'warning.main' : 'primary.main', color: 'white', boxShadow: theme.shadows[3] }}>
                            {isFirstPlace ? <PremiumIcon sx={{ fontSize: 32 }} /> : <TrophyIcon sx={{ fontSize: 32 }} />}
                          </Avatar>
                        </Grid>
                        <Grid item xs={12} sm>
                          <Typography variant="h6" fontWeight={700} color= "blue" component="div">{a.eventName || "Achievement"}</Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Organized by: <strong>{a.organizer || "-"}</strong></Typography>
                          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                              {a.position && <Chip label={a.position} color={isFirstPlace ? "warning" : "primary"} size="small" variant="filled" icon={<PremiumIcon />} />}
                              {a.level && <Chip label={a.level} color="secondary" size="small" />}
                              {a.category && <Chip label={a.category} size="small" />}
                          </Stack>
                        </Grid>
                        <Grid item xs={12} sm="auto" sx={{ marginLeft: 'auto' }}>
                          <Stack spacing={1}
                                direction={{ xs: 'row', sm: 'column' }}
                                alignItems="flex-end"
                                flexWrap="wrap">
                            <Button size="small" variant="contained" startIcon={<PreviewIcon />} disabled={!a?.storage?.url} onClick={() => setViewerUrl(a.storage.url)}>View</Button>
                            <Button size="small" variant="outlined" startIcon={<DownloadIcon />} disabled={!a?.storage?.url} component="a" href={a?.storage?.url} download={a?.storage?.fileName || "certificate"} target="_blank" rel="noopener noreferrer">Download</Button>
                            {a?.storage?.url?.toLowerCase?.().includes(".pdf") && (<Button size="small" onClick={() => openPdf(a.storage.url)} startIcon={<PdfIcon/>}>Open PDF</Button>)}
                          </Stack>
                        </Grid>
                      </Grid>
                      {a.description && (<Box mt={2} p={2} bgcolor={theme.palette.grey[50]} borderRadius={2} border={`1px solid ${theme.palette.divider}`}><Typography variant="body2" color="text.secondary">{a.description}</Typography></Box>)}
                      <Box mt={2} display="flex" justifyContent="flex-end">
                          <Typography variant="caption" color="text.secondary">Issued on: {fmtDate(a.eventDate)}{a.certificateNo && ` • Cert. #${a.certificateNo}`}</Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </Stack>
        </motion.div>
      )}

      {/* Dialogs and Snackbar */}
      <Dialog open={!!viewerUrl} onClose={() => setViewerUrl("")} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent:"space-between" }}>
          <Typography variant="h6">Certificate Preview</Typography>
          <IconButton onClick={() => setViewerUrl("")}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, height: "80vh", display: 'flex' }}>
          {viewerUrl && (viewerUrl.toLowerCase().includes(".pdf") || viewerUrl.toLowerCase().includes("application/pdf")) ? (
            <iframe src={viewerUrl} title="Certificate" width="100%" height="100%" style={{ border: "none" }} />
          ) : (
            <Box sx={{ p: 1, display: "flex", alignItems: "center", justifyContent: "center", height: "100%", width: '100%', bgcolor: "rgba(0,0,0,0.8)" }}>
              <img src={viewerUrl} alt="Certificate" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={pdfDialogOpen} onClose={() => setPdfDialogOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent:"space-between" }}>
          <Typography variant="h6">Certificate</Typography>
          <IconButton onClick={() => setPdfDialogOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, height: "85vh", bgcolor: 'grey.200' }}>
            {pdfUrlToView ? <PdfViewer fileUrl={pdfUrlToView} /> : <Alert severity="warning">No PDF URL found.</Alert>}
        </DialogContent>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert elevation={6} variant="filled" onClose={() => setSnackbar((s) => ({ ...s, open: false }))} severity={snackbar.severity || "info"}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
