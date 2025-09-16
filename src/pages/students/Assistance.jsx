/* eslint-disable no-empty */
/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import {
  Container, Typography, Box, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, List, ListItem,
  ListItemText, Paper, IconButton, Chip,
  Alert, CircularProgress, useTheme, Grid, LinearProgress
} from '@mui/material';
import {
  Add as AddIcon,
  ChatBubbleOutline,
  Forum as ForumIcon,
  ArrowBack as ArrowBackIcon,
  InsertDriveFile as FileIcon,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import {
  collection, query, where, orderBy, onSnapshot,
  serverTimestamp, doc, writeBatch
} from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { auth, db } from '../../firebase/Firebase';
import { themes } from '../../components/theme';
import MessageBox from '../../components/messageBox';

const NS = 'erp';
const VER = 'v1';
const key = (uid, name) => `${NS}:${uid}:${name}:${VER}`;
const parseCache = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

const readMergedStudentFromLocal = () => {
  const uid = auth.currentUser?.uid || null;
  if (uid && typeof window !== 'undefined') {
    const mergedRaw = window.localStorage.getItem(key(uid, 'student'));
    const mergedEntry = parseCache(mergedRaw);
    if (mergedEntry?.v) return mergedEntry.v;

    const legacyRaw = window.localStorage.getItem(`userDetails_${uid}`);
    try { if (legacyRaw) return JSON.parse(legacyRaw); } catch {}
  }
  if (typeof window !== 'undefined') {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(`${NS}:`) && k.endsWith(`:student:${VER}`)) {
        const raw = window.localStorage.getItem(k);
        const entry = parseCache(raw);
        if (entry?.v) return entry.v;
      }
    }
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('userDetails_')) {
        const raw = window.localStorage.getItem(k);
        try { const legacy = raw ? JSON.parse(raw) : null; if (legacy) return legacy; } catch {}
      }
    }
  }
  return null;
};

const normalizeStudent = (merged) => {
  if (!merged) return null;
  return {
    firebaseUid: merged.firebaseId || auth.currentUser?.uid || '',
    firstName: merged.firstName || '',
    lastName: merged.lastName || '',
    email: merged.email || 'N/A',
    collegeId: merged.collegeId || 'N/A',
    program: merged.Program || merged.program || 'N/A',
    semester: String(merged.Semester || merged.semester || 'N/A'),
  };
};

// Firestore refs
const ticketsCollectionRef = collection(db, 'tickets', 'student_tickets', 'conversations');
const storage = getStorage();

//UI helpers
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

export default function Assistance() {
  const theme = useTheme();
  // Cached student
  const [student, setStudent] = useState(null);
  // Tickets and chat
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);

  const [newTicketDialogOpen, setNewTicketDialogOpen] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [currentMessage, setCurrentMessage] = useState('');

  const [componentLoading, setComponentLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);

  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    const merged = readMergedStudentFromLocal();
    const norm = normalizeStudent(merged);
    setStudent(norm);
  }, []);

  // Fetch tickets for cached firebaseUid
  useEffect(() => {
    if (!student?.firebaseUid) {
      setComponentLoading(false);
      return;
    }
    setComponentLoading(true);

    const qRef = query(ticketsCollectionRef, where('studentId', '==', student.firebaseUid));
    const unsubscribe = onSnapshot(
      qRef,
      (snapshot) => {
        const ticketsData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        ticketsData.sort(
          (a, b) => (b.lastUpdatedAt?.toMillis?.() || 0) - (a.lastUpdatedAt?.toMillis?.() || 0)
        );
        setTickets(ticketsData);
        setComponentLoading(false);
      },
      (error) => {
        console.error('Error fetching tickets:', error);
        toast.error('Could not fetch your tickets.');
        setComponentLoading(false);
      }
    );

    return () => unsubscribe();
  }, [student?.firebaseUid]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCreateTicket = async () => {
    if (!ticketSubject.trim()) {
      toast.error('Please enter a subject.');
      return;
    }
    if (!student?.firebaseUid) {
      toast.error('No cached student profile found. Please sign in once to cache your profile.');
      return;
    }

    try {
      const batch = writeBatch(db);
      const newTicketRef = doc(ticketsCollectionRef);
      const initialMessage =
        'Thank you for reaching out. A college associate will respond to you shortly.';

      // Ticket doc from cache
      batch.set(newTicketRef, {
        studentId: student.firebaseUid,
        studentName: `${student.firstName} ${student.lastName}`.trim() || 'Student',
        studentEmail: student.email || 'N/A',
        collegeId: student.collegeId || 'N/A',
        programId: student.program || 'N/A',
        semester: student.semester || 'N/A',
        subject: ticketSubject.trim(),
        status: 'open',
        createdAt: serverTimestamp(),
        lastUpdatedAt: serverTimestamp(),
        lastMessage: initialMessage,
        lastSender: 'associate',
      });

      // First message
      const messagesRef = doc(collection(newTicketRef, 'messages'));
      batch.set(messagesRef, {
        sender: 'associate',
        text: initialMessage,
        timestamp: serverTimestamp(),
        isDefault: true,
      });

      await batch.commit();

      setTicketSubject('');
      setNewTicketDialogOpen(false);

      const newTicketData = {
        id: newTicketRef.id,
        subject: ticketSubject.trim(),
        status: 'open',
      };
      setSelectedTicket(newTicketData);
      openTicketChat(newTicketData);

      toast.success('Ticket created successfully!');
    } catch (error) {
      console.error('Error creating ticket:', error);
      toast.error('Failed to create ticket. Please try again.');
    }
  };

  const openTicketChat = (ticket) => {
    setSelectedTicket(ticket);
    setChatLoading(true);
    const messagesQuery = query(
      collection(ticketsCollectionRef, ticket.id, 'messages'),
      orderBy('timestamp', 'asc')
    );
    return onSnapshot(messagesQuery, (snapshot) => {
      const msgs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
      setChatLoading(false);
    });
  };

  const uploadSelectedFile = async (ticketId) => {
    if (!fileToUpload) return null;
    const filePath = `student_support/${ticketId}/${Date.now()}_${fileToUpload.name}`;
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

  const handleSendMessage = async (textFromBox) => {
    if (!selectedTicket) return;

    const messageText = (textFromBox ?? currentMessage).trim();
    if (!messageText && !fileToUpload) return;

    setSendingMessage(true);
    setCurrentMessage('');

    try {
      let filePayload = null;
      if (fileToUpload) {
        filePayload = await uploadSelectedFile(selectedTicket.id);
      }

      const batch = writeBatch(db);
      const newMessageRef = doc(
        collection(ticketsCollectionRef, selectedTicket.id, 'messages')
      );

      const msg = {
        sender: 'student',
        text: messageText || '',
        timestamp: serverTimestamp(),
      };
      if (filePayload) Object.assign(msg, filePayload);

      batch.set(newMessageRef, msg);

      const ticketRef = doc(ticketsCollectionRef, selectedTicket.id);
      batch.update(ticketRef, {
        lastMessage: messageText || (filePayload ? `File: ${filePayload.fileName}` : ''),
        lastSender: 'student',
        lastUpdatedAt: serverTimestamp(),
        status: 'open',
      });

      await batch.commit();

      setFileToUpload(null);
      setUploadProgress(0);
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message.');
      setCurrentMessage(messageText);
    } finally {
      setSendingMessage(false);
    }
  };

  if (componentLoading) {
    return (
      <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '90vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth={false} disableGutters sx={{ height: '100vh', }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ height: '100%', padding: theme.spacing(2) }}>
        {!student?.firebaseUid && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No student profile found.
          </Alert>
        )}

        <Grid container spacing={2} sx={{ height: '100%', flexWrap: 'nowrap' }}>
          {/* Ticket List */}
          <Grid item xs={12} md={4} lg={3} sx={{ display: { xs: selectedTicket ? 'none' : 'flex', md: 'flex' }, flexDirection: 'column', height: '100%' }}>
            <Paper elevation={3} sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, borderRadius: 3, flexShrink: 0 }}>
              <Typography variant="h6" component="h2" fontWeight={700}>Your Tickets</Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewTicketDialogOpen(true)} disabled={!student?.firebaseUid}>
                New
              </Button>
            </Paper>
            <Paper elevation={3} sx={{ flexGrow: 1, overflowY: 'auto', borderRadius: 3 }}>
              <List sx={{ p: 0 }}>
                {tickets.length > 0 ? tickets.map((ticket) => (
                  <ListItem
                    key={ticket.id}
                    button
                    onClick={() => openTicketChat(ticket)}
                    divider
                    sx={{
                      p: 2,
                      backgroundColor: selectedTicket?.id === ticket.id ? theme.palette.action.selected : 'inherit',
                      borderLeft: selectedTicket?.id === ticket.id ? `4px solid ${theme.palette.primary.main}` : 'none'
                    }}
                  >
                    <ListItemText
                      primary={ticket.subject}
                      secondary={
                        <Box component="div" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography component="span" variant="body2" color="text.secondary" sx={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ticket.lastSender === 'student' ? 'You: ' : ''}{ticket.lastMessage}
                          </Typography>
                          <Chip label={ticket.status} color={ticket.status === 'open' ? 'success' : 'default'} size="small" sx={{ ml: 1, textTransform: 'capitalize' }} />
                        </Box>
                      }
                      primaryTypographyProps={{ fontWeight: '600', noWrap: true, mb: 0.5 }}
                      secondaryTypographyProps={{ noWrap: true, component: 'div' }}
                    />
                  </ListItem>
                )) : (
                  <Box sx={{ p: 4, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <ForumIcon sx={{ fontSize: 60, color: 'grey.400', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">No tickets yet.</Typography>
                    <Typography color="text.secondary">Click &apos;New&apos; to create one.</Typography>
                  </Box>
                )}
              </List>
            </Paper>
          </Grid>

          {/* Chat Section */}
          <Grid item xs={12} md={8} lg={9} sx={{ display: { xs: selectedTicket ? 'flex' : 'none', md: 'flex' }, flexDirection: 'column', height: '100%' }}>
            <Paper elevation={3} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', borderRadius: 3, overflow: 'hidden' }}>
              <AnimatePresence>
                {selectedTicket ? (
                  <motion.div key={selectedTicket.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    {/* Header */}
                    <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      <IconButton onClick={() => setSelectedTicket(null)} sx={{ mr: 1, display: { md: 'none' } }}>
                        <ArrowBackIcon />
                      </IconButton>
                      <Typography variant="h6" fontWeight={600} sx={{ flexGrow: 1 }}>{selectedTicket.subject}</Typography>
                      <Chip label={selectedTicket.status} color={selectedTicket.status === 'open' ? 'success' : 'default'} sx={{ textTransform: 'capitalize' }} />
                    </Box>

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

                    <MessageBox
                      messages={messages}
                      inputValue={currentMessage}
                      setInputValue={setCurrentMessage}
                      onSendMessage={handleSendMessage}
                      disabled={sendingMessage || chatLoading}
                      loading={chatLoading}
                      sending={sendingMessage}
                      userRole="student"
                      senderColor="primary.main"
                      senderTextColor="primary.contrastText"
                      receiverColor={themes?.default?.palette?.green?.hover || '#e9f8e6'}
                      receiverTextColor="text.primary"
                      containerHeight="100%"
                      containerMaxWidth="55vw"
                      messagesMaxWidth="50vw"
                      selfRadius="20px 20px 5px 20px"
                      otherRadius="20px 20px 20px 5px"
                      contentPadding={{ xs: 1, sm: 2, md: 3 }}
                      inputMinWidth={{ xs: '100%', md: '55vw' }}
                      allowFileUpload
                      acceptedFileTypes="image/*,application/pdf"
                      maxFileSizeMB={10}
                      onFileUpload={(file) => setFileToUpload(file)}
                      selectedFile={fileToUpload}
                      onClearSelectedFile={() => setFileToUpload(null)}
                      isTicketOpen={selectedTicket.status === 'open'}
                    />
                  </motion.div>
                ) : (
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: '70vw', height: '100%', flexDirection: 'column', p: 3, textAlign: 'center' }}>
                    <ChatBubbleOutline sx={{ fontSize: 80, color: 'grey.300' }} />
                    <Typography variant="h5" color="text.secondary" sx={{ mt: 2 }} fontWeight={500}>Select a Ticket</Typography>
                    <Typography color="text.secondary" sx={{ mt: 1 }}>Choose a conversation from the list to start chatting.</Typography>
                  </Box>
                )}
              </AnimatePresence>
            </Paper>
          </Grid>
        </Grid>
      </motion.div>

      {/* Ticket Dialog */}
      <Dialog open={newTicketDialogOpen} onClose={() => setNewTicketDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={600}>Create New Assistance Ticket</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Subject / Topic"
            variant="outlined"
            value={ticketSubject}
            onChange={(e) => setTicketSubject(e.target.value)}
            sx={{ mt: 2 }}
            helperText="Please provide a clear and concise subject for your query."
          />
        </DialogContent>
        <DialogActions sx={{ p: '16px 24px' }}>
          <Button onClick={() => setNewTicketDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateTicket} variant="contained" disabled={!ticketSubject.trim() || !student?.firebaseUid}>
            Create Ticket
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
