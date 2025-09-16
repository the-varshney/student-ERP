/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { auth, db, storage } from '../../firebase/Firebase';
import {
  collection, addDoc, doc, updateDoc, getDocs, setDoc, arrayUnion, arrayRemove,
  serverTimestamp, onSnapshot, query, where, orderBy, getDoc, deleteDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import { Box, Typography, TextField, Button, Card, Avatar, IconButton, Divider, Chip, Snackbar, Alert, CircularProgress, Paper, 
  Grid, Modal, Select, MenuItem, FormControl, InputLabel, List, ListItem, ListItemAvatar, ListItemText, Tooltip, Drawer, Badge, 
  Stack, useTheme, useMediaQuery, AppBar, Toolbar, ListItemButton, InputAdornment,
} from '@mui/material';
import {
  Favorite as FavoriteIcon,
  Send as SendIcon,
  FilterList as FilterListIcon,
  Close as CloseIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  UploadFile as UploadFileIcon,
  Check as CheckIcon,
  Message as MessageIcon,
  AttachFile as AttachFileIcon,
  Visibility as VisibilityIcon,
  ArrowBack as ArrowBackIcon,
  Search as SearchIcon,
  Chat as ChatIcon,
  ClearAll as ClearAllIcon,
  Add as AddIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';
import { motion } from 'framer-motion';
import axios from 'axios';
import ReactPlayer from 'react-player';

import MessageBox from '../../components/messageBox';
import PdfViewer from '../../components/PdfViewer';
import ImageViewer from '../../components/ImageViewer';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const FacultySpace = () => {
  const navigate = useNavigate();
  const { postId } = useParams();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [caption, setCaption] = useState('');
  const [file, setFile] = useState(null);
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState('Public');
  const [posts, setPosts] = useState([]);
  const [newComment, setNewComment] = useState({});
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [loading, setLoading] = useState(true);

  // Local action states
  const [posting, setPosting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sending, setSending] = useState(false);

  const [allUsers, setAllUsers] = useState([]);
  const [recentChats, setRecentChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatFile, setChatFile] = useState(null);

  const [selectedPost, setSelectedPost] = useState(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [enlargedPicOpen, setEnlargedPicOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editPost, setEditPost] = useState(null);
  const [editCaption, setEditCaption] = useState('');
  const [editTags, setEditTags] = useState('');

  const [dmModalOpen, setDmModalOpen] = useState(false);

  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const [filterState, setFilterState] = useState({
    college: '',
    olderThan: '',
    name: '',
    fileType: '',
    hashtag: '',
  });

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Mobile-only: DM Drawer
  const [dmDrawerOpen, setDmDrawerOpen] = useState(false);
  const [dmSearchTerm, setDmSearchTerm] = useState('');

  // Search teacher
  const [teacherSearchTerm, setTeacherSearchTerm] = useState('');
  const [teacherSearchResult, setTeacherSearchResult] = useState(null);
  // Create Post modal
  const [createPostOpen, setCreatePostOpen] = useState(false);
  // Image viewer for post images and DM header avatar
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  // PDF viewer for post PDFs
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfName, setPdfName] = useState('');

  const chatMessagesEndRef = useRef(null);
  const [collegeOptions, setCollegeOptions] = useState([]);

  const fallbackAvatar = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png';

  // Auth/role
  useEffect(() => {
    const checkUserRole = auth.onAuthStateChanged(async (userAuth) => {
      if (!userAuth) {
        navigate('/login');
        return;
      }

      const [teacherDoc, adminDoc] = await Promise.all([
        getDoc(doc(db, 'Teachers', userAuth.uid)),
        getDoc(doc(db, 'Admins', userAuth.uid))
      ]);

      if (teacherDoc.exists()) {
        const teacherData = teacherDoc.data();
        setUserInfo({
          uid: userAuth.uid,
          firstName: teacherData.firstName,
          lastName: teacherData.lastName,
          profilePicUrl: teacherData.profilePicUrl || fallbackAvatar,
          college: teacherData.college || '',
          role: teacherData.role,
          email: teacherData.email || '',
          isCollegeAssociate: teacherData.isCollegeAssociate || false,
        });
        setIsAuthorized(true);
      } else if (adminDoc.exists()) {
        const adminData = adminDoc.data();
        setUserInfo({
          uid: userAuth.uid,
          firstName: adminData.firstName,
          lastName: adminData.lastName,
          profilePicUrl: adminData.profilePicUrl || fallbackAvatar,
          college: adminData.college || 'C000',
          email: adminData.email || '',
          role: adminData.role,
          isCollegeAssociate: false,
        });
        setIsAuthorized(true);
      } else {
        navigate('/home');
      }
      setLoading(false);
    });

    return () => checkUserRole();
  }, [navigate]);

  // Posts
  useEffect(() => {
    if (!isAuthorized) return;
    const q = query(collection(db, 'FacultyPosts'), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const fetchedPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPosts(fetchedPosts);
      if (postId) setSelectedPost(fetchedPosts.find(p => p.id === postId));
    });
    return () => unsub();
  }, [isAuthorized, postId]);

  // Chats list
  useEffect(() => {
    if (!isAuthorized || !userInfo) return;
    const chatsQuery = query(
      collection(db, 'Chats'),
      where('participants', 'array-contains', userInfo.uid)
    );
    const unsub = onSnapshot(chatsQuery, (snapshot) => {
      const chats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecentChats(chats.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0)));
    });
    return () => unsub();
  }, [isAuthorized, userInfo]);

  // Users
  useEffect(() => {
    if (!isAuthorized) return;
    const fetchAllUsers = async () => {
      const teachersSnapshot = await getDocs(collection(db, 'Teachers'));
      const adminsSnapshot = await getDocs(collection(db, 'Admins'));
      const allFetchedUsers = [
        ...teachersSnapshot.docs.map(doc => ({
          uid: doc.id,
          firstName: doc.data().firstName,
          lastName: doc.data().lastName,
          fullName: `${doc.data().firstName} ${doc.data().lastName}`,
          profilePicUrl: doc.data().profilePicUrl || fallbackAvatar,
          college: doc.data().college || '',
          email: doc.data().email || '',
          isCollegeAssociate: doc.data().isCollegeAssociate || false,
          role: doc.data().role,
        })),
        ...adminsSnapshot.docs.map(doc => ({
          uid: doc.id,
          firstName: doc.data().firstName,
          lastName: doc.data().lastName,
          fullName: `${doc.data().firstName} ${doc.data().lastName}`,
          profilePicUrl: doc.data().profilePicUrl || fallbackAvatar,
          email: doc.data().email || '',
          college: doc.data().college || 'C000',
          isCollegeAssociate: false,
          role: doc.data().role,
        })),
      ];
      setAllUsers(allFetchedUsers);
    };
    fetchAllUsers();
  }, [isAuthorized]);

  // Chat messages + mark seen
  useEffect(() => {
    if (!selectedChat || !userInfo) return;
    const messagesQuery = query(
      collection(db, 'Chats', selectedChat.id, 'Messages'),
      orderBy('timestamp', 'asc')
    );
    const unsub = onSnapshot(messagesQuery, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setChatMessages(messages);
      messages.forEach(async (msg) => {
        if (msg.senderId !== userInfo.uid && !msg.seen) {
          await updateDoc(doc(db, 'Chats', selectedChat.id, 'Messages', msg.id), { seen: true });
        }
      });
    });
    return () => unsub();
  }, [selectedChat, userInfo]);

  // Colleges
  useEffect(() => {
    const fetchColleges = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/colleges`);
        setCollegeOptions(response.data);
      } catch (error) {
        console.error("Failed to fetch colleges:", error);
      }
    };
    fetchColleges();
  }, []);

  // Upload helper
  const handleFileUpload = async (anyFile) => {
    if (!anyFile) return null;
    const fileRef = ref(storage, `faculty_uploads/${uuidv4()}_${anyFile.name}`);
    const snapshot = await uploadBytes(fileRef, anyFile);
    const url = await getDownloadURL(snapshot.ref);
    return { url, type: anyFile.type, name: anyFile.name };
  };

  // Create post
  const handlePostSubmit = async () => {
    if (!caption && !file) {
      setSnackbar({ open: true, message: 'Please add a caption or file.', severity: 'error' });
      return;
    }
    setPosting(true);
    let fileData = null;
    if (file) {
      try {
        fileData = await handleFileUpload(file);
      } catch (err) {
        setSnackbar({ open: true, message: 'Failed to upload file.', severity: 'error' });
        setPosting(false);
        return;
      }
    }
    try {
      await addDoc(collection(db, 'FacultyPosts'), {
        teacherId: userInfo.uid,
        name: `${userInfo.firstName} ${userInfo.lastName}`,
        profilePic: userInfo.profilePicUrl,
        caption,
        fileUrl: fileData ? fileData.url : '',
        fileType: fileData ? fileData.type : '',
        tags: tags.split(' ').filter(tag => tag.startsWith('#')).map(tag => tag.toLowerCase()),
        visibility,
        timestamp: serverTimestamp(),
        likes: [],
        comments: [],
        college: userInfo.college,
      });
      setSnackbar({ open: true, message: 'Post created successfully!', severity: 'success' });
      setCaption('');
      setFile(null);
      setTags('');
      setCreatePostOpen(false);
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to create post.', severity: 'error' });
      console.error(err);
    } finally {
      setPosting(false);
    }
  };

  const handleEditPost = (post) => {
    setEditPost(post);
    setEditCaption(post.caption);
    setEditTags(post.tags.join(' '));
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editPost) return;
    setEditing(true);
    try {
      const postRef = doc(db, 'FacultyPosts', editPost.id);
      await updateDoc(postRef, {
        caption: editCaption,
        tags: editTags.split(' ').filter(tag => tag.startsWith('#')).map(tag => tag.toLowerCase()),
      });
      setSnackbar({ open: true, message: 'Post updated successfully!', severity: 'success' });
      setEditModalOpen(false);
      setEditPost(null);
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to update post.', severity: 'error' });
    } finally {
      setEditing(false);
    }
  };

  const handleDeletePost = async (postId) => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'FacultyPosts', postId));
      setSnackbar({ open: true, message: 'Post deleted successfully!', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to delete post.', severity: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const handleLike = async (postId) => {
    const postRef = doc(db, 'FacultyPosts', postId);
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    if (post.likes.includes(userInfo.uid)) {
      await updateDoc(postRef, { likes: arrayRemove(userInfo.uid) });
    } else {
      await updateDoc(postRef, { likes: arrayUnion(userInfo.uid) });
    }
  };

  const handleCommentSubmit = async (postId) => {
    const commentText = newComment[postId] || '';
    if (!commentText) return;
    const postRef = doc(db, 'FacultyPosts', postId);
    try {
      await updateDoc(postRef, {
        comments: arrayUnion({
          name: `${userInfo.firstName} ${userInfo.lastName}`,
          profilePic: userInfo.profilePicUrl,
          text: commentText,
          timestamp: new Date().toISOString(),
        }),
      });
      setNewComment(prev => ({ ...prev, [postId]: '' }));
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to add comment.', severity: 'error' });
    }
  };

  const initiateChat = async (userId) => {
    if (userId === userInfo.uid) return;
    const chatId = [userInfo.uid, userId].sort().join('_');
    const chatRef = doc(db, 'Chats', chatId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) {
      await setDoc(chatRef, {
        participants: [userInfo.uid, userId],
        lastMessage: '',
        timestamp: serverTimestamp(),
      });
    }
    const otherUser = allUsers.find(t => t.uid === userId);
    setSelectedChat({ id: chatId, recipientId: userId, recipientName: otherUser?.fullName });
    setDmModalOpen(true);
  };

  // MessageBox 
  const handleSendMessage = async (messageText) => {
    if (!messageText && !chatFile) return;
    setSending(true);
    let fileData = null;
    if (chatFile) {
      try {
        fileData = await handleFileUpload(chatFile);
      } catch (err) {
        setSnackbar({ open: true, message: 'Failed to upload file.', severity: 'error' });
        setSending(false);
        return;
      }
    }
    const messageRef = collection(db, 'Chats', selectedChat.id, 'Messages');
    try {
      await addDoc(messageRef, {
        senderId: userInfo.uid,
        text: messageText || '',
        fileUrl: fileData ? fileData.url : '',
        fileType: fileData ? fileData.type : '',
        fileName: fileData ? fileData.name : '',
        timestamp: serverTimestamp(),
        seen: false,
      });
      await updateDoc(doc(db, 'Chats', selectedChat.id), {
        lastMessage: messageText || (fileData ? (fileData.type?.includes('image') ? 'Image' : 'File') : ''),
        timestamp: serverTimestamp(),
      });
      setNewMessage('');
      setChatFile(null);
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to send message.', severity: 'error' });
    } finally {
      setSending(false);
    }
  };

  // useMemo hooks
  const filteredRecentChats = useMemo(() => {
    if (!dmSearchTerm.trim()) return recentChats;
    const term = dmSearchTerm.toLowerCase();
    return recentChats.filter(chat => {
      const otherId = chat.participants.find(id => id !== userInfo?.uid);
      const usr = allUsers.find(u => u.uid === otherId);
      return usr?.fullName?.toLowerCase().includes(term);
    });
  }, [dmSearchTerm, recentChats, allUsers, userInfo]);

  const userSearchResults = useMemo(() => {
    const term = dmSearchTerm.trim().toLowerCase();
    if (!term) return [];
    return allUsers
      .filter(u => u.uid !== userInfo?.uid && u.fullName?.toLowerCase().includes(term))
      .slice(0, 10);
  }, [dmSearchTerm, allUsers, userInfo]);

  const teacherPosts = useMemo(() => {
    if (!teacherSearchResult) return [];
    return posts.filter(p => p.teacherId === teacherSearchResult.uid);
  }, [teacherSearchResult, posts]);

  // Filters
  const filteredPosts = posts.filter(post => {
    const user = allUsers.find(t => t.uid === post.teacherId);
    const matchesCollege = filterState.college ? (user?.college === filterState.college) : true;
    const matchesOlderThan = filterState.olderThan ? dayjs(post.timestamp?.toDate()).isBefore(dayjs().subtract(filterState.olderThan, 'day')) : true;
    const matchesName = filterState.name ? post.name.toLowerCase().includes(filterState.name.toLowerCase()) : true;
    const matchesFileType = filterState.fileType ? (post.fileType || '').includes(filterState.fileType.toLowerCase()) : true;
    const matchesHashtag = filterState.hashtag ? post.tags.includes(filterState.hashtag.toLowerCase()) : true;

    const isVisible = post.visibility === 'Public' ||
      (post.visibility === 'My College' && userInfo?.college === user?.college) ||
      post.teacherId === userInfo?.uid;

    return isVisible && matchesCollege && matchesOlderThan && matchesName && matchesFileType && matchesHashtag;
  });

  const handleViewProfile = (userId) => {
    const user = allUsers.find(t => t.uid === userId);
    if (user) {
      setSelectedProfile({
        ...user,
        posts: posts.filter(p => p.teacherId === userId),
        sharedResources: posts.filter(p => p.teacherId === userId && p.fileUrl).map(p => p.fileUrl),
      });
      setProfileModalOpen(true);
    }
  };

  const handleTagClick = (tag) => {
    setFilterState(prev => ({ ...prev, hashtag: tag.toLowerCase() }));
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilterState(prev => ({ ...prev, [name]: value }));
  };

  const handleClearFilters = () => {
    setFilterState({
      college: '',
      olderThan: '',
      name: '',
      fileType: '',
      hashtag: '',
    });
  };

  const renderFilters = (opts = { showClear: true }) => (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={{ xs: 2, md: 1 }}
      alignItems="center"
      flexWrap="wrap"
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${theme.palette.divider}`,
        mt: 2,
      }}
    >
      <Typography variant="body1" fontWeight="bold">
        Filter by:
      </Typography>
      <TextField
        label="Name"
        name="name"
        size="small"
        value={filterState.name}
        onChange={handleFilterChange}
        sx={{ flex: { xs: '1 1 100%', md: 1 }, minWidth: { xs: "100%", md: 'auto' } }}
      />
      <TextField
        label="Hashtag"
        name="hashtag"
        size="small"
        value={filterState.hashtag}
        onChange={handleFilterChange}
        sx={{ flex: { xs: '1 1 100%', md: 1 }, minWidth: { xs: "100%", md: 'auto' } }}
      />
      <FormControl size="small" sx={{ flex: { xs: '1 1 100%', md: 1 }, minWidth: { xs: "100%", md: 'auto' } }}>
        <InputLabel>College</InputLabel>
        <Select
          value={filterState.college}
          name="college"
          label="College"
          onChange={handleFilterChange}
        >
          <MenuItem value="">All</MenuItem>
          {collegeOptions.map((college) => (
            <MenuItem key={college._id} value={college._id}>
              {college.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ flex: { xs: '1 1 100%', md: 1 }, minWidth: { xs: "100%", md: 'auto' } }}>
        <InputLabel>Older Than</InputLabel>
        <Select
          value={filterState.olderThan}
          name="olderThan"
          label="Older Than"
          onChange={handleFilterChange}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="1">1 Day</MenuItem>
          <MenuItem value="7">1 Week</MenuItem>
          <MenuItem value="30">1 Month</MenuItem>
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ flex: { xs: '1 1 100%', md: 1 }, minWidth: { xs: "100%", md: 'auto' } }}>
        <InputLabel>File Type</InputLabel>
        <Select
          value={filterState.fileType}
          name="fileType"
          label="File Type"
          onChange={handleFilterChange}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="image">Image</MenuItem>
          <MenuItem value="video">Video</MenuItem>
          <MenuItem value="pdf">PDF</MenuItem>
          <MenuItem value="text">Document</MenuItem>
        </Select>
      </FormControl>

      {opts.showClear && (
        <Button
          startIcon={<ClearAllIcon />}
          variant="text"
          color="inherit"
          onClick={handleClearFilters}
          sx={{ ml: { md: 'auto' } }}
        >
          Clear
        </Button>
      )}
    </Stack>
  );

  // Post card with role/associate badges and file viewers
  const renderPost = (post) => {
    const author = allUsers.find(u => u.uid === post.teacherId);
    const isAdmin = author?.role && String(author.role).toLowerCase().includes('admin');
    const isAssociate = !!author?.isCollegeAssociate;

    const isPdf = (post.fileType || '').toLowerCase().includes('pdf') || /\.pdf(\?|$)/i.test(post.fileUrl || '');

    const openImage = (url) => {
      setImageUrl(url || '');
      setImageOpen(true);
    };

    const openPdf = (url, name) => {
      setPdfUrl(url || '');
      setPdfName(name || 'Document.pdf');
      setPdfOpen(true);
    };

    return (
      <motion.div key={post.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Card sx={{ mb: 2, p: 2.5, mt: 2, position: 'relative', borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
            <Avatar
              src={post.profilePic || fallbackAvatar}
              sx={{ mr: 1.5, cursor: 'pointer' }}
              onClick={() => handleViewProfile(post.teacherId)}
            />
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 'bold', cursor: 'pointer', color: theme.palette.primary.main }}
                  onClick={() => handleViewProfile(post.teacherId)}
                  noWrap
                >
                  {post.name}
                </Typography>
                {isAdmin && <Chip size="small" label="Admin" color="error" variant="outlined" />}
                {isAssociate && <Chip size="small" label="College Associate" color="secondary" variant="outlined" />}
              </Box>
              <Typography variant="caption" color="textSecondary">
                {post.timestamp?.toDate?.().toLocaleString()}
              </Typography>
            </Box>
          </Box>

          <Typography sx={{ mb: 1.5, whiteSpace: 'pre-wrap' }} onClick={() => navigate(`/post/${post.id}`)} style={{ cursor: 'pointer' }}>
            {post.caption}
          </Typography>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
            {post.tags.map((tag, idx) => (
              <Chip
                key={`${post.id}-tag-${idx}`}
                label={tag}
                variant="outlined"
                sx={{ color: theme.palette.primary.main, borderColor: theme.palette.primary.main, cursor: 'pointer' }}
                onClick={() => handleTagClick(tag)}
              />
            ))}
          </Box>

          {post.fileUrl && (
            <Box sx={{ mb: 1.5 }}>
              {post.fileType?.includes('image') ? (
                <Box
                  component="img"
                  src={post.fileUrl}
                  alt="Uploaded file"
                  sx={{
                    maxWidth: { xs: '100%', md: '60%' },
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                  onClick={() => openImage(post.fileUrl)}
                />
              ) : post.fileType?.includes('video') ? (
                <ReactPlayer url={post.fileUrl} controls width="100%" height="auto" />
              ) : isPdf ? (
                <Button
                  onClick={() => openPdf(post.fileUrl, `${post.name || 'Document'}.pdf`)}
                  variant="outlined"
                  fullWidth
                  sx={{ color: theme.palette.primary.main, borderColor: theme.palette.primary.main, justifyContent: 'flex-start' }}
                  startIcon={<PictureAsPdfIcon color="error" />}
                >
                  View PDF
                </Button>
              ) : (
                <Button
                  href={post.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outlined"
                  fullWidth
                  sx={{ color: theme.palette.primary.main, borderColor: theme.palette.primary.main }}
                >
                  <AttachFileIcon sx={{ mr: 1 }} />
                  Download File
                </Button>
              )}
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <Tooltip title={post.likes.includes(userInfo.uid) ? 'Unlike' : 'Like'}>
              <IconButton onClick={() => handleLike(post.id)} size="small">
                <FavoriteIcon fontSize="small" color={post.likes.includes(userInfo.uid) ? 'error' : 'inherit'} />
              </IconButton>
            </Tooltip>
            <Typography variant="body2" sx={{ mr: 1 }}>{post.likes.length}</Typography>

            <Tooltip title="Direct Message">
              <Button onClick={() => initiateChat(post.teacherId)} backgroundColor="transparent" sx={{ textTransform: 'none', color: theme.palette.text.secondary, borderRadius: 2,}}>
              
                <MessageIcon fontSize="small" />
              
              </Button>
            </Tooltip>

            {post.teacherId === userInfo.uid && (
              <Box sx={{ ml: 'auto' }}>
                <IconButton onClick={() => handleEditPost(post)} size="small"><EditIcon fontSize="small" sx={{ color: theme.palette.info.main }} /></IconButton>
                <IconButton onClick={() => handleDeletePost(post.id)} disabled={deleting} size="small"><DeleteIcon fontSize="small" sx={{ color: theme.palette.error.main }} /></IconButton>
              </Box>
            )}
          </Box>

          <Divider sx={{ my: 1 }} />
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>Comments</Typography>
            <Box sx={{ maxHeight: '150px', overflowY: 'auto', p: 0.5 }}>
              {post.comments.length > 0 ? (
                post.comments.map((comment, idx) => (
                  <Box key={`${post.id}-comment-${idx}`} sx={{ display: 'flex', alignItems: 'flex-start', mb: 1 }}>
                    <Avatar src={comment.profilePic || fallbackAvatar} sx={{ width: 24, height: 24, mr: 1 }} />
                    <Box>
                      <Typography variant="caption" fontWeight="bold">{comment.name}</Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{comment.text}</Typography>
                    </Box>
                  </Box>
                ))
              ) : (
                <Typography variant="body2" color="textSecondary">No comments yet.</Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', mt: 1 }}>
              <TextField
                fullWidth
                variant="outlined"
                size="small"
                placeholder="Add a comment..."
                value={newComment[post.id] || ''}
                onChange={(e) => setNewComment(prev => ({ ...prev, [post.id]: e.target.value }))}
                onKeyPress={(e) => e.key === 'Enter' && handleCommentSubmit(post.id)}
              />
              <IconButton onClick={() => handleCommentSubmit(post.id)} color="primary">
                <SendIcon />
              </IconButton>
            </Box>
          </Box>
        </Card>
      </motion.div>
    );
  };

  if (loading || !userInfo) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Build messages for MessageBox
  const partner = allUsers.find(u => u.uid === selectedChat?.recipientId);
  const messagesForBox = chatMessages.map(m => ({
    id: m.id,
    sender: m.senderId,
    text: m.text,
    fileUrl: m.fileUrl || '',
    fileType: m.fileType || '',
    fileName: m.fileName || '',
    timestamp: m.timestamp,
  }));

  // Teacher search
  const handleTeacherSearch = () => {
    const term = teacherSearchTerm.trim().toLowerCase();
    if (!term) {
      setTeacherSearchResult(null);
      return;
    }
    const match = allUsers.find(u => u.fullName?.toLowerCase().includes(term));
    setTeacherSearchResult(match || null);
  };

  return (
    <Box sx={{ minHeight: '100vh', background: theme.palette.background.default, p: { xs: 0, md: 4 } }}>
      <Grid container spacing={3}>
        {/* Left DM list on desktop */}
        {!isMobile && (
          <Grid item xs={12} md={3}>
            <Box sx={{ position: 'sticky', top: 24, height: 'calc(100vh - 48px)', width: "20vw" }}>
              <Paper sx={{ p: 3, borderRadius: 2, boxShadow: '0 8px 16px rgba(0, 0, 0, 0.1)', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" sx={{ color: theme.palette.primary.main, fontWeight: 'bold', mb: 2 }}>
                  Direct Messages
                </Typography>
                <List sx={{ flexGrow: 1, overflowY: 'auto' }}>
                  {recentChats.map(chat => {
                    const otherParticipantId = chat.participants.find(id => id !== userInfo.uid);
                    const otherUser = allUsers.find(t => t.uid === otherParticipantId);
                    if (!otherUser) return null;
                    const unread = chatMessages.filter(msg => msg.senderId === otherParticipantId && !msg.seen).length;
                    return (
                      <ListItem key={chat.id} disablePadding sx={{ borderRadius: 1 }}>
                        <ListItemButton
                          onClick={() => initiateChat(otherParticipantId)}
                          sx={{ '&:hover': { backgroundColor: theme.palette.action.hover }, borderRadius: 1 }}
                        >
                          <ListItemAvatar>
                            <Avatar src={otherUser.profilePicUrl || fallbackAvatar} />
                          </ListItemAvatar>
                          <ListItemText primary={otherUser.fullName} secondary={chat.lastMessage} />
                          {unread > 0 && (
                            <Badge badgeContent={unread} color="error" />
                          )}
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </List>
              </Paper>
            </Box>
          </Grid>
        )}

        {/* Main content */}
        <Grid item xs={12} md={6}>
          <Paper
            sx={{
              p: { xs: 1.5, md: 3 },
              borderRadius: { xs: 0, md: 2 },
              width: { xs: "100vw", md: "69vw" },
              ml: { xs: 0, md: 3 },
              boxShadow: '0 8px 16px rgba(0, 0, 0, 0.1)',
              mb: 3,
            }}
          >
            {/* Header row: title left, search right; on mobile, title then search+filters below */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: { xs: 1, md: 2 } }}>
              <Typography variant="h4" sx={{ color: theme.palette.primary.main, fontWeight: 'bold' }}>
                Faculty Collaboration Hub
              </Typography>

              {!isMobile && (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 320 }}>
                  <TextField
                    size="small"
                    placeholder="Search teacher..."
                    value={teacherSearchTerm}
                    onChange={(e) => setTeacherSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleTeacherSearch()}
                    fullWidth
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton color="primary" onClick={handleTeacherSearch}><SearchIcon /></IconButton>
                        </InputAdornment>
                      )
                    }}
                  />
                </Stack>
              )}
            </Box>

            {isMobile && (
              <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                <TextField
                  size="small"
                  placeholder="Search teacher..."
                  value={teacherSearchTerm}
                  onChange={(e) => setTeacherSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTeacherSearch()}
                  fullWidth
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton color="primary" onClick={handleTeacherSearch}><SearchIcon /></IconButton>
                      </InputAdornment>
                    )
                  }}
                />
                <Button
                  size="small"
                  startIcon={<FilterListIcon />}
                  variant="outlined"
                  onClick={() => setMobileFiltersOpen(v => !v)}
                >
                  Filters
                </Button>
              </Stack>
            )}

            {/* Filters: mobile toggle panel, desktop always below header */}
            {isMobile ? (
              mobileFiltersOpen && (
                <Box sx={{ mb: 2 }}>
                  {renderFilters({ showClear: true })}
                  <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1 }}>
                    <Button variant="text" onClick={handleClearFilters}>Clear</Button>
                    <Button variant="contained" onClick={() => setMobileFiltersOpen(false)}>Apply</Button>
                  </Stack>
                </Box>
              )
            ) : (
              renderFilters({ showClear: true })
            )}

            {/* When searching, replace feed with profile + posts */}
            {teacherSearchResult ? (
              <Box sx={{ mt: 1 }}>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5 }}>
                  <Avatar src={teacherSearchResult.profilePicUrl || fallbackAvatar} />
                  <Box>
                    <Typography fontWeight="bold">{teacherSearchResult.fullName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {teacherSearchResult.college || teacherSearchResult.role || '—'}
                    </Typography>
                  </Box>
                  <Box sx={{ ml: 'auto' }}>
                    <Tooltip title="View Profile">
                      <IconButton onClick={() => handleViewProfile(teacherSearchResult.uid)}>
                        <VisibilityIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Direct Message">
                      <IconButton onClick={() => initiateChat(teacherSearchResult.uid)}>
                        <MessageIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Stack>
                <Divider sx={{ mb: 1.5 }} />
                {teacherPosts.length > 0 ? (
                  teacherPosts.map(post => renderPost(post))
                ) : (
                  <Alert severity="info">No posts by this teacher.</Alert>
                )}
              </Box>
            ) : (
              <>
                {filteredPosts.length > 0 ? (
                  filteredPosts.map(post => renderPost(post))
                ) : (
                  <Alert severity="info">No posts match your filters.</Alert>
                )}
              </>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Mobile fixed DM button and Create Post button*/}
      {isMobile && (
        <Box sx={{
          position: 'fixed',
          bottom: 20,
          left: 20,
          zIndex: 100,
          display: 'flex',
          flexDirection: 'row',
          gap: 2,
          width: 'calc(100vw - 40px)',
          justifyContent: 'space-between'
        }}>
          <Tooltip title="Create Post">
            <IconButton onClick={() => setCreatePostOpen(true)} color="primary" sx={{
              width: 56,
              height: 56,
              bgcolor: 'background.paper',
              boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
              transition: 'transform 0.3s ease-in-out',
              '&:hover': { transform: 'scale(1.08)' }
            }}>
              <AddIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="Direct Messages">
            <IconButton onClick={() => setDmDrawerOpen(true)} color="primary" sx={{
              width: 56,
              height: 56,
              bgcolor: 'background.paper',
              boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
              transition: 'transform 0.3s ease-in-out',
              '&:hover': { transform: 'scale(1.08)' }
            }}>
              <ChatIcon />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* Desktop/laptop Create Post floating button bottom-right */}
      {!isMobile && (
        <Box sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 100
        }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreatePostOpen(true)}
            sx={{
              borderRadius: 999,
              px: 2.5,
              py: 1,
              backgroundColor: theme.palette.success.main,
              '&:hover': { backgroundColor: theme.palette.success.dark }
            }}
          >
            Create Post
          </Button>
        </Box>
      )}

      {/* Mobile DM Drawer with search */}
      <Drawer
        anchor="left"
        open={dmDrawerOpen}
        onClose={() => setDmDrawerOpen(false)}
        sx={{
          '& .MuiDrawer-paper': {
            width: '100%',
            maxWidth: 420,
            boxSizing: 'border-box',
          },
        }}
      >
        <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>Direct Messages</Typography>
            <IconButton onClick={() => setDmDrawerOpen(false)}><CloseIcon /></IconButton>
          </Toolbar>
        </AppBar>
        <Box sx={{ p: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search teacher..."
            value={dmSearchTerm}
            onChange={(e) => setDmSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              )
            }}
            sx={{ mb: 2 }}
          />

          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>Your Chats</Typography>
          <List dense sx={{ maxHeight: '40vh', overflowY: 'auto', mb: 2 }}>
            {filteredRecentChats.map(chat => {
              const otherId = chat.participants.find(id => id !== userInfo.uid);
              const other = allUsers.find(u => u.uid === otherId);
              if (!other) return null;
              const unread = chatMessages.filter(msg => msg.senderId === otherId && !msg.seen).length;
              return (
                <ListItem key={chat.id} disablePadding>
                  <ListItemButton onClick={() => { setDmDrawerOpen(false); initiateChat(otherId); }}>
                    <ListItemAvatar>
                      <Avatar src={other.profilePicUrl || fallbackAvatar} />
                    </ListItemAvatar>
                    <ListItemText primary={other.fullName} secondary={chat.lastMessage} />
                    {unread > 0 && <Badge badgeContent={unread} color="error" />}
                  </ListItemButton>
                </ListItem>
              );
            })}
            {filteredRecentChats.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
                No chats found.
              </Typography>
            )}
          </List>

          <Divider sx={{ my: 1.5 }} />
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>Start New Chat</Typography>
          <List dense sx={{ maxHeight: '30vh', overflowY: 'auto' }}>
            {userSearchResults.map(u => (
              <ListItem key={u.uid} disablePadding>
                <ListItemButton onClick={() => { setDmDrawerOpen(false); initiateChat(u.uid); }}>
                  <ListItemAvatar>
                    <Avatar src={u.profilePicUrl || fallbackAvatar} />
                  </ListItemAvatar>
                  <ListItemText primary={u.fullName} secondary={u.college || u.role} />
                </ListItemButton>
              </ListItem>
            ))}
            {dmSearchTerm && userSearchResults.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
                No users found.
              </Typography>
            )}
          </List>
        </Box>
      </Drawer>

      {/* Create Post Modal */}
      <Modal open={createPostOpen} onClose={() => setCreatePostOpen(false)}>
        <Box sx={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: { xs: '95vw', sm: 520 },
          bgcolor: 'background.paper',
          boxShadow: 24,
          p: 3,
          borderRadius: 2
        }}>
          <Typography variant="h6" sx={{ color: theme.palette.text.primary, mb: 2 }}>
            Create a Post
          </Typography>
          <TextField
            label="Caption"
            multiline
            rows={3}
            fullWidth
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Tags (e.g., #first #academic)"
            fullWidth
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Visibility</InputLabel>
            <Select
              value={visibility}
              label="Visibility"
              onChange={(e) => setVisibility(e.target.value)}
            >
              <MenuItem value="Public">Public</MenuItem>
              <MenuItem value="My College">My College</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
            <Button
              variant="outlined"
              component="label"
              startIcon={<UploadFileIcon />}
              sx={{ color: theme.palette.primary.main, borderColor: theme.palette.primary.main }}
            >
              Choose File
              <input type="file" hidden onChange={(e) => setFile(e.target.files && e.target.files)} />
            </Button>
            {file && <Chip label={file.name} onDelete={() => setFile(null)} />}
            <Box sx={{ ml: 'auto' }} />
            <Button
              variant="contained"
              onClick={handlePostSubmit}
              disabled={posting || (!caption && !file)}
              sx={{
                backgroundColor: theme.palette.success.main,
                '&:hover': { backgroundColor: theme.palette.success.dark }
              }}
            >
              {posting ? <CircularProgress size={20} color="inherit" /> : 'Post'}
            </Button>
          </Box>
        </Box>
      </Modal>

      {/* Profile modal */}
      <Modal open={profileModalOpen && selectedProfile} onClose={() => setProfileModalOpen(false)}>
        <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: { xs: '90%', sm: 500 }, bgcolor: 'background.paper', boxShadow: 24, p: 4, borderRadius: 2, maxHeight: '80vh', overflowY: 'auto' }}>
          <Box sx={{ textAlign: 'center', mb: 2 }}>
            <Avatar src={selectedProfile?.profilePicUrl || fallbackAvatar} sx={{ width: 150, height: 150, margin: '0 auto', cursor: 'pointer' }} onClick={() => setEnlargedPicOpen(true)} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1, textAlign: 'center' }}>
            {selectedProfile?.firstName} {selectedProfile?.lastName}
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 1 }}>
            {selectedProfile?.role && <Chip label={selectedProfile.role} color="primary" />}
            {selectedProfile?.isCollegeAssociate && <Chip label="College Associate" color="secondary" />}
          </Box>
          <Divider sx={{ my: 2 }} />
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle1" fontWeight="bold">College:</Typography>
              <Typography>{selectedProfile?.college || 'N/A'}</Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle1" fontWeight="bold">Email:</Typography>
              <Typography>{selectedProfile?.email || 'N/A'}</Typography>
            </Grid>
          </Grid>
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-around' }}>
            <Button variant="contained" onClick={() => initiateChat(selectedProfile.uid)}>
              <MessageIcon sx={{ mr: 1 }} /> DM
            </Button>
          </Box>
          <IconButton onClick={() => setProfileModalOpen(false)} sx={{ position: 'absolute', top: 8, right: 8 }}><CloseIcon /></IconButton>
        </Box>
      </Modal>

      {/* Enlarged profile pic */}
      <Modal open={enlargedPicOpen} onClose={() => setEnlargedPicOpen(false)}>
        <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'auto', minWidth: '90vw', maxWidth: '95vw', maxHeight: '90vh', bgcolor: 'background.paper', boxShadow: 24, p: 2, borderRadius: 2 }}>
          <img src={selectedProfile?.profilePicUrl || fallbackAvatar} alt="Enlarged Profile" style={{ maxWidth: '100%', maxHeight: '80vh', display: 'block' }} />
          <IconButton onClick={() => setEnlargedPicOpen(false)} sx={{ position: 'absolute', top: 8, right: 8, color: 'white', bgcolor: 'rgba(0,0,0,0.5)' }}><CloseIcon /></IconButton>
        </Box>
      </Modal>

      {/* Post image full-screen viewer via reusable component */}
      <ImageViewer
        open={imageOpen}
        src={imageUrl}
        alt="Preview"
        onClose={() => setImageOpen(false)}
        centered
        maxWidth="100%"
        maxHeight="100vh"
        minWidth={{xs:'100%', md:'70%'}}
        iMaxHeight='100%'
        top="50%"
        left="50%"
        right=''
        bottom=''
        transform="translate(-50%, -50%)"
        boxShadow ={24}
        borderRadius={2}
        padding={4}
        showBackdrop
        showClose
        showDownload={false}
      />

      {/* Post PDF full-screen viewer */}
      <Modal open={pdfOpen} onClose={() => setPdfOpen(false)}>
        <Box sx={{
          position: 'absolute',
          top: 0, left: 0,
          width: '100vw',
          height: '100vh',
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
            <PictureAsPdfIcon color="error" />
            <Typography variant="subtitle1" fontWeight="bold" noWrap sx={{ flexGrow: 1 }}>
              {pdfName || 'Document.pdf'}
            </Typography>
            {pdfUrl && (
              <Tooltip title="Download">
                <IconButton component="a" href={pdfUrl} target="_blank" rel="noopener noreferrer">
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
            )}
            <IconButton onClick={() => setPdfOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
          <Box sx={{ flexGrow: 1, minHeight: 0, p: { xs: 1, sm: 2 } }}>
            {pdfUrl && <PdfViewer fileUrl={pdfUrl} />}
          </Box>
        </Box>
      </Modal>

      {/* Edit post */}
      <Modal open={editModalOpen} onClose={() => { setEditModalOpen(false); setEditPost(null); }}>
        <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: { xs: '90%', sm: 400 }, bgcolor: 'background.paper', boxShadow: 24, p: 4, borderRadius: 2 }}>
          <Typography variant="h6" sx={{ color: theme.palette.text.primary, mb: 2 }}>Edit Post</Typography>
          <TextField
            label="Caption"
            multiline rows={3} fullWidth value={editCaption} onChange={(e) => setEditCaption(e.target.value)} sx={{ mb: 2 }}
          />
          <TextField
            label="Tags (e.g., #first)"
            fullWidth value={editTags} onChange={(e) => setEditTags(e.target.value)} sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <Button variant="contained" onClick={handleSaveEdit} disabled={editing} sx={{ flexGrow: 1 }}>
              {editing ? <CircularProgress size={24} /> : 'Save'}
            </Button>
            <Button variant="outlined" onClick={() => { setEditModalOpen(false); setEditPost(null); }} sx={{ flexGrow: 1 }}>
              Cancel
            </Button>
          </Box>
          <IconButton onClick={() => setEditModalOpen(false)} sx={{ position: 'absolute', top: 8, right: 8 }}><CloseIcon /></IconButton>
        </Box>
      </Modal>

      {/* DM modal using MessageBox */}
      <Modal open={dmModalOpen && !!selectedChat} onClose={() => setDmModalOpen(false)}>
        <Box
          sx={{
            position: 'absolute',
            top: isMobile ? 0 : '50%',
            left: isMobile ? 0 : '50%',
            transform: isMobile ? 'none' : 'translate(-50%, -50%)',
            width: isMobile ? '100vw' : { xs: '90%', sm: 560, md: "60vw" },
            height: isMobile ? '100vh' : '90vh',
            bgcolor: 'background.paper',
            boxShadow: 24,
            borderRadius: isMobile ? 0 : 2,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5,
            borderBottom: `1px solid ${theme.palette.divider}`, position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.paper'
          }}>
            {isMobile ? (
              <>
                <IconButton onClick={() => setDmModalOpen(false)}><ArrowBackIcon /></IconButton>
                <Avatar
                  src={partner?.profilePicUrl || fallbackAvatar}
                  sx={{ cursor: 'pointer' }}
                  onClick={() => {
                    if (partner?.profilePicUrl) {
                      setImageUrl(partner.profilePicUrl);
                      setImageOpen(true);
                    }
                  }}
                />
                <Typography
                  variant="subtitle1"
                  fontWeight="bold"
                  noWrap
                  sx={{ flexGrow: 1, cursor: 'pointer' }}
                  onClick={() => partner?.uid && handleViewProfile(partner.uid)}
                >
                  {partner?.fullName || 'Chat'}
                </Typography>
              </>
            ) : (
              <>
                <Avatar
                  src={partner?.profilePicUrl || fallbackAvatar}
                  sx={{ cursor: 'pointer' }}
                  onClick={() => {
                    if (partner?.profilePicUrl) {
                      setImageUrl(partner.profilePicUrl);
                      setImageOpen(true);
                    }
                  }}
                />
                <Typography
                  variant="subtitle1"
                  fontWeight="bold"
                  noWrap
                  sx={{ flexGrow: 1, cursor: 'pointer' }}
                  onClick={() => partner?.uid && handleViewProfile(partner.uid)}
                >
                  {partner?.fullName || 'Chat'}
                </Typography>
                <IconButton onClick={() => setDmModalOpen(false)}><CloseIcon /></IconButton>
              </>
            )}
          </Box>

          {/* MessageBox */}
          <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex' }}>
            <MessageBox
              // messages
              messages={messagesForBox}
              inputValue={newMessage}
              setInputValue={setNewMessage}
              onSendMessage={handleSendMessage}

              // state
              disabled={false}
              loading={false}
              sending={sending}
              isTicketOpen={true}

              // upload config
              allowFileUpload={true}
              acceptedFileTypes="image/*,application/pdf,video/*"
              maxFileSizeMB={10}
              onFileUpload={(f) => setChatFile(f)}
              selectedFile={chatFile}
              onClearSelectedFile={() => setChatFile(null)}

              // roles/colors
              userRole={userInfo.uid}
              senderColor={theme.palette.primary.main}
              senderTextColor={theme.palette.primary.contrastText}
              receiverColor={theme.palette.grey}
              receiverTextColor={theme.palette.text.primary}

              // layout
              containerHeight="100%"
              containerMaxWidth="100%"
              containerMinWidth="100%"
              messagesMaxWidth="75%"
              messagesContainerWidth="100%"
              selfRadius="18px 18px 4px 18px"
              otherRadius="18px 18px 18px 4px"
              contentPadding={{ xs: 1.5, sm: 2 }}
              inputMinWidth={{ xs: '100%', md: '100%' }}

              showTimestamps={true}
            />
          </Box>
        </Box>
      </Modal>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default FacultySpace;
