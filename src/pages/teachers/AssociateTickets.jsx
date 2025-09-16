/*eslint-disable no-unused-vars*/
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Typography, Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, List, ListItem, ListItemText, Paper, IconButton, Chip, CircularProgress, useTheme, Grid, LinearProgress } from '@mui/material';
import { Add as AddIcon, ChatBubbleOutline, Forum as ForumIcon, ArrowBack as ArrowBackIcon,InsertDriveFile as FileIcon } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { collection, query, where, orderBy, onSnapshot, serverTimestamp, doc, writeBatch } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { auth, db } from '../../firebase/Firebase';
import MessageBox from '../../components/messageBox';
import { useAuth } from '../../context/AuthContext';
import { HeaderBackButton } from '../../components/header';

const storage = getStorage();
const ticketsCollectionRef = collection(db, 'tickets', 'associate_tickets', 'conversations');

export default function AssociateToAdminSupport() {
  const navigate = useNavigate();
  const theme = useTheme();
  const { role, userDetails, loading: authLoading } = useAuth();
  const user = auth.currentUser;
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newTicketDialogOpen, setNewTicketDialogOpen] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [currentMessage, setCurrentMessage] = useState('');
  const [fileToUpload, setFileToUpload] = useState(null);
  const [componentLoading, setComponentLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

useEffect(() => { 
  if (!authLoading && (!userDetails || (role !== "CollegeAssociate" && !userDetails?.isCollegeAssociate))) { 
    navigate('/login'); 
  } 
},);

  useEffect(() => {
    if (!user) return;
    setComponentLoading(true);
    const ticketsQuery = query(ticketsCollectionRef, where('associateId', '==', user.uid));
    const unsubscribe = onSnapshot(ticketsQuery, (snapshot) => {
      const ticketsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      ticketsData.sort((a, b) => (b.lastUpdatedAt?.toMillis() || 0) - (a.lastUpdatedAt?.toMillis() || 0));
      setTickets(ticketsData); setComponentLoading(false);
    }, () => { toast.error("Could not fetch your tickets."); setComponentLoading(false); });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleCreateTicket = async () => {
    if (!ticketSubject.trim()) { toast.error('Please enter a subject.'); return; }
    const isCollegeAssociate = userDetails?.isCollegeAssociate || role === "CollegeAssociate";
    if (!isCollegeAssociate || !userDetails) {
      toast.error("Access denied. College Associate role required.");
      return;
    }
    try {
      const teacherData = userDetails;
      const batch = writeBatch(db); const newTicketRef = doc(ticketsCollectionRef);
      const initialMessage = 'Thank you for contacting admin support. An admin will respond shortly.';
      const newTicketPayload = { associateId: user.uid, associateName: `${teacherData.firstName || ''} ${teacherData.lastName || ''}`.trim(), associateEmail: teacherData.email || 'N/A', teacherId: teacherData.teacherId || 'N/A', collegeId: teacherData.college || 'N/A', subject: ticketSubject.trim(), status: 'open', createdAt: serverTimestamp(), lastUpdatedAt: serverTimestamp(), lastMessage: initialMessage, lastSender: 'admin' };
      batch.set(newTicketRef, newTicketPayload);
      const messagesRef = doc(collection(newTicketRef, 'messages'));
      batch.set(messagesRef, { sender: 'admin', text: initialMessage, timestamp: serverTimestamp(), isDefault: true });
      await batch.commit();
      const newTicketForState = { ...newTicketPayload, id: newTicketRef.id, lastUpdatedAt: { toDate: () => new Date() } };
      setTickets(prev => [newTicketForState, ...prev].sort((a, b) => (b.lastUpdatedAt?.toDate() || 0) - (a.lastUpdatedAt?.toDate() || 0)));
      setTicketSubject(''); setNewTicketDialogOpen(false); setSelectedTicket(newTicketForState); openTicketChat(newTicketForState); toast.success('Ticket created successfully!');
    } catch (error) { console.error('Error creating ticket:', error); toast.error('Failed to create ticket. Please try again.'); }
  };

  const openTicketChat = (ticket) => {
    setSelectedTicket(ticket); setChatLoading(true);
    const messagesQuery = query(collection(ticketsCollectionRef, ticket.id, 'messages'), orderBy('timestamp', 'asc'));
    onSnapshot(messagesQuery, (snapshot) => { const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); setMessages(msgs); setChatLoading(false); });
  };

  const onFileChange = (e) => {
    const file = e.target.files[0]; if (file) { if (file.size > 5 * 1024 * 1024) { toast.error("File is too large. Maximum size is 5MB."); return; } setFileToUpload(file); }
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim() && !fileToUpload) return;
    setSendingMessage(true);
    const messageText = currentMessage.trim(); let filePayload = null;
    if (fileToUpload) {
      const filePath = `associate_support/${selectedTicket.id}/${Date.now()}_${fileToUpload.name}`; const storageRef = ref(storage, filePath); const uploadTask = uploadBytesResumable(storageRef, fileToUpload);
      try {
        await new Promise((resolve, reject) => { uploadTask.on('state_changed', (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100), (error) => reject(error), async () => { const downloadURL = await getDownloadURL(uploadTask.snapshot.ref); filePayload = { fileUrl: downloadURL, fileName: fileToUpload.name, fileType: fileToUpload.type }; resolve(); }); });
      } catch (error) { toast.error("File upload failed."); setSendingMessage(false); return; }
    }
    try {
      const batch = writeBatch(db);
      const newMessageRef = doc(collection(ticketsCollectionRef, selectedTicket.id, 'messages'));
      const messageData = { sender: 'associate', text: messageText, timestamp: serverTimestamp() };
      if (filePayload) { messageData.fileUrl = filePayload.fileUrl; messageData.fileName = filePayload.fileName; messageData.fileType = filePayload.fileType; }
      batch.set(newMessageRef, messageData);
      const ticketRef = doc(ticketsCollectionRef, selectedTicket.id);
      batch.update(ticketRef, { lastMessage: messageText || `File: ${filePayload.fileName}`, lastSender: 'associate', lastUpdatedAt: serverTimestamp(), status: 'open' });
      await batch.commit();
      setCurrentMessage(''); setFileToUpload(null); setUploadProgress(0);
    } catch (error) { toast.error('Failed to send message.'); }
    finally { setSendingMessage(false); }
  };

  if (authLoading || componentLoading) {
    return <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><CircularProgress /></Container>;
  }

  return (
    <Container maxWidth={false} disableGutters sx={{ height: '100vh' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ height: '100%', padding: theme.spacing(2) }}>
        <Grid container spacing={2} sx={{ height: '100%', flexWrap: 'nowrap' }}>
          {/* Ticket List */}
          <Grid item xs={12} md={4} lg={3} sx={{ display: { xs: selectedTicket ? 'none' : 'flex', md: 'flex' }, flexDirection: 'column', height: '100%' }}>
            <Paper elevation={3} sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, borderRadius: 3, flexShrink: 0 }}>
              <Typography variant="h6" component="h2" fontWeight={700}>
                <HeaderBackButton/> Your Tickets</Typography><Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewTicketDialogOpen(true)}>New</Button></Paper>
            <Paper elevation={3} sx={{ flexGrow: 1, overflowY: 'auto', borderRadius: 3 }}>
              <List sx={{ p: 0 }}>
                {tickets.length > 0 ? tickets.map((ticket) => (
                  <ListItem key={ticket.id} button onClick={() => openTicketChat(ticket)} divider sx={{ p: 2, backgroundColor: selectedTicket?.id === ticket.id ? theme.palette.action.selected : 'inherit', borderLeft: selectedTicket?.id === ticket.id ? `4px solid ${theme.palette.primary.main}` : 'none' }}>
                    <ListItemText primary={ticket.subject} secondary={<Box component="div" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Typography component="span" variant="body2" color="text.secondary" sx={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ticket.lastSender === 'associate' ? 'You: ' : 'Admin: '}{ticket.lastMessage}</Typography><Chip label={ticket.status} color={ticket.status === 'open' ? 'success' : 'default'} size="small" sx={{ ml: 1, textTransform: 'capitalize' }} /></Box>} primaryTypographyProps={{ fontWeight: '600', noWrap: true, mb: 0.5 }} secondaryTypographyProps={{ noWrap: true, component: 'div' }} />
                  </ListItem>
                )) : <Box sx={{ p: 4, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}><ForumIcon sx={{ fontSize: 60, color: 'grey.400', mb: 2 }} /><Typography variant="h6" color="text.secondary">No tickets yet.</Typography><Typography color="text.secondary">Click &apos;New&apos; to create one.</Typography></Box>}
              </List>
            </Paper>
          </Grid>

          {/* Chat Section */}
          <Grid item xs={12} md={8} lg={9} sx={{ display: { xs: selectedTicket ? 'flex' : 'none', md: 'flex' }, flexDirection: 'column', height: '100%' }}>
            <Paper elevation={3} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', borderRadius: 3, overflow: 'hidden' }}>
              <AnimatePresence>
                {selectedTicket ? (
                  <motion.div key={selectedTicket.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', flexShrink: 0 }}><IconButton onClick={() => setSelectedTicket(null)} sx={{ mr: 1, display: { md: 'none' } }}><ArrowBackIcon /></IconButton><Typography variant="h6" fontWeight={600} sx={{ flexGrow: 1 }}>{selectedTicket.subject}</Typography><Chip label={selectedTicket.status} color={selectedTicket.status === 'open' ? 'success' : 'default'} sx={{ textTransform: 'capitalize' }} /></Box>

                    {sendingMessage && <LinearProgress variant="determinate" value={uploadProgress} sx={{ mx: 2, mt: 2 }} />}
                    {!sendingMessage && fileToUpload && <Chip icon={<FileIcon />} label={fileToUpload.name} onDelete={() => setFileToUpload(null)} sx={{ mx: 2, mt: 2, alignSelf: 'flex-start' }} />}

                    <MessageBox
                      messages={messages}
                      inputValue={currentMessage}
                      setInputValue={setCurrentMessage}
                      onSendMessage={handleSendMessage}
                      disabled={sendingMessage || chatLoading}
                      loading={chatLoading}
                      sending={sendingMessage}
                      userRole="associate"
                      senderColor="primary.main"
                      senderTextColor="primary.contrastText"
                      receiverColor={theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[200]}
                      receiverTextColor="text.primary"
                      containerHeight="100%"
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
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column', p: 3, textAlign: 'center', minWidth: "50vw" }}><ChatBubbleOutline sx={{ fontSize: 80, color: 'grey.300' }} /><Typography variant="h5" color="text.secondary" sx={{ mt: 2 }} fontWeight={500}>Select a Ticket</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Choose a conversation from the list to start chatting.</Typography></Box>
                )}
              </AnimatePresence>
            </Paper>
          </Grid>
        </Grid>
      </motion.div>

      <Dialog open={newTicketDialogOpen} onClose={() => setNewTicketDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={600}>Create New Assistance Ticket</DialogTitle>
        <DialogContent><TextField autoFocus fullWidth label="Subject / Topic" variant="outlined" value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} sx={{ mt: 2 }} helperText="Please provide a clear and concise subject for your query." /></DialogContent>
        <DialogActions sx={{ p: '16px 24px' }}><Button onClick={() => setNewTicketDialogOpen(false)}>Cancel</Button><Button onClick={handleCreateTicket} variant="contained" disabled={!ticketSubject.trim()}>Create Ticket</Button></DialogActions>
      </Dialog>
    </Container>
  );
}
