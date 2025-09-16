/* eslint-disable react/prop-types */
import React from "react";
import { Container, Tabs, Tab, Box, Stack, useTheme,
        } from "@mui/material";
import LibraryBrowser from "../students/library";
import EResourcesViewer from "../students/Eresources";
import ENotesViewer from "../students/notes";
import SecondaryHeader from "../../components/secondaryHeader";
import { HeaderBackButton } from "../../components/header";
import { ThemeContext } from "../../context/ThemeContext";

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`admin-tabpanel-${index}`}
      aria-labelledby={`admin-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index) {
  return {
    id: `admin-tab-${index}`,
    "aria-controls": `admin-tabpanel-${index}`,
  };
}

export default function UniLibrary() {
  const [value, setValue] = React.useState(0);
  const handleChange = (_e, newValue) => setValue(newValue);

  const theme = useTheme();
  const { mode } = React.useContext(ThemeContext);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background:
          mode === "default"
            ? `linear-gradient(135deg, ${theme.palette.red.main} 0%, ${theme.palette.red.focus} 100%)`
            : mode === "light"
            ? theme.palette.red.main
            : `linear-gradient(135deg, ${theme.palette.red.main} -25%, ${theme.palette.background.paper} 100%)`,
        color: theme.palette.contrastText,
        transition: "background 0.5s ease-in-out",
      }}
    >
      <Container sx={{ pt: 2 }}>
        <SecondaryHeader
          title="University Library"
          leftArea={<HeaderBackButton size="small" />}
          rightArea={
            <Tabs
              value={value}
              onChange={handleChange}
              variant="scrollable"
              scrollButtons="auto"
              aria-label="Admin content tabs"
              sx={{
                "& .MuiTab-root": { textTransform: "none", fontWeight: 600 },
                "& .MuiTabs-indicator": { height: 3 },
              }}
            >
              <Tab label="Library" {...a11yProps(0)} />
              <Tab label="E-Resources" {...a11yProps(1)} />
              <Tab label="Notes" {...a11yProps(2)} />
            </Tabs>
          }
          elevation={0}
          border
          paperSx={{
            borderRadius: 3,
            position: "relative",
            maxWidth: { md: "86vw", xs: "100vw" },
            left: { xs: 0, md: "5%" },
            top: 16,
            zIndex: 1,
            backdropFilter: "blur(6px)",
            px: 2,
            pt: 2,
          }}
        />
      </Container>

      {/* Content */}
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <TabPanel value={value} index={0}>
            <LibraryBrowser containerProps={{ sx: { py: 0 } }} />
          </TabPanel>

          <TabPanel value={value} index={1}>
            <EResourcesViewer role="generic" />
          </TabPanel>

          <TabPanel value={value} index={2}>
            <ENotesViewer role="generic" />
          </TabPanel>
        </Stack>
      </Container>
    </Box>
  );
}
