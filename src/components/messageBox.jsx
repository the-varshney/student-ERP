/* eslint-disable react/prop-types */
import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  IconButton,
  CircularProgress,
  Alert,
  Input,
  Button,
  Stack,
  Dialog,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import {
  Send as SendIcon,
  AttachFile as AttachFileIcon,
  PictureAsPdf as PictureAsPdfIcon,
  InsertDriveFile as FileIcon,
  OpenInNew as OpenInNewIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import { motion } from "framer-motion";
import PdfViewer from "./PdfViewer";
import ImageViewer from "./ImageViewer";

const formatDate = (timestamp) => {
  if (!timestamp?.toDate) return "Just now";
  const date = timestamp.toDate();
  const now = new Date();
  const diff = (now.getTime() - date.getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const PdfTile = ({ fileName, onOpen }) => {
  return (
    <Paper
      variant="outlined"
      onClick={onOpen}
      sx={{
        mt: 1,
        p: 1.25,
        display: "flex",
        alignItems: "center",
        gap: 1,
        maxWidth: 420,
        borderRadius: 2,
        cursor: "pointer",
        bgcolor: "background.paper",
        borderColor: "divider",
      }}
    >
      <PictureAsPdfIcon color="error" />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap title={fileName || "Document.pdf"}>
          {fileName || "Document.pdf"}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          PDF • Click to open
        </Typography>
      </Box>
      <OpenInNewIcon fontSize="small" color="action" />
    </Paper>
  );
};

const ImagePreview = ({ fileUrl, fileName, onOpen }) => (
  <Box
    sx={{
      mt: 1,
      borderRadius: 2,
      overflow: "hidden",
      width: "100%",
      maxWidth: 360,
      cursor: "pointer",
      border: "1px solid",
      borderColor: "divider",
    }}
    onClick={onOpen}
  >
    <Box
      component="img"
      src={fileUrl}
      alt={fileName || "image"}
      sx={{
        display: "block",
        width: "100%",
        height: "auto",
        maxHeight: 260,
        objectFit: "cover",
      }}
      loading="lazy"
    />
  </Box>
);

// eslint-disable-next-line no-unused-vars
const FallbackFileButton = ({ fileUrl, fileName, onOpen }) => (
  <Button
    variant="outlined"
    startIcon={<FileIcon />}
    onClick={onOpen}
    sx={{ mt: 1, textTransform: "none" }}
  >
    {fileName || "Open file"}
  </Button>
);

const MessageBox = ({
  messages = [],
  inputValue,
  setInputValue,
  onSendMessage,
  // state
  disabled = false,
  loading = false,
  sending = false,
  isTicketOpen = true,
  // upload
  allowFileUpload = false,
  acceptedFileTypes = "image/*,application/pdf", 
  maxFileSizeMB = 10,
  onFileUpload = null, 
  selectedFile = null, // file awaiting send
  onClearSelectedFile = null,

  userRole = "student",
  senderColor = "primary.main",
  senderTextColor = "primary.contrastText",
  receiverColor = "#e9f8e6",
  receiverTextColor = "text.primary",
  // layout
  containerHeight = "100%",
  containerMaxWidth = "55vw",
  containerMinWidth = "100%",
  messagesMaxWidth = "75%",
  messagesContainerWidth = "100%",
  selfRadius = "20px 20px 5px 20px",
  otherRadius = "20px 20px 20px 5px",
  contentPadding = { xs: 1, sm: 2, md: 3 },
  inputMinWidth = { xs: "100%", md: "70vw" },

  showTimestamps = true,
}) => {
  const endRef = useRef(null);
  const fileInputId = "messagebox-file-input";

  // PdfViewer
  const [pdfDialog, setPdfDialog] = useState({
    open: false,
    fileUrl: "",
    fileName: "",
  });

  // ImageViewer
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const canSend = Boolean(selectedFile || (inputValue || "").trim());

  const handleSend = () => {
    const text = (inputValue || "").trim();
    if (!selectedFile && !text) return;
    onSendMessage(text);
  };

  const handleFileChange = (e) => {
    if (!onFileUpload) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = file.size / (1024 * 1024) <= maxFileSizeMB;
    if (!ok) {
      alert(`File exceeds maximum size of ${maxFileSizeMB}MB`);
    } else {
      onFileUpload(file);
    }
    e.target.value = null;
  };

  const fileBadge =
    selectedFile &&
    `${selectedFile.name} • ${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`;

  const openPdfDialog = (url, name) =>
    setPdfDialog({ open: true, fileUrl: url, fileName: name });

  const closePdfDialog = () =>
    setPdfDialog((s) => ({ ...s, open: false }));

  return (
    <Box
      sx={{
        flexGrow: 1,
        display: "flex",
        flexDirection: "column",
        height: containerHeight,
        minHeight: 0,
        width: "100%",
        maxWidth: containerMinWidth,
        minWidth: containerMaxWidth,
      }}
    >
      {/* Messages */}
      <Box
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflowY: "auto",
          p: contentPadding,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          width: messagesContainerWidth,
        }}
      >
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {messages.map((msg) => {
              const isSelf = msg.sender === userRole;
              const isImage = msg.fileType?.startsWith("image/");
              const isPdf =
                msg.fileType === "application/pdf" ||
                /\.pdf(\?|$)/i.test(msg.fileUrl || "");
              return (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <Box
                    sx={{
                      display: "flex",
                      width: "100%",
                      justifyContent: isSelf ? "flex-end" : "flex-start",
                    }}
                  >
                    <Stack spacing={0.5} sx={{ maxWidth: messagesMaxWidth, alignItems: "stretch" }}>
                      <Paper
                        elevation={1}
                        sx={{
                          bgcolor: isSelf ? senderColor : receiverColor,
                          color: isSelf ? senderTextColor : receiverTextColor,
                          borderRadius: isSelf ? selfRadius : otherRadius,
                          px: 2,
                          py: 1.5,
                        }}
                      >
                        <Stack spacing={1}>
                          {!!msg.text && (
                            <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                              {msg.text}
                            </Typography>
                          )}

                          {msg.fileUrl && (
                            <>
                              {isImage && (
                                <ImagePreview
                                  fileUrl={msg.fileUrl}
                                  fileName={msg.fileName}
                                  onOpen={() => {
                                    setImageUrl(msg.fileUrl);
                                    setImageOpen(true);
                                  }}
                                />
                              )}

                              {isPdf && (
                                <PdfTile
                                  fileName={msg.fileName}
                                  onOpen={() => openPdfDialog(msg.fileUrl, msg.fileName)}
                                />
                              )}

                              {!isImage && !isPdf && (
                                <FallbackFileButton
                                  fileUrl={msg.fileUrl}
                                  fileName={msg.fileName}
                                  onOpen={() =>
                                    window.open(msg.fileUrl, "_blank", "noopener,noreferrer")
                                  }
                                />
                              )}
                            </>
                          )}
                        </Stack>
                      </Paper>

                      {showTimestamps && (
                        <Typography
                          variant="caption"
                          sx={{
                            opacity: 0.8,
                            px: 1,
                            textAlign: isSelf ? "right" : "left",
                          }}
                        >
                          {formatDate(msg.timestamp)}
                          {msg.isDefault ? " (Auto)" : ""}
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                </motion.div>
              );
            })}
            <div ref={endRef} />
          </>
        )}
      </Box>

      {isTicketOpen ? (
        <Box sx={{ borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
          <Stack spacing={1} sx={{ p: 2 }}>
            {/* Selected file chip (row) */}
            {selectedFile && (
              <Paper
                elevation={0}
                variant="outlined"
                sx={{
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 6,
                  alignSelf: "flex-start",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  maxWidth: "100%",
                }}
              >
                <FileIcon fontSize="small" />
                <Typography variant="body2" sx={{ maxWidth: 280 }} noWrap title={selectedFile.name}>
                  {fileBadge}
                </Typography>
                {onClearSelectedFile && (
                  <Button size="small" onClick={onClearSelectedFile}>
                    Clear
                  </Button>
                )}
              </Paper>
            )}

            {/* attach +input + send */}
            <Box sx={{ display: "flex", alignItems: "center", width: "100%", gap: 1, minWidth: inputMinWidth }}>
              {allowFileUpload && (
                <>
                  <Input
                    id={fileInputId}
                    type="file"
                    inputProps={{ accept: acceptedFileTypes }}
                    onChange={handleFileChange}
                    sx={{ display: "none" }}
                  />
                  <label htmlFor={fileInputId}>
                    <IconButton component="span">
                      <AttachFileIcon />
                    </IconButton>
                  </label>
                </>
              )}

              <TextField
                fullWidth
                variant="outlined"
                placeholder="Type your message..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={disabled || loading || sending}
                multiline
                maxRows={4}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: "20px" } }}
              />

              <IconButton
                color="primary"
                onClick={handleSend}
                disabled={!canSend || disabled || sending || loading}
                sx={{
                  bgcolor: "primary.main",
                  color: "white",
                  "&:hover": { bgcolor: "primary.dark" },
                  transition: "background-color 0.2s",
                }}
              >
                {sending ? <CircularProgress size={24} color="inherit" /> : <SendIcon />}
              </IconButton>
            </Box>
          </Stack>
        </Box>
      ) : (
        <Alert severity="info" sx={{ m: 2, borderRadius: 2, flexShrink: 0 }}>
          This ticket is closed. You can no longer send messages.
        </Alert>
      )}

      {/* Full PDF */}
      <Dialog
        open={pdfDialog.open}
        onClose={closePdfDialog}
        fullScreen
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="h6" noWrap sx={{ pr: 2 }}>
            {pdfDialog.fileName || "Document.pdf"}
          </Typography>
          <IconButton onClick={closePdfDialog}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0, height: "100%", bgcolor: "#f0f2f5" }}>
          {pdfDialog.fileUrl && (
            <PdfViewer
              fileUrl={pdfDialog.fileUrl}
              downloadable
              downloadFileName={pdfDialog.fileName || "Document.pdf"}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Full Image Viewer*/}
      <ImageViewer
        open={imageOpen}
        src={imageUrl}
        alt="Preview"
        onClose={() => setImageOpen(false)}
        // defaults chosen to match existing visuals
        centered
        maxWidth="100%"
        maxHeight="100vh"
        minWidth={{ xs: "100%", md: "70%" }}
        iMaxHeight="100%"
        top="50%"
        left="50%"
        right=""
        bottom=""
        transform="translate(-50%, -50%)"
        boxShadow={24}
        borderRadius={2}
        padding={4}
        showBackdrop
        showClose
        showDownload={true}
      />
    </Box>
  );
};

export default MessageBox;
