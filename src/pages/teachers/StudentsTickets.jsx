import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Container, Typography, Box, Button, List, ListItemButton,
  ListItemText, Paper, IconButton, Chip, Grid, CircularProgress,
  ToggleButtonGroup, ToggleButton, LinearProgress
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  WorkOutline as ProgramIcon,
  ConfirmationNumberOutlined as TicketIcon,
  ChatBubbleOutline,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  Workspaces,
  InsertDriveFile as FileIcon,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  collection, query, orderBy, onSnapshot, serverTimestamp,
  doc, writeBatch
} from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db } from '../../firebase/Firebase';
import { useTheme } from '@mui/material/styles';
import MessageBox from '../../components/messageBox';
import { HeaderBackButton } from '../../components/header';

const formatDate = (timestamp) => {
  if (!timestamp?.toDate) return 'Just now';
  const date = timestamp.toDate();
  const now = new Date();
  const diffInSeconds = (now.getTime() - date.getTime()) / 1000;
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const ticketsCollectionRef = collection(db, 'tickets', 'student_tickets', 'conversations');
const storage = getStorage();

export default function StudentsTickets() {
  const theme = useTheme();
  const messagesEndRef = useRef(null);

  const [ticketsByProgram, setTicketsByProgram] = useState({});
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [filterStatus, setFilterStatus] = useState('open'); // 'open' | 'closed'
  const [fileToUpload, setFileToUpload] = useState(null);
  const [componentLoading, setComponentLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setComponentLoading(true);
    const ticketsQuery = query(ticketsCollectionRef, orderBy('lastUpdatedAt', 'desc'));

    const unsubscribe = onSnapshot(
      ticketsQuery,
      (snapshot) => {
        const grouped = snapshot.docs.reduce((acc, d) => {
          const t = { id: d.id, ...d.data() };
          const program = t.programId || 'Uncategorized';
          if (!acc[program]) acc[program] = [];
          acc[program].push(t);
          return acc;
        }, {});
        setTicketsByProgram(grouped);
        setComponentLoading(false);
      },
      () => {
        toast.error('Could not fetch tickets.');
        setComponentLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

 
  useEffect(() => {
    if (!selectedTicket) return;
    setChatLoading(true);
    const msgsQuery = query(
      collection(ticketsCollectionRef, selectedTicket.id, 'messages'),
      orderBy('timestamp', 'asc')
    );
    const unsub = onSnapshot(
      msgsQuery,
      (snap) => {
        const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMessages(msgs);
        setChatLoading(false);
      },
      () => {
        toast.error('Failed to load chat messages.');
        setChatLoading(false);
      }
    );
    return () => unsub();
  }, [selectedTicket]);

  // Filtered tickets list
  const filteredTickets = useMemo(() => {
    if (!selectedProgram || !ticketsByProgram[selectedProgram]) return [];
    return ticketsByProgram[selectedProgram].filter((t) => t.status === filterStatus);
  }, [selectedProgram, filterStatus, ticketsByProgram]);

  const handleSelectProgram = (programId) => {
    setSelectedProgram(programId);
    setSelectedTicket(null);
  };

  const handleUpdateTicketStatus = async (ticket, newStatus) => {
    const ticketRef = doc(ticketsCollectionRef, ticket.id);
    const statusMessage =
      newStatus === 'closed'
        ? 'This ticket was closed by a college associate.'
        : 'This ticket was re-opened by a college associate.';

    try {
      const batch = writeBatch(db);
      // Update ticket meta
      batch.update(ticketRef, {
        status: newStatus,
        lastMessage: statusMessage,
        lastSender: 'system',
        lastUpdatedAt: serverTimestamp(),
      });
      // Add a system message
      const newMessageRef = doc(collection(ticketRef, 'messages'));
      batch.set(newMessageRef, {
        sender: 'system',
        text: statusMessage,
        timestamp: serverTimestamp(),
      });
      await batch.commit();
      toast.success(newStatus === 'closed' ? 'Ticket closed.' : 'Ticket re-opened.');
      // optimistic UI
      setSelectedTicket((prev) => (prev ? { ...prev, status: newStatus } : prev));
    } catch {
      toast.error(newStatus === 'closed' ? 'Failed to close.' : 'Failed to re-open.');
    }
  };

  // Upload file to storage
  const uploadSelectedFile = async (ticketId) => {
    if (!fileToUpload) return null;
    const filePath = `associate_support/${ticketId}/${Date.now()}_${fileToUpload.name}`;
    const storageRef = ref(storage, filePath);
    const uploadTask = uploadBytesResumable(storageRef, fileToUpload);

    await new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snap) => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
        (err) => reject(err),
        () => resolve()
      );
    });

    const url = await getDownloadURL(uploadTask.snapshot.ref);
    return { fileUrl: url, fileName: fileToUpload.name, fileType: fileToUpload.type };
  };

  // Send message (supports file-only)
  const handleSendMessage = async (messageText) => {
    if (!selectedTicket) return;

    const text = (messageText ?? currentMessage).trim();
    if (!text && !fileToUpload) return;

    setSendingMessage(true);
    setCurrentMessage('');
    try {
      let filePayload = null;
      if (fileToUpload) {
        filePayload = await uploadSelectedFile(selectedTicket.id);
      }

      const batch = writeBatch(db);
      const ticketRef = doc(ticketsCollectionRef, selectedTicket.id);

      // add message
      const newMsgRef = doc(collection(ticketRef, 'messages'));
      const msg = {
        sender: 'associate',
        text: text || '',
        timestamp: serverTimestamp(),
      };
      if (filePayload) Object.assign(msg, filePayload);
      batch.set(newMsgRef, msg);

      // update parent meta
      batch.update(ticketRef, {
        lastMessage: text || (filePayload ? `File: ${filePayload.fileName}` : ''),
        lastSender: 'associate',
        lastUpdatedAt: serverTimestamp(),
        status: 'open',
      });

      await batch.commit();

      if (selectedTicket.status === 'closed') {
        setSelectedTicket((prev) => (prev ? { ...prev, status: 'open' } : prev));
      }
      setFileToUpload(null);
      setUploadProgress(0);
    } catch {
      toast.error('Failed to send message.');
      setCurrentMessage(text);
    } finally {
      setSendingMessage(false);
    }
  };

  if (componentLoading) {
    return (
      <Container maxWidth="xl" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container
      maxWidth={false}
      disableGutters
      sx={{
        height: '100vh',
        py: 2,
        px: 2,
        backgroundColor: theme.palette.mode === 'dark' ? theme.palette.background.default : '#f5f5f5',
      }}
    >
      <Grid container spacing={2} sx={{ height: '100%', flexWrap: 'nowrap' }}>
        {/* Program List */}
        <Grid
          item
          xs={12}
          md={3}
          sx={{ display: { xs: selectedProgram ? 'none' : 'flex', md: 'flex' }, flexDirection: 'column', height: '100%' }}
        >
          <Paper elevation={3} sx={{ p: 2, mb: 2, borderRadius: 2, flexShrink: 0, minWidth: { md: '15vw', xs: '95vw' } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <HeaderBackButton/>
              <Workspaces sx={{ color: 'text.secondary' }} />
              <Typography variant="h6" fontWeight={700}>
                Programs
              </Typography>
            </Box>
          </Paper>

          <Paper elevation={3} sx={{ flexGrow: 1, overflowY: 'auto', borderRadius: 2, minWidth: { md: '15vw', xs: '95vw' } }}>
            <List disablePadding>
              {Object.keys(ticketsByProgram)
                .sort()
                .map((programId) => (
                  <ListItemButton
                    key={programId}
                    selected={selectedProgram === programId}
                    onClick={() => handleSelectProgram(programId)}
                    sx={{
                      borderLeft: selectedProgram === programId ? `4px solid ${theme.palette.primary.main}` : 'none',
                      backgroundColor: selectedProgram === programId ? theme.palette.action.selected : 'inherit',
                      py: 1.5,
                    }}
                  >
                    <ListItemText primary={programId} primaryTypographyProps={{ fontWeight: 500 }} />
                  </ListItemButton>
                ))}
            </List>
          </Paper>
        </Grid>

        {/* Ticket List */}
        <Grid
          item
          xs={12}
          md={4}
          sx={{
            display: { xs: selectedProgram && !selectedTicket ? 'flex' : 'none', md: 'flex' },
            flexDirection: 'column',
            height: '100%',
            maxWidth: { md: '20vw', xs: '95vw' },
          }}
        >
          <Paper elevation={3} sx={{ p: 2, mb: 2, borderRadius: 2, flexShrink: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <IconButton onClick={() => setSelectedProgram(null)} sx={{ display: { md: 'none' }, mr: 1 }}>
                <ArrowBackIcon />
              </IconButton>
              <Typography variant="h6" fontWeight={700} noWrap sx={{ flexGrow: 1 }}>
                {selectedProgram || 'Select Program'}
              </Typography>
              <ToggleButtonGroup
                value={filterStatus}
                exclusive
                onChange={(e, val) => val && setFilterStatus(val)}
                size="small"
                color="primary"
              >
                <ToggleButton value="open">Open</ToggleButton>
                <ToggleButton value="closed">Closed</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Paper>

          <Paper elevation={3} sx={{ flexGrow: 1, overflowY: 'auto', borderRadius: 2, minWidth: { md: '20vw', xs: '95vw' } }}>
            {selectedProgram ? (
              filteredTickets.length > 0 ? (
                <List disablePadding>
                  {filteredTickets.map((ticket) => (
                    <ListItemButton
                      key={ticket.id}
                      selected={selectedTicket?.id === ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      divider
                      sx={{
                        p: 2,
                        backgroundColor: selectedTicket?.id === ticket.id ? theme.palette.action.selected : 'inherit',
                        borderLeft: selectedTicket?.id === ticket.id ? `4px solid ${theme.palette.primary.main}` : 'none',
                      }}
                    >
                      <ListItemText
                        primary={ticket.subject}
                        secondary={
                          <Box component="div" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography
                              component="span"
                              variant="body2"
                              color="text.secondary"
                              sx={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                              {`From: ${ticket.studentName}`}
                            </Typography>
                            <Typography variant="caption" sx={{ ml: 1, textTransform: 'none', whiteSpace: 'nowrap' }}>
                              {formatDate(ticket.lastUpdatedAt)}
                            </Typography>
                          </Box>
                        }
                        primaryTypographyProps={{ fontWeight: '600', noWrap: true, mb: 0.5 }}
                        secondaryTypographyProps={{ noWrap: true, component: 'div' }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              ) : (
                <Box
                  sx={{
                    p: 4,
                    textAlign: 'center',
                    color: 'text.secondary',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                  }}
                >
                  <TicketIcon sx={{ fontSize: 48, mb: 1, color: 'grey.400' }} />
                  <Typography variant="h6">No {filterStatus} tickets</Typography>
                  <Typography>for this program.</Typography>
                </Box>
              )
            ) : (
              <Box
                sx={{
                  p: 4,
                  textAlign: 'center',
                  color: 'text.secondary',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                }}
              >
                <ProgramIcon sx={{ fontSize: 48, mb: 1, color: 'grey.400' }} />
                <Typography variant="h6">Select a Program</Typography>
                <Typography>Choose a program to view its support tickets.</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Chat Window */}
        <Grid
          item
          xs={12}
          md={5}
          sx={{ display: { xs: selectedTicket ? 'flex' : 'none', md: 'flex' }, flexDirection: 'column', height: '100%' }}
        >
          <Paper
            elevation={3}
            sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', borderRadius: 2, overflow: 'hidden', minWidth: { md: '60vw', xs: '95vw' } }}
          >
            <AnimatePresence>
              {selectedTicket ? (
                <motion.div
                  key={selectedTicket.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
                >
                  {/* Header */}
                  <Box
                    sx={{
                      p: 2,
                      borderBottom: 1,
                      borderColor: 'divider',
                      display: 'flex',
                      alignItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <IconButton onClick={() => setSelectedTicket(null)} sx={{ mr: 1, display: { md: 'none' } }}>
                      <ArrowBackIcon />
                    </IconButton>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography variant="h6" fontWeight={600} noWrap>
                        {selectedTicket.subject}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        From: {selectedTicket.studentName}
                      </Typography>
                    </Box>
                    {selectedTicket.status === 'open' ? (
                      <Button
                        variant="contained"
                        color="error"
                        startIcon={<LockIcon />}
                        onClick={() => handleUpdateTicketStatus(selectedTicket, 'closed')}
                      >
                        Close
                      </Button>
                    ) : (
                      <Button
                        variant="contained"
                        color="success"
                        startIcon={<LockOpenIcon />}
                        onClick={() => handleUpdateTicketStatus(selectedTicket, 'open')}
                      >
                        Re-open
                      </Button>
                    )}
                  </Box>

                  {/* Upload progress and selected file chip */}
                  {sendingMessage && (
                    <LinearProgress variant="determinate" value={uploadProgress} sx={{ mx: 2, mt: 2 }} />
                  )}
                  {!sendingMessage && fileToUpload && (
                    <Chip
                      icon={<FileIcon />}
                      label={fileToUpload.name}
                      onDelete={() => setFileToUpload(null)}
                      sx={{ mx: 2, mt: 2, alignSelf: 'flex-start' }}
                    />
                  )}

                  {/* MessageBox component with associate theme */}
                  <MessageBox
                    messages={messages}
                    inputValue={currentMessage}
                    setInputValue={setCurrentMessage}
                    onSendMessage={handleSendMessage}
                    disabled={sendingMessage || chatLoading}
                    loading={chatLoading}
                    sending={sendingMessage}
                    userRole="associate"
                    // Colors: associate (me) uses primary, others grey based on theme
                    senderColor="primary.main"
                    senderTextColor="primary.contrastText"
                    receiverColor={theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[200]}
                    receiverTextColor="text.primary"
                    // Layout: match student look-and-feel
                    containerHeight="100%"
                    messagesMaxWidth="80%"
                    messagesContainerWidth="100%"
                    selfRadius="20px 20px 5px 20px"
                    otherRadius="20px 20px 20px 5px"
                    contentPadding={{ xs: 1, sm: 2, md: 3 }}
                    inputMinWidth={{ xs: '100%', md: '55vw' }}
                    // Input enabled only when open
                    isTicketOpen={selectedTicket.status === 'open'}
                    // File selection + file-only send (parent controls file types)
                    allowFileUpload
                    acceptedFileTypes="image/*,application/pdf"
                    maxFileSizeMB={5}
                    onFileUpload={(file) => setFileToUpload(file)}
                    selectedFile={fileToUpload}
                    onClearSelectedFile={() => setFileToUpload(null)}
                  />

                  <div ref={messagesEndRef} />
                </motion.div>
              ) : (
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                    flexDirection: 'column',
                    p: 3,
                    textAlign: 'center',
                    color: 'text.secondary',
                  }}
                >
                  <ChatBubbleOutline sx={{ fontSize: 60, mb: 2, color: 'grey.400' }} />
                  <Typography variant="h5" fontWeight={500}>
                    Select a Ticket
                  </Typography>
                  <Typography>Choose a conversation to view messages.</Typography>
                </Box>
              )}
            </AnimatePresence>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
