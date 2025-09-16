/* eslint-disable react/prop-types */
import React, { useMemo } from 'react';
import { Paper, useTheme } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';

const StudentsGrid = ({
  rows = [],
  columns = [],
  columnVisibilityModel = {},
  onColumnVisibilityModelChange = () => {},
  sortModel = [],
  onSortModelChange = () => {},
  columnOrder = [],
  onColumnOrderChange = () => {},
  height = 620,
  pageSizeOptions = [10, 25, 50, 100],
  initialPageSize = 25,
  getRowHeight = () => 56,
  paperSx = {},
  gridSx = {},
}) => {
  const theme = useTheme();
  const gridColumns = useMemo(
    () =>
      columns.map((c) => ({
        ...c,
        sortable: true,
        hideable: true,
        headerAlign: 'left',
        align: 'left',
      })),
    [columns]
  );
  return (
    <Paper
      elevation={0}
      sx={{
        height,
        width: '100%',
        borderRadius: 2,
        overflow: 'hidden',
        boxShadow: theme.shadows,
        border: '1px solid',
        borderColor: theme.palette.divider,
        ...paperSx,
      }}
    >
      <DataGrid
        rows={rows}
        columns={gridColumns}
        columnVisibilityModel={columnVisibilityModel}
        onColumnVisibilityModelChange={onColumnVisibilityModelChange}
        sortingMode="client"
        sortModel={sortModel}
        onSortModelChange={onSortModelChange}
        disableRowSelectionOnClick
        checkboxSelection={false}
        density="compact"
        columnOrder={columnOrder}
        onColumnOrderChange={onColumnOrderChange}
        getRowHeight={getRowHeight}
        initialState={{ pagination: { paginationModel: { pageSize: initialPageSize } } }}
        pageSizeOptions={pageSizeOptions}
        sx={{
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: theme.palette.mode === 'light' ? theme.palette.grey[100] : theme.palette.grey[900],
            color: theme.palette.text.primary,
            fontWeight: 700,
            borderBottom: '1px solid',
            borderColor: theme.palette.divider,
          },
          '& .MuiDataGrid-columnSeparator': { color: theme.palette.divider },
          '& .MuiDataGrid-row': {
            '&:nth-of-type(odd)': { backgroundColor: theme.palette.mode === 'light' ? theme.palette.grey[50] : theme.palette.grey[900] },
            '&:hover': { backgroundColor: theme.palette.action.hover },
          },
          '& .MuiDataGrid-cell': {
            borderBottom: '1px solid',
            borderColor: theme.palette.mode === 'light' ? theme.palette.grey[100] : theme.palette.grey[900],
          },
          '& .MuiDataGrid-footerContainer': {
            borderTop: '1px solid',
            borderColor: theme.palette.divider,
            bgcolor: theme.palette.mode === 'light' ? theme.palette.grey[50] : theme.palette.grey[900],
          },
          ...gridSx,
        }}
      />
    </Paper>
  );
};

export default StudentsGrid;