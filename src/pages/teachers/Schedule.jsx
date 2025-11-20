import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Card, CardContent, Typography, Stack, Chip, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Button, Alert, useTheme, alpha
} from "@mui/material";
import { Download as DownloadIcon } from "@mui/icons-material";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/Firebase";
import { HeaderBackButton } from "../../components/header";
import SecondaryHeader from "../../components/secondaryHeader";
import TeacherHeader from "../../components/TeacherHeader";
import { useAuth } from "../../context/AuthContext"; 

const DAY_ORDER = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

const toMinutesLocal = (t) => {
  const m = clean(t).match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return 0;
  let hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === "PM" && hh !== 12) hh += 12;
  if (ap === "AM" && hh === 12) hh = 0;
  return hh * 60 + mm;
};

const sharedPivot = (rows, gridDays) => {
  const dayList = (Array.isArray(gridDays) && gridDays.length > 0
    ? gridDays
    : Array.from(new Set(rows.map(r => r.day)))).filter(Boolean);
  const days = [...dayList].sort((a, b) =>
    (DAY_ORDER[a?.toLowerCase()] || 999) - (DAY_ORDER[b?.toLowerCase()] || 999)
  );
  const slotSet = new Set();
  rows.forEach(r => { if (r.start && r.end) slotSet.add(`${r.start} - ${r.end}`); });
  const slots = Array.from(slotSet).sort((a, b) => toMinutesLocal(a.split(" - ")[0]) - toMinutesLocal(b.split(" - ")[0]));
  const map = {};
  slots.forEach(s => { map[s] = {}; days.forEach(d => { map[s][d] = null; }); });
  rows.forEach(r => {
    const slot = `${r.start} - ${r.end}`;
    if (!map[slot]) map[slot] = {};
    map[slot][r.day] = r;
  });
  return { days, slots, map };
};

const renderCellText = (r) => {
  if (!r) return "";
  const subj = String(r.subject || "").trim();
  if (subj.toLowerCase() === "lunch break") return "LUNCH BREAK";
  const m1 = subj.match(/^([A-Z]{2,}-?\d{2,3}[A-Z0-9-]*)\s*\((.+)\)$/i);
  const m2 = subj.match(/^([A-Z]{2,}-?\d{2,3}[A-Z0-9-]*)\s*:\s*(.+)$/i);
  const base = m1 ? `${m1[1].toUpperCase()}: ${m1[2]}` : (m2 ? `${m2[1].toUpperCase()}: ${m2[2]}` : subj);
  const lines = [base];
  if (r.room) lines.push(`(${String(r.room).trim()})`);
  return lines.join("\n");
};

const Schedule = () => {
  const theme = useTheme();
  const { currentUser, role, userDetails, loading: authLoading } = useAuth();

  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError("");

        if (authLoading) return;
        if (!currentUser || role !== "Teacher") {
          setError("Not authenticated or not a teacher.");
          setLoading(false);
          return;
        }

        const collegeId = userDetails?.college;
        if (!collegeId) {
          setError("College not set in profile.");
          setLoading(false);
          return;
        }

        const schedSnap = await getDoc(
          doc(db, "Schedules", String(collegeId), "Teachers", String(currentUser.uid))
        );
        setSchedule(schedSnap.exists() ? { id: schedSnap.id, ...schedSnap.data() } : null);
      } catch (err) {
        console.error("Schedule fetch failed", err);
        setError("Failed to load schedule.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [currentUser, role, userDetails, authLoading]);

  const rows = useMemo(() => {
    if (!schedule) return [];
    const enabled = !!schedule?.normalized?.enabled;
    const arr = Array.isArray(schedule?.normalized?.rows) ? schedule.normalized.rows : [];
    return enabled ? arr : [];
  }, [schedule]);

  const pivot = useMemo(() => sharedPivot(rows, []), [rows]);

  //status and file name as chip-like labels in tabs
  const headerTabs = [
    schedule?.status
      ? { value: "status", label: <Chip color="success" variant="outlined" label={`Status: ${schedule.status}`} /> }
      : null,
    schedule?.storage?.fileName
      ? { value: "file", label: <Chip label={schedule.storage.fileName} /> }
      : null,
  ].filter(Boolean);

  const handleTabChange = (_e, v) => setTabValue(v);

  // Second-row right area (Download button)
  const belowRightArea = schedule?.storage?.url ? (
    <Button
      size="small"
      variant="outlined"
      startIcon={<DownloadIcon />}
      component="a"
      href={schedule.storage.url}
      download={schedule.storage.fileName || "schedule"}
    >
      Download
    </Button>
  ) : null;

  return (
    <Box
      sx={{
        p: 3,
        minWidth: "95vw",
        minHeight: "100vh",
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)}, ${alpha(theme.palette.secondary.main, 0.1)})`
      }}
    >
      <SecondaryHeader
        title="My Schedule"
        titleSx={{ color: theme.palette.primary.main }}
        leftArea={<HeaderBackButton />}
        tabs={headerTabs}
        tabValue={tabValue}
        onTabChange={handleTabChange}
        renderBelow
        rightOn="bottom"
        rightArea={belowRightArea}
        tabsProps={{
          TabIndicatorProps: { style: { display: "none" } },
          sx: {
            minHeight: 40,
            "& .MuiTabs-flexContainer": { gap: 2 },
            borderBottom: "none",
          },
        }}
        tabProps={{
          disableRipple: true,
          disableFocusRipple: true,
          sx: {
            minHeight: 36,
            maxWidth: "99%",
            textTransform: "none",
            padding: 0,
            cursor: "default",
            "&:hover": {
              backgroundColor: "transparent",
            },
            "& .MuiTouchRipple-root": { display: "none" },
          },
        }}
      />

      {loading ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={20} />
          <Typography variant="body2">Loading…</Typography>
        </Stack>
      ) : error ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      ) : (
        <>
          <TeacherHeader
            sx={{ background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 1)}, ${alpha(theme.palette.secondary.main, 0.4)})` }}
            extraTexts={[
              { text: `Teacher ID: ${userDetails?.teacherId || "—"}` },
              { text: `College: ${userDetails?.college || "—"}` },
            ]}
            rightExtras={
              schedule?.academicRange
                ? [
                    <Chip
                      key="academic-chip"
                      variant="outlined"
                      label={`Academic: ${schedule.academicRange}`}
                    />,
                  ]
                : []
            }
          />

          {!schedule ? (
            <Alert severity="info">No schedule is available yet.</Alert>
          ) : schedule.type === "excel" && rows.length > 0 ? (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Weekly Timetable
                </Typography>
                <TableContainer component={Paper} sx={{ maxHeight: 560, borderRadius: 1 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: 160, fontWeight: 700 }}>Time Slot</TableCell>
                        {pivot.days.map((d) => (
                          <TableCell key={d} sx={{ fontWeight: 700 }}>
                            {d}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pivot.slots.map((slot) => (
                        <TableRow key={slot} hover>
                          <TableCell sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                            {slot}
                          </TableCell>
                          {pivot.days.map((d) => (
                            <TableCell key={`${slot}-${d}`} sx={{ whiteSpace: "pre-line", lineHeight: 1.35 }}>
                              {renderCellText(pivot.map[slot]?.[d]) || "—"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      {pivot.slots.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={1 + pivot.days.length} align="center">
                            No rows to display.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          ) : schedule.type === "pdf" ? (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Current Schedule (PDF)
                </Typography>
                <Box sx={{ height: 700 }}>
                  <object data={schedule.storage?.url || ""} type="application/pdf" width="100%" height="100%">
                    <p>PDF preview is not supported in this browser.</p>
                  </object>
                </Box>
              </CardContent>
            </Card>
          ) : schedule.type === "image" ? (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Current Schedule (Image)
                </Typography>
                <Box sx={{ textAlign: "center" }}>
                  <img
                    src={schedule.storage?.url || ""}
                    alt="Schedule"
                    style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #eee" }}
                  />
                </Box>
              </CardContent>
            </Card>
          ) : (
            <Alert severity="info">A schedule exists but cannot be rendered.</Alert>
          )}
        </>
      )}
    </Box>
  );
};

export default Schedule;