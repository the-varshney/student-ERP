import React, { useMemo, useState, useRef } from "react";
import PropTypes from "prop-types";
import { Document, Page, pdfjs } from "react-pdf";
import {
  Box,
  CircularProgress,
  Typography,
  Alert,
  Paper,
  Stack,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  Download as DownloadIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
} from "@mui/icons-material";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

const PdfViewer = ({
  fileUrl,

  downloadable = false,
  downloadFileName = "Document.pdf",
  showHeader = false,
  showFullscreenButton = false, 
  height = "80vh",
  defaultHeight = height,

  pageMaxWidth = 900,
  pageWidthPct = 0.85,
  containerSx = {},
  pageSx = {},

  renderAnnotationLayer = true,
  renderTextLayer = true,
}) => {
  const [numPages, setNumPages] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const onDocumentLoadSuccess = ({ numPages: nextNumPages }) => {
    setNumPages(nextNumPages);
    setError(null);
  };

  const onDocumentLoadError = (err) => {
    console.error("PDF Load Error:", err);
    setError("Failed to load the PDF file. It might be corrupted or inaccessible.");
  };

  const viewerRef = useRef(null);

  const enterFullscreen = () => {
    const el = viewerRef.current;
    if (!el) return;
  
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.msRequestFullscreen) el.msRequestFullscreen();
  
    setIsFullscreen(true);
  };
  
  // EXIT FULLSCREEN
  const exitFullscreen = () => {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
  
    setIsFullscreen(false);
  };
  
  // LISTEN FOR ESC KEY (for fullscreen exit)
  React.useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);  

  const loadingIndicator = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "60vh",
        gap: 2,
      }}
    >
      <CircularProgress />
      <Typography>Loading PDF...</Typography>
    </Box>
  );

  const pageWidth = useMemo(
    () => Math.min(window.innerWidth * pageWidthPct, pageMaxWidth),
    [pageMaxWidth, pageWidthPct]
  );

  return (
    <Paper
      ref={viewerRef}
      variant="outlined"
      sx={{
        position: "relative",
        width: "100%",
        height: isFullscreen ? "100vh" : defaultHeight,
        overflowY: "auto",
        borderRadius: 3,
        bgcolor: "#f0f2f5",
        border: "1px solid #e0e0e0",
        zIndex: isFullscreen ? 9999 : "auto", 
        ...containerSx,
      }}
    >
      {/* Header only */}
      {showHeader && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1,
            py: 0.5,
            position: "sticky",
            top: 0,
            zIndex: 2,
            bgcolor: "background.paper",
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
            PDF Preview
          </Typography>
          {downloadable && fileUrl && (
            <Tooltip title="Download">
              <IconButton
                component="a"
                href={fileUrl}
                download={downloadFileName}
                target="_blank"
                rel="noopener noreferrer"
                size="small"
              >
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          )}

          {/* Fullscreen Button */}
          {showFullscreenButton && (
            <Tooltip title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
              <IconButton size="small" onClick={() => setIsFullscreen((p) => !p)}>
                {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}

      {/* Floating download and full scrn button*/}
      {!showHeader && (
        <>
          {downloadable && fileUrl && (
        <Box sx={{ position: "absolute", top: 8, right: 8, zIndex: 2 }}>
          <Tooltip title="Download">
            <IconButton
              component="a"
              href={fileUrl}
              download={downloadFileName}
              target="_blank"
              rel="noopener noreferrer"
              size="small"
              sx={{ bgcolor: "background.paper" }}
            >
              <DownloadIcon />
            </IconButton>
          </Tooltip>
        </Box>
      )}

            {/*Floating Fullscreen Button */}
            {showFullscreenButton && (
            <Box sx={{ position: "absolute", top: 8, right: "4%", zIndex: 3 }}>
              <Tooltip title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
                <IconButton
                  size="small"
                  sx={{ bgcolor: "background.paper" }}
                  onClick={() => (isFullscreen ? exitFullscreen() : enterFullscreen())}
                >
                  {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </>
      )}

      <Document
        file={fileUrl}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        loading={loadingIndicator}
        error={
          <Box sx={{ p: 4 }}>
            <Alert severity="error">{error || "An unknown error occurred."}</Alert>
          </Box>
        }
      >
        <Stack spacing={2} sx={{ p: { xs: 1, sm: 2 }, alignItems: "center" }}>
          {Array.from({ length: numPages || 0 }, (_, index) => (
            <Paper component={Box} elevation={3} key={`page_${index + 1}`} sx={{ ...pageSx }}>
              <Page
                pageNumber={index + 1}
                renderAnnotationLayer={renderAnnotationLayer}
                renderTextLayer={renderTextLayer}
                width={pageWidth}
                loading=""
              />
            </Paper>
          ))}
        </Stack>
      </Document>
    </Paper>
  );
};

PdfViewer.propTypes = {
  fileUrl: PropTypes.string.isRequired,
  downloadable: PropTypes.bool,
  downloadFileName: PropTypes.string,
  showHeader: PropTypes.bool,
  showFullscreenButton: PropTypes.bool, 
  defaultHeight: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  pageMaxWidth: PropTypes.number,
  pageWidthPct: PropTypes.number,
  containerSx: PropTypes.object,
  pageSx: PropTypes.object,
  renderAnnotationLayer: PropTypes.bool,
  renderTextLayer: PropTypes.bool,
};

export default PdfViewer;