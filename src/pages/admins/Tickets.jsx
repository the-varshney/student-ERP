/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  Container, Typography, Box, Button, List, ListItemButton,
  ListItemText, Paper, IconButton, Chip, Grid,
  CircularProgress, ToggleButtonGroup, ToggleButton, LinearProgress
} from '@mui/material';
import {
  Send as SendIcon,
  ArrowBack as ArrowBackIcon,
  CorporateFare as CollegeIcon,
  ConfirmationNumberOutlined as TicketIcon,
  ChatBubbleOutline,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  InsertDriveFile as FileIcon,
} from '@mui/icons-material';
import { motion } from 'framer-motion';
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

const storage = getStorage();
// Firestore path
const ticketsCollectionRef = collection(db, 'tickets', 'associate_tickets', 'conversations');

export default function Tickets() {
  const theme = useTheme();
  const messagesEndRef = useRef(null);

  // State
  const [ticketsByCollege, setTicketsByCollege] = useState({});
  const [selectedCollege, setSelectedCollege] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [filterStatus, setFilterStatus] = useState('open');
  const [fileToUpload, setFileToUpload] = useState(null);
  // Loading
  const [componentLoading, setComponentLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  // Auto-scroll to end
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch tickets grouped by college
  useEffect(() => {
    setComponentLoading(true);
    const ticketsQuery = query(ticketsCollectionRef, orderBy('lastUpdatedAt', 'desc'));
    const unsubscribe = onSnapshot(
      ticketsQuery,
      (snapshot) => {
        const grouped = snapshot.docs.reduce((acc, d) => {
          const t = { id: d.id, ...d.data() };
          const college = t.collegeId || 'Uncategorized';
          if (!acc[college]) acc[college] = [];
          acc[college].push(t);
          return acc;
        }, {});
        setTicketsByCollege(grouped);
        setComponentLoading(false);
      },
      () => {
        toast.error('Could not fetch tickets.');
        setComponentLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch messages for selected ticket
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

  // Filter tickets for selected college and status
  const filteredTickets = useMemo(() => {
    if (!selectedCollege || !ticketsByCollege[selectedCollege]) return [];
    return ticketsByCollege[selectedCollege].filter((t) => t.status === filterStatus);
  }, [selectedCollege, filterStatus, ticketsByCollege]);
  const handleSelectCollege = (collegeId) => {
    setSelectedCollege(collegeId);
    setSelectedTicket(null);
  };

  const handleUpdateTicketStatus = async (ticket, newStatus) => {
    const ticketRef = doc(ticketsCollectionRef, ticket.id);
    const statusMessage = `This ticket was ${newStatus} by an admin.`;
    try {
      const batch = writeBatch(db);
      batch.update(ticketRef, {
        status: newStatus,
        lastMessage: statusMessage,
        lastSender: 'system',
        lastUpdatedAt: serverTimestamp(),
      });
      const newMessageRef = doc(collection(ticketRef, 'messages'));
      batch.set(newMessageRef, {
        sender: 'system',
        text: statusMessage,
        timestamp: serverTimestamp(),
      });
      await batch.commit();
      toast.success(`Ticket successfully ${newStatus}.`);
      setSelectedTicket((prev) => (prev ? { ...prev, status: newStatus } : prev));
    } catch {
      toast.error('Failed to update ticket.');
    }
  };

  const uploadSelectedFile = async (ticketId) => {
    if (!fileToUpload) return null;
    const filePath = `admin_support/${ticketId}/${Date.now()}_${fileToUpload.name}`;
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

    let filePayload = null;
    try {
      if (fileToUpload) {filePayload = await uploadSelectedFile(selectedTicket.id);}

      const batch = writeBatch(db);
      const ticketRef = doc(ticketsCollectionRef, selectedTicket.id);
      const newMsgRef = doc(collection(ticketRef, 'messages'));

      const msg = {
        sender: 'admin',
        text: messageText || '',
        timestamp: serverTimestamp(),
      };
      if (filePayload) Object.assign(msg, filePayload);

      batch.set(newMsgRef, msg);
      batch.update(ticketRef, {
        lastMessage: messageText || (filePayload ? `File: ${filePayload.fileName}` : ''),
        lastSender: 'admin',
        lastUpdatedAt: serverTimestamp(),
        status: 'open',
      });
      await batch.commit();

      setFileToUpload(null);
      setUploadProgress(0);
      if (selectedTicket.status === 'closed') {
        setSelectedTicket((prev) => (prev ? { ...prev, status: 'open' } : prev));
      }
    } catch {
      toast.error('Failed to send message.');
      setCurrentMessage(messageText);
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
      sx={{ height: '100vh', py: 2, px: 2, backgroundColor: theme.palette.mode === 'dark' ? theme.palette.background.default : '#f5f5f5' }}
    >
      <Grid container spacing={2} sx={{ height: '100%', flexWrap: 'nowrap' }}>
        {/* Colleges column */}
        <Grid item xs={12} md={3} sx={{ 
          display: { xs: selectedCollege ? 'none' : 'flex', md: 'flex' }, 
          flexDirection: 'column', 
          height: '100%' 
        }}
        >
          <Paper elevation={3} sx={{ p: 2, mb: 2, borderRadius: 2, flexShrink: 0, minWidth: { md: '15vw', xs: '95vw' } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <HeaderBackButton/>
              <CollegeIcon sx={{ color: 'text.secondary' }} />
              <Typography variant="h6" fontWeight={700}>
                Colleges
              </Typography>
            </Box>
          </Paper>

          <Paper elevation={3} sx={{ flexGrow: 1, overflowY: 'auto', borderRadius: 2, minWidth: { md: '15vw', xs: '95vw' } }}>
            <List disablePadding>
              {Object.keys(ticketsByCollege)
                .sort()
                .map((collegeId) => (
                  <ListItemButton
                    key={collegeId}
                    selected={selectedCollege === collegeId}
                    onClick={() => handleSelectCollege(collegeId)}
                    sx={{
                      py: 1.5,
                      borderLeft: selectedCollege === collegeId ? `4px solid ${theme.palette.primary.main}` : 'none',
                      backgroundColor: selectedCollege === collegeId ? theme.palette.action.selected : 'inherit',
                    }}
                  >
                    <ListItemText primary={collegeId} primaryTypographyProps={{ fontWeight: 500 }} />
                  </ListItemButton>
                ))}
            </List>
          </Paper>
        </Grid>

        {/* Tickets column */}
        <Grid
          item
          xs={12}
          md={4}
          sx={{
            display: { xs: selectedCollege && !selectedTicket ? 'flex' : 'none', md: 'flex' },
            flexDirection: 'column',
            height: '100%',
            maxWidth: { md: '20vw', xs: '95vw' },
          }}
        >
          <Paper elevation={3} sx={{ p: 2, mb: 2, borderRadius: 2, flexShrink: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <IconButton onClick={() => setSelectedCollege(null)} sx={{ display: { md: 'none' }, mr: 1 }}>
                <ArrowBackIcon />
              </IconButton>
              <Typography variant="h6" fontWeight={700} noWrap sx={{ flexGrow: 1 }}>
                {selectedCollege || 'Select College'}
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
            {selectedCollege ? (
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
                        secondary={`From: ${ticket.associateName}`}
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
                  <Typography>for this college.</Typography>
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
                <CollegeIcon sx={{ fontSize: 48, mb: 1, color: 'grey.400' }} />
                <Typography variant="h6">Select a College</Typography>
                <Typography>Choose a college to view its support tickets.</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Chat column */}
        <Grid item xs={12} md={5}
          sx={{ display: { xs: selectedTicket ? 'flex' : 'none', md: 'flex' }, flexDirection: 'column', height: '100%' }}
        >
          <Paper
            elevation={3}
            sx={{
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 2,
              overflow: 'hidden',
              minWidth: { md: '60vw', xs: '95vw' },
            }}
          >
            {selectedTicket ? (
              <motion.div
                key={selectedTicket.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
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
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" fontWeight={600} noWrap>
                      {selectedTicket.subject}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      From: {selectedTicket.associateName}
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

                {/* Upload progress and file icon */}
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

                {/* MessageBox */}
                <MessageBox
                  messages={messages}
                  inputValue={currentMessage}
                  setInputValue={setCurrentMessage}
                  onSendMessage={handleSendMessage}
                  disabled={sendingMessage || chatLoading}
                  loading={chatLoading}
                  sending={sendingMessage}

                  userRole="admin"
                  senderColor="primary.main"
                  senderTextColor="primary.contrastText"
                  receiverColor={theme.palette.grey[200]}
                  receiverTextColor="text.primary"

                  containerHeight="calc(100% - 0px)"
                  messagesMaxWidth="80%"
                  messagesContainerWidth="100%"
                  selfRadius="20px 20px 5px 20px"
                  otherRadius="20px 20px 20px 5px"
                  contentPadding={{ xs: 1, sm: 2, md: 3 }}
                  inputMinWidth={{ xs: '100%', md: '55vw' }}
                  isTicketOpen={selectedTicket.status === 'open'}
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
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
