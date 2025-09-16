import React from "react";
import PropTypes from "prop-types";
import {
  Card,
  CardContent,
  Grid,
  Stack,
  Box,
  Avatar,
  Typography,
  IconButton,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import PersonIcon from "@mui/icons-material/Person";

const FlexHeaderCard = ({
  // profile pic
  avatarSrc,
  avatarAlt = "Profile",
  avatarFallbackIcon = <PersonIcon fontSize="large" />,
  avatarSx,

  // Title and multi-line texts with icons
  title,
  titleProps,
  texts = [], // format: [{ icon: <EmailIcon/>, text: 'text', textProps: { ... }, sx: { ... } }, ...]
  textDirection = { xs: "column", sm: "row" },
  textSpacing = 3,

  showBack = false,
  onBack,
  backButtonProps = {},
  logo, // <Avatar src={Url} />
  leftExtras = [],
  rightExtras = [],

  containerGridProps = {},
  leftGridProps = { item: true },
  centerGridProps = { item: true },
  rightGridProps = { item: true },

  // Card
  sx,
  cardProps,
  cardContentProps,

  // Default colors
  bgcolor = "primary.main",
  color = "white",
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const hasDefaultGradient = Boolean(theme?.custom?.gradient);
  const purpleGradient = "linear-gradient(45deg, #5E35B1 30%, #4527A0 90%)";

  let cardColor = color;
  let cardBgStyles = {};
  let cardBorder = undefined;
  let avatarBorder = undefined;
  let avatarBg = undefined;
  let backBtnStyles = {};
  let contentColor = undefined;

  if (hasDefaultGradient) {
    cardBgStyles.backgroundImage = theme.custom.gradient;
    cardColor = "#fff";
    contentColor = "#fff";
    avatarBorder = "3px solid rgba(255,255,255,0.85)";
    avatarBg = "transparent";
    backBtnStyles = {
      bgcolor: "rgba(255,255,255,0.15)",
      color: "#fff",
      "&:hover": { bgcolor: "rgba(255,255,255,0.25)" },
    };
  } else if (isDark) {
    // Dark theme
    cardBgStyles.backgroundImage = purpleGradient;
    cardColor = "#fff";
    contentColor = "#fff";
    avatarBorder = "3px solid rgba(255,255,255,0.9)";
    avatarBg = "transparent";
    backBtnStyles = {
      bgcolor: "rgba(255,255,255,0.15)",
      color: "#fff",
      "&:hover": { bgcolor: "rgba(255,255,255,0.25)" },
    };
  } else {
    // Light theme: paper bg + border
    cardBgStyles.backgroundColor = theme.palette.background.paper;
    cardColor = theme.palette.text.primary;
    contentColor = "inherit";
    cardBorder = `1px solid ${theme.palette.divider}`;
    avatarBorder = `2px solid ${theme.palette.divider}`;
    avatarBg = theme.palette.background.default;
    backBtnStyles = {
      bgcolor: "rgba(0,0,0,0.04)",
      color: theme.palette.primary.main,
      "&:hover": { bgcolor: "rgba(0,0,0,0.08)" },
    };
  }

  return (
    <Card
      sx={{
        mb: 4,
        borderRadius: 2,
        border: cardBorder,
        bgcolor: hasDefaultGradient || isDark ? undefined : cardBgStyles.backgroundColor || bgcolor,
        color: cardColor,
        backgroundImage: cardBgStyles.backgroundImage,
        ...sx,
      }}
      {...cardProps}
    >
      <CardContent {...cardContentProps}>
        <Grid
          container
          spacing={3}
          justifyContent="flex-start"  
          sx={{ width: "100%", m: 0 }}
          {...containerGridProps}
        >
          {/* Left: Back + Logo + Avatar + Extras */}
          <Grid {...leftGridProps}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              {showBack && (
                <IconButton
                  onClick={onBack}
                  size="small"
                  sx={backBtnStyles}
                  {...backButtonProps}
                >
                  <ArrowBackIosNewIcon fontSize="small" />
                </IconButton>
              )}

              {logo ? logo : null}
              <Avatar
                src={avatarSrc}
                alt={avatarAlt}
                sx={{
                  width: 80,
                  height: 80,
                  bgcolor: avatarBg ?? "white",
                  color: "primary.main",
                  border: avatarBorder,
                  ...(avatarSx || {}),
                }}
              >
                {avatarFallbackIcon}
              </Avatar>

              {Array.isArray(leftExtras) && leftExtras.length > 0 ? (
                <Stack direction="row" spacing={1} alignItems="center">
                  {leftExtras.map((node, i) => (
                    <Box key={i}>{node}</Box>
                  ))}
                </Stack>
              ) : null}
            </Stack>
          </Grid>

          {/* Center: Title + Multi-line Texts */}
          <Grid {...centerGridProps}>
            {!!title && (
              <Typography variant="h5" fontWeight="bold" color={contentColor} {...titleProps}>
                {title}
              </Typography>
            )}
            {Array.isArray(texts) && texts.length > 0 && (
              <Stack direction={textDirection} spacing={textSpacing} sx={{ mt: 1, flexWrap: "wrap" }}>
                {texts.map((row, idx) => {
                  const { icon, text, textProps: tProps, sx: rowSx } = row || {};
                  return (
                    <Box
                      key={idx}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        color: contentColor,
                        "& svg": { color: contentColor },
                        ...rowSx,
                      }}
                    >
                      {icon ? icon : null}
                      <Typography variant="body1" color={contentColor} {...tProps}>
                        {text}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Grid>

          {/* Right*/}
          {Array.isArray(rightExtras) && rightExtras.length > 0 ? (
            <Grid {...rightGridProps}>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end" sx={{ height: "100%" }}>
                {rightExtras.map((node, i) => (
                  <Box key={i}>{node}</Box>
                ))}
              </Stack>
            </Grid>
          ) : null}
        </Grid>
      </CardContent>
    </Card>
  );
};

FlexHeaderCard.propTypes = {
  avatarSrc: PropTypes.string,
  avatarAlt: PropTypes.string,
  avatarFallbackIcon: PropTypes.node,
  avatarSx: PropTypes.object,
  title: PropTypes.node,
  titleProps: PropTypes.object,
  texts: PropTypes.arrayOf(
    PropTypes.shape({
      icon: PropTypes.node,
      text: PropTypes.node,
      textProps: PropTypes.object,
      sx: PropTypes.object,
    })
  ),
  textDirection: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  textSpacing: PropTypes.oneOfType([PropTypes.number, PropTypes.object]),
  showBack: PropTypes.bool,
  onBack: PropTypes.func,
  backButtonProps: PropTypes.object,
  logo: PropTypes.node,
  leftExtras: PropTypes.arrayOf(PropTypes.node),
  rightExtras: PropTypes.arrayOf(PropTypes.node),
  containerGridProps: PropTypes.object,
  leftGridProps: PropTypes.object,
  centerGridProps: PropTypes.object,
  rightGridProps: PropTypes.object,
  sx: PropTypes.object,
  cardProps: PropTypes.object,
  cardContentProps: PropTypes.object,
  bgcolor: PropTypes.any,
  color: PropTypes.any,
};

export default FlexHeaderCard;
