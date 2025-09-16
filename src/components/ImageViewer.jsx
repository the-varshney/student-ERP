/* eslint-disable react/prop-types */
import React from 'react';
import {
  Box,
  Modal,
  IconButton,
  Tooltip,
  Stack,
} from '@mui/material';
import {
  Close as CloseIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';

const ImageViewer = ({
  open = false,
  src = '',
  alt = 'Preview',
  onClose = () => {},
  centered = true,
  maxWidth = '95vw',
  maxHeight = '95vh',
  minWidth = 'auto',
  minHeight = 'auto',
iMaxHeight,
  bgcolor = 'background.paper',
  boxShadow,
  borderRadius = 8,
  padding = 8,
  showBackdrop = true,
  backdropProps = {},
  containerSx = {},
  top = 'auto',
    left = 'auto',
    right = 'auto',
    bottom = '',
    transform = 'none',
  // header controls
  showClose = true,
  closeIconSx = {},
  showDownload = false,
  downloadFileName = 'image',
  headerRight = null,
  headerLeft = null,
  disableEscapeKeyDown = false,
  keepMounted = false,
}) => {
  const styleCentered = centered
    ? {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }
    : {
        position: 'absolute',
        inset: 0,
      };

  return (
    <Modal
      open={open}
      onClose={onClose}
      disableEscapeKeyDown={disableEscapeKeyDown}
      keepMounted={keepMounted}
      slotProps={{
        backdrop: {
          sx: showBackdrop ? {} : { backgroundColor: 'transparent' },
          ...backdropProps,
        },
      }}
    >
      <Box
        sx={{
          ...styleCentered,
          width: 'auto',
          position: 'absolute',
          top,
          left,
          right,
          bottom,
          maxWidth,
          maxHeight,
          minWidth,
          minHeight,
          transform,
          bgcolor,
          boxShadow,
          borderRadius,
          p: padding / 8, 
          overflow: 'hidden',
          ...containerSx,
        }}
      >
        {/* Header*/}
        {(showClose || showDownload || headerLeft || headerRight) && (
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 2 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {headerLeft}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {showDownload && src && (
                <Tooltip title="Download">
                  <IconButton
                    component="a"
                    href={src}
                    download={downloadFileName}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' } }}
                  >
                    <DownloadIcon />
                  </IconButton>
                </Tooltip>
              )}
              {headerRight}
              {showClose && (
                <IconButton
                  onClick={onClose}
                  sx={{
                    bgcolor: 'rgba(0,0,0,0.5)',
                    color: 'white',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' },
                    ...closeIconSx,
                  }}
                >
                  <CloseIcon />
                </IconButton>
              )}
            </Box>
          </Stack>
        )}

        {/* Image */}
        <Box
          component="img"
          src={src}
          alt={alt}
          sx={{
            display: 'block',
            width: '100%',
            height: '100%',
            maxWidth,
            maxHeight: iMaxHeight,
            objectFit: 'contain',
            borderRadius,
            pt: showClose || showDownload || headerLeft || headerRight ? 0 : 0,
          }}
        />
      </Box>
    </Modal>
  );
};

export default ImageViewer;
