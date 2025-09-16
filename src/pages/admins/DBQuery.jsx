/* eslint-disable no-empty */
/* eslint-disable react/prop-types */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Grid, Stack, Divider, Button, TextField, Select, MenuItem,
  InputLabel, FormControl, IconButton, Tooltip, Snackbar, Alert, Chip, CircularProgress,
  Menu, ListItemIcon, ListItemText
} from '@mui/material';
import {
  PlayArrow as RunIcon,
  Delete as DeleteIcon,
  SaveAlt as DownloadIcon,
  Sync as SwapIcon,
  Merge as MergeIcon,
  ContentCopy as CopyIcon,
  RestartAlt as ResetIcon,
  DataArray as ArrayIcon,
} from '@mui/icons-material';

import { auth, db } from '../../firebase/Firebase';
import {
  collection, query as fsQuery, where as fsWhere, limit as fsLimit, getDocs,
  doc, getDoc, writeBatch
} from 'firebase/firestore';

import SecondaryHeader from '../../components/secondaryHeader';
import { HeaderBackButton } from '../../components/header';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// helpers
const ALL_FORMATS = ['json', 'csv', 'xlsx', 'txt', 'ndjson'];

const toArray = (v) => Array.isArray(v) ? v : (v == null ? [] : [v]);
const safeParse = (txt, fallback = {}) => { try { return txt ? JSON.parse(txt) : fallback; } catch { return fallback; } };
const guessArray = (data) => {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 1 && Array.isArray(data[keys])) return data[keys];
  }
  return toArray(data);
};
const toCSV = (rows) => {
  if (!rows?.length) return '';
  const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r || {}))));
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const body = rows.map(r => headers.map(h => esc(r[h])).join(','));
  return [headers.join(','), ...body].join('\n');
};
const toNDJSON = (rows) => (rows || []).map(r => JSON.stringify(r)).join('\n');

const downloadBlob = (content, filename, mime) => {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const exportData = async (rows, base = 'export', format = 'json') => {
  const arr = guessArray(rows);
  if (format === 'json') { downloadBlob(JSON.stringify(arr, null, 2), `${base}.json`, 'application/json'); return; }
  if (format === 'csv') { downloadBlob(toCSV(arr), `${base}.csv`, 'text/csv'); return; }
  if (format === 'txt') { downloadBlob(JSON.stringify(arr, null, 2), `${base}.txt`, 'text/plain'); return; }
  if (format === 'ndjson') { downloadBlob(toNDJSON(arr), `${base}.ndjson`, 'application/x-ndjson'); return; }
  if (format === 'xlsx') {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(arr);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${base}.xlsx`);
    return;
  }
};

const joinByKey = (left, right, keyLeft, keyRight, type = 'inner') => {
  const L = guessArray(left), R = guessArray(right);
  const index = new Map();
  R.forEach(r => {
    const k = String(r?.[keyRight] ?? '');
    if (!index.has(k)) index.set(k, []);
    index.get(k).push(r);
  });
  const out = [];
  L.forEach(l => {
    const k = String(l?.[keyLeft] ?? '');
    const matches = index.get(k) || [];
    if (matches.length) { matches.forEach(r => out.push({ ...l, ...r })); }
    else if (type === 'left') { out.push({ ...l }); }
  });
  if (type === 'right') {
    const lKeys = new Set(L.map(l => String(l?.[keyLeft] ?? '')));
    R.forEach(r => { const k = String(r?.[keyRight] ?? ''); if (!lKeys.has(k)) out.push({ ...r }); });
  }
  return out;
};

// firebase ops
const fbFind = async ({ colPath, whereField, whereOp, whereValue, lim }) => {
  if (!colPath) throw new Error('Collection path required');
  const col = collection(db, colPath);
  const clauses = [];
  if (whereField && whereOp && (whereValue !== undefined && whereValue !== '')) {
    let val = whereValue;
    if (/^-?\d+(\.\d+)?$/.test(whereValue)) val = Number(whereValue);
    if (whereValue === 'true') val = true;
    if (whereValue === 'false') val = false;
    clauses.push(fsWhere(whereField, whereOp, val));
  }
  if (lim && Number(lim) > 0) clauses.push(fsLimit(Number(lim)));
  const q = clauses.length ? fsQuery(col, ...clauses) : fsQuery(col);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

const fbBatchUpdateByIds = async ({ colPath, idsText, patchJson }) => {
  if (!colPath) throw new Error('Collection path required');
  const ids = idsText.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  if (!ids.length) throw new Error('Provide at least one doc ID');
  const patch = safeParse(patchJson, null);
  if (!patch || typeof patch !== 'object') throw new Error('Invalid update JSON');
  const batch = writeBatch(db);
  ids.forEach(id => batch.update(doc(db, colPath, id), patch));
  await batch.commit();
  return { updated: ids.length, ids };
};

const fbBatchDeleteByIds = async ({ colPath, idsText }) => {
  if (!colPath) throw new Error('Collection path required');
  const ids = idsText.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  if (!ids.length) throw new Error('Provide at least one doc ID');
  const batch = writeBatch(db);
  ids.forEach(id => batch.delete(doc(db, colPath, id)));
  await batch.commit();
  return { deleted: ids.length, ids };
};

// mongo
const callMongo = async ({ method, endpoint, queryParams, bodyJson }) => {
  if (!endpoint) throw new Error('Endpoint required');
  const qsObj = safeParse(queryParams, {});
  const qs = Object.entries(qsObj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}${qs ? `?${qs}` : ''}`;
  const init = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) init.body = JSON.stringify(safeParse(bodyJson, {}));
  const resp = await fetch(url, init);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json().catch(() => ({}));
  return data;
};

// defaults
const FB_DEFAULTS = { colPath: '', whereField: '', whereOp: '==', whereValue: '', lim: 50, idsText: '', patchJson: '{\n  \n}' };
const MG_DEFAULTS = { method: 'GET', endpoint: '/api/admin/query', queryParams: '{ }', bodyJson: '{\n  \n}' };

// split button
const ExportSplitButton = ({ disabled, base, getRows }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const onOpen = useCallback((e) => setAnchorEl(e.currentTarget), []);
  const onClose = useCallback(() => setAnchorEl(null), []);
  const onExport = useCallback(async (fmt) => {
    await exportData(getRows(), base, fmt);
    onClose();
  }, [base, getRows, onClose]);
  return (
    <>
      <Button variant="outlined" color="success" startIcon={<DownloadIcon />} disabled={disabled} onClick={onOpen}>
        Export
      </Button>
      <Menu anchorEl={anchorEl} open={open} onClose={onClose}>
        {ALL_FORMATS.map(f => (
          <MenuItem key={f} onClick={() => onExport(f)}>
            <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{f.toUpperCase()}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

const Panel = React.memo(function Panel({
  side,
  dbSel, setDbSel,
  opSel, setOpSel,
  fb, setFb,
  mg, setMg,
  busy,
  result,
  onExecute,
  onExportJSON
}) {
  const resultRows = guessArray(result);

  return (
    <Paper elevation={2} sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper', maxWidth:{xs:'100%', md:'50vw'} }}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Database</InputLabel>
            <Select value={dbSel} label="Database" onChange={(e) => setDbSel(e.target.value)}>
              <MenuItem value="firebase">Firebase</MenuItem>
              <MenuItem value="mongo">MongoDB</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Operation</InputLabel>
            <Select value={opSel} label="Operation" onChange={(e) => setOpSel(e.target.value)}>
              <MenuItem value="find">Find</MenuItem>
              <MenuItem value="update" disabled={dbSel !== 'firebase'}>Update</MenuItem>
              <MenuItem value="delete" disabled={dbSel !== 'firebase'}>Delete</MenuItem>
            </Select>
          </FormControl>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Run">
            <span>
              <Button variant="contained" startIcon={busy ? <CircularProgress size={16} /> : <RunIcon />} disabled={busy} onClick={onExecute}>
                Execute
              </Button>
            </span>
          </Tooltip>
          <ExportSplitButton disabled={!resultRows.length} base={`${side}_${dbSel}_${opSel}`} getRows={() => resultRows} />
        </Stack>
      </Stack>

      {/* Inputs */}
      {dbSel === 'firebase' ? (
        <Stack spacing={1.25} sx={{ mt: 1 }}>
          {opSel === 'find' && (
            <>
              <TextField size="small" label="Collection Path (e.g., Students)" value={fb.colPath}
                onChange={(e) => setFb(v => ({ ...v, colPath: e.target.value }))} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField size="small" label="Where Field" value={fb.whereField}
                  onChange={(e) => setFb(v => ({ ...v, whereField: e.target.value }))} sx={{ flex: 1 }} />
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Op</InputLabel>
                  <Select label="Op" value={fb.whereOp} onChange={(e) => setFb(v => ({ ...v, whereOp: e.target.value }))}>
                    <MenuItem value="==">==</MenuItem>
                    <MenuItem value=">=">{'>='}</MenuItem>
                    <MenuItem value="<=">{'<='}</MenuItem>
                    <MenuItem value=">">{'>'}</MenuItem>
                    <MenuItem value="<">{'<'}</MenuItem>
                    <MenuItem value="in">in</MenuItem>
                    <MenuItem value="array-contains">array-contains</MenuItem>
                  </Select>
                </FormControl>
                <TextField size="small" label="Where Value" value={fb.whereValue}
                  onChange={(e) => setFb(v => ({ ...v, whereValue: e.target.value }))} sx={{ flex: 1 }} />
                <TextField size="small" type="number" label="Limit" value={fb.lim}
                  onChange={(e) => setFb(v => ({ ...v, lim: Number(e.target.value) }))} sx={{ width: 120 }} />
              </Stack>
            </>
          )}
          {opSel === 'update' && (
            <>
              <TextField size="small" label="Collection Path" value={fb.colPath}
                onChange={(e) => setFb(v => ({ ...v, colPath: e.target.value }))} />
              <TextField size="small" label="Doc IDs (comma/newline)" value={fb.idsText} multiline minRows={2}
                onChange={(e) => setFb(v => ({ ...v, idsText: e.target.value }))} />
              <TextField size="small" label="Update JSON" value={fb.patchJson} multiline minRows={6}
                onChange={(e) => setFb(v => ({ ...v, patchJson: e.target.value }))} />
            </>
          )}
          {opSel === 'delete' && (
            <>
              <TextField size="small" label="Collection Path" value={fb.colPath}
                onChange={(e) => setFb(v => ({ ...v, colPath: e.target.value }))} />
              <TextField size="small" label="Doc IDs (comma/newline)" value={fb.idsText} multiline minRows={2}
                onChange={(e) => setFb(v => ({ ...v, idsText: e.target.value }))} />
            </>
          )}
        </Stack>
      ) : (
        <Stack spacing={1.25} sx={{ mt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Method</InputLabel>
              <Select label="Method" value={mg.method} onChange={(e) => setMg(v => ({ ...v, method: e.target.value }))}>
                <MenuItem value="GET">GET</MenuItem>
                <MenuItem value="POST">POST</MenuItem>
                <MenuItem value="PUT">PUT</MenuItem>
                <MenuItem value="PATCH">PATCH</MenuItem>
                <MenuItem value="DELETE">DELETE</MenuItem>
              </Select>
            </FormControl>
            <TextField size="small" label="Endpoint (/api/...)" value={mg.endpoint}
              onChange={(e) => setMg(v => ({ ...v, endpoint: e.target.value }))} sx={{ flex: 1 }} />
          </Stack>
          <TextField size="small" label="Query Params (JSON)" value={mg.queryParams} multiline minRows={3}
            onChange={(e) => setMg(v => ({ ...v, queryParams: e.target.value }))} />
          {['POST', 'PUT', 'PATCH', 'DELETE'].includes(mg.method) && (
            <TextField size="small" label="Body (JSON)" value={mg.bodyJson} multiline minRows={6}
              onChange={(e) => setMg(v => ({ ...v, bodyJson: e.target.value }))} />
          )}
        </Stack>
      )}

      <Divider sx={{ my: 2 }} />

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Chip icon={<ArrayIcon />} label={`Rows: ${resultRows.length}`} />
        <Tooltip title="Copy JSON">
          <IconButton size="small" onClick={() => navigator.clipboard.writeText(JSON.stringify(resultRows, null, 2))}><CopyIcon /></IconButton>
        </Tooltip>
        <Tooltip title="Export JSON">
          <IconButton size="small" onClick={onExportJSON}><DownloadIcon /></IconButton>
        </Tooltip>
      </Stack>

      <Box sx={{
        p: 1.5, bgcolor: 'grey.50', borderRadius: 1.5, maxHeight: 300, overflow: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 12,
        border: '1px solid', borderColor: 'divider'
      }}>
        <pre style={{ margin: 0 , whiteSpace: 'pre-wrap',
           wordWrap: 'break-word'}}>{JSON.stringify(resultRows, null, 2)}</pre>
      </Box>
    </Paper>
  );
});

// Main Workbench 
  const DBWorkbench = () => {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const [mode, setMode] = useState('dual'); // single | dual

  // left/right states
  const [leftDb, setLeftDb] = useState('firebase');
  const [leftOp, setLeftOp] = useState('find');
  const [leftResult, setLeftResult] = useState([]);
  const [leftBusy, setLeftBusy] = useState(false);
  const [fbLeft, setFbLeft] = useState({ ...FB_DEFAULTS });
  const [mgLeft, setMgLeft] = useState({ ...MG_DEFAULTS });

  const [rightDb, setRightDb] = useState('mongo');
  const [rightOp, setRightOp] = useState('find');
  const [rightResult, setRightResult] = useState([]);
  const [rightBusy, setRightBusy] = useState(false);
  const [fbRight, setFbRight] = useState({ ...FB_DEFAULTS });
  const [mgRight, setMgRight] = useState({ ...MG_DEFAULTS });

  // merge
  const [mergeLeftKey, setMergeLeftKey] = useState('firebaseId');
  const [mergeRightKey, setMergeRightKey] = useState('firebaseId');
  const [mergeType, setMergeType] = useState('inner');
  const [merged, setMerged] = useState([]);

  const [history, setHistory] = useState([]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        setSnackbar({ open: true, message: 'Please log in', severity: 'error' });
        return;
      }
      const aDoc = await getDoc(doc(db, 'Admins', user.uid));
      const ok = aDoc.exists() && String(aDoc.data()?.role || '').toLowerCase() === 'admin';
      setIsAdmin(ok);
      if (!ok) setSnackbar({ open: true, message: 'Unauthorized. Admin role required.', severity: 'error' });
      setLoading(false);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('workbenchHistory') || '[]');
      if (Array.isArray(saved)) setHistory(saved);
    } catch {}
  }, []);

  const pushHistory = useCallback((entry) => {
    const next = [...history, { ...entry, at: new Date().toISOString() }].slice(-12);
    setHistory(next);
    try { localStorage.setItem('workbenchHistory', JSON.stringify(next)); } catch {}
  }, [history]);

  const runPanel = useCallback(async (side) => {
    const isLeft = side === 'left';
    const dbSel = isLeft ? leftDb : rightDb;
    const opSel = isLeft ? leftOp : rightOp;
    const setBusy = isLeft ? setLeftBusy : setRightBusy;
    const setRes = isLeft ? setLeftResult : setRightResult;
    const fb = isLeft ? fbLeft : fbRight;
    const mg = isLeft ? mgLeft : mgRight;

    try {
      setBusy(true);
      let data = null;

      if (dbSel === 'firebase') {
        if (opSel === 'find') data = await fbFind(fb);
        else if (opSel === 'update') data = await fbBatchUpdateByIds(fb);
        else if (opSel === 'delete') data = await fbBatchDeleteByIds(fb);
      } else if (dbSel === 'mongo') {
        data = await callMongo(mg);
      }

      setRes(data);
      pushHistory({ side, db: dbSel, op: opSel, fb, mg, resultSize: guessArray(data).length || 0 });
      setSnackbar({ open: true, message: `Executed ${dbSel.toUpperCase()} ${opSel}`, severity: 'success' });
    } catch (e) {
      setSnackbar({ open: true, message: e?.message || 'Execution failed', severity: 'error' });
    } finally {
      setBusy(false);
    }
  }, [leftDb, rightDb, leftOp, rightOp, fbLeft, fbRight, mgLeft, mgRight, pushHistory]);

  const mergedRows = useMemo(() => guessArray(merged), [merged]);
  const doMerge = useCallback(() => {
    const out = joinByKey(leftResult, rightResult, mergeLeftKey, mergeRightKey, mergeType);
    setMerged(out);
    setSnackbar({ open: true, message: `Merged ${out.length} rows`, severity: 'success' });
  }, [leftResult, rightResult, mergeLeftKey, mergeRightKey, mergeType]);

  const resetAll = useCallback(() => {
    setLeftResult([]); setRightResult([]); setMerged([]);
    setFbLeft({ ...FB_DEFAULTS }); setFbRight({ ...FB_DEFAULTS });
    setMgLeft({ ...MG_DEFAULTS }); setMgRight({ ...MG_DEFAULTS });
    setMergeLeftKey('firebaseId'); setMergeRightKey('firebaseId'); setMergeType('inner');
    setSnackbar({ open: true, message: 'Reset complete', severity: 'info' });
  }, []);

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!isAdmin) return null;

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 }, maxWidth: 1600, mx: 'auto' }}>
      {/* Header */}
      <SecondaryHeader
          title="Database Workbench"
          leftArea={<HeaderBackButton />}
           rightArea={
          <Stack direction="row" spacing={1}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Layout</InputLabel>
          <Select value={mode} label="Layout" onChange={(e) => setMode(e.target.value)}>
          <MenuItem value="single">Single Panel</MenuItem>
          <MenuItem value="dual">Dual Panel</MenuItem>
          </Select>
          </FormControl>
            <Tooltip title="Swap Panels">
              <span>
                <IconButton
                  onClick={() => {
                    const lDb = leftDb, rDb = rightDb, lOp = leftOp, rOp = rightOp, lFb = fbLeft, rFb = fbRight, lMg = mgLeft, rMg = mgRight, lRes = leftResult, rRes = rightResult;
                    setLeftDb(rDb); setRightDb(lDb);
                    setLeftOp(rOp); setRightOp(lOp);
                    setFbLeft(rFb); setFbRight(lFb);
                    setMgLeft(rMg); setMgRight(lMg);
                    setLeftResult(rRes); setRightResult(lRes);
                  }}
                >
                  <SwapIcon />
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title="Reset All">
              <IconButton color="warning" onClick={resetAll}>
                <ResetIcon />
              </IconButton>
            </Tooltip>
          </Stack>
          }
            elevation={0}
            border
            paperSx={{
            p: { xs: 1.5, md: 2 },
            borderRadius: 2,
            mb: 2,
            border: '1px solid',
            borderColor: 'divider',
            }}
            />

      {/* Panels */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={mode === 'dual' ? 6 : 12}>
          <Panel
            side="left"
            dbSel={leftDb} setDbSel={setLeftDb}
            opSel={leftOp} setOpSel={setLeftOp}
            fb={fbLeft} setFb={setFbLeft}
            mg={mgLeft} setMg={setMgLeft}
            busy={leftBusy}
            result={leftResult}
            onExecute={() => runPanel('left')}
            onExportJSON={() => exportData(leftResult, `left_${leftDb}_${leftOp}`, 'json')}
          />
        </Grid>
        {mode === 'dual' && (
          <Grid item xs={12} md={6}>
            <Panel
              side="right"
              dbSel={rightDb} setDbSel={setRightDb}
              opSel={rightOp} setOpSel={setRightOp}
              fb={fbRight} setFb={setFbRight}
              mg={mgRight} setMg={setMgRight}
              busy={rightBusy}
              result={rightResult}
              onExecute={() => runPanel('right')}
              onExportJSON={() => exportData(rightResult, `right_${rightDb}_${rightOp}`, 'json')}
            />
          </Grid>
        )}
      </Grid>

      {/* Merge */}
      <Paper elevation={1} sx={{ p: 2, mt: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ md: 'center' }} justifyContent="space-between">
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Merge / Join Results</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField size="small" label="Left Key" value={mergeLeftKey} onChange={(e) => setMergeLeftKey(e.target.value)} />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Join</InputLabel>
              <Select value={mergeType} label="Join" onChange={(e) => setMergeType(e.target.value)}>
                <MenuItem value="inner">Inner</MenuItem>
                <MenuItem value="left">Left</MenuItem>
                <MenuItem value="right">Right</MenuItem>
              </Select>
            </FormControl>
            <TextField size="small" label="Right Key" value={mergeRightKey} onChange={(e) => setMergeRightKey(e.target.value)} />
            <Tooltip title="Merge">
              <Button variant="contained" startIcon={<MergeIcon />} onClick={doMerge}>Merge</Button>
            </Tooltip>
            <ExportSplitButton disabled={!mergedRows.length} base={`merged_${mergeType}_${mergeLeftKey}_${mergeRightKey}`} getRows={() => mergedRows} />
          </Stack>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
          <Chip icon={<ArrayIcon />} label={`Merged Rows: ${mergedRows.length}`} />
        </Stack>
        <Box sx={{
          p: 1.5, mt: 1.5, bgcolor: 'grey.50', borderRadius: 1.5, maxHeight: 350, overflow: 'auto',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 12,
          border: '1px solid', borderColor: 'divider'
        }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap',
           wordWrap: 'break-word' }}>{JSON.stringify(mergedRows, null, 2)}</pre>
        </Box>
      </Paper>

      {/* History */}
      <Paper elevation={0} sx={{ p: 2, mt: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>History</Typography>
          <Tooltip title="Clear History">
            <IconButton onClick={() => { setHistory([]); localStorage.removeItem('workbenchHistory'); }}><DeleteIcon /></IconButton>
          </Tooltip>
        </Stack>
        <Box sx={{
          p: 1.5, mt: 1, bgcolor: 'grey.50', borderRadius: 1.5, maxHeight: 400, overflow: 'auto',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 12,
          border: '1px solid', borderColor: 'divider'
        }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap',
           wordWrap: 'break-word' }}>{JSON.stringify(history, null, 2)}</pre>
        </Box>
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3800}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert elevation={6} variant="filled" onClose={() => setSnackbar(s => ({ ...s, open: false }))} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DBWorkbench;