import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import EditLoaPage from './pages/EditLoaPage.jsx';
import LoaDetailsPage from './pages/LoaDetailsPage.jsx';
import LoaListPage from './pages/LoaListPage.jsx';
import UploadLoaPage from './pages/UploadLoaPage.jsx';
import React from 'react';

const App = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/upload" replace />} />
        <Route path="/upload" element={<UploadLoaPage />} />
        <Route path="/loa" element={<LoaListPage />} />
        <Route path="/loa/:id" element={<LoaDetailsPage />} />
        <Route path="/loa/:id/edit" element={<EditLoaPage />} />
        <Route path="*" element={<Navigate to="/upload" replace />} />
      </Route>
    </Routes>
  );
};

export default App;
